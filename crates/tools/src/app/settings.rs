//! Settings screen data (spec §6.7): the Python interpreter, the data
//! folder and its catalog overrides, the bundled `hedgebuddy` wheel and the
//! pip command that installs it, and the operator's editor command.

use std::path::{Path, PathBuf};

use hedgebuddy_core::python_env::launcher;
use hedgebuddy_core::{CoreError, Os};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::claude_desktop::shell_quote;
use super::home::python_status;
use super::{Bundle, PythonCache, PythonStatus};
use crate::{Context, ToolError};

/// The start of a bundled wheel's file name, before its version.
const WHEEL_PREFIX: &str = "hedgebuddy-";
/// The end of a bundled wheel's file name, after its version.
const WHEEL_SUFFIX: &str = "-py3-none-any.whl";
/// `pip_install`'s `output` is kept to this many bytes, the tail only.
const PIP_OUTPUT_CAP: usize = 64 * 1024;
/// Why a build with no bundled wheel (or one whose file is missing) can't
/// install it.
const NO_WHEEL: &str = "this build has no bundled package";

/// Arguments of `settings_overview`.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SettingsArgs {
    /// Ignore the cached Python probe and check again now, rather than
    /// reusing a result up to [`super::PYTHON_CACHE_TTL`] old (or, after a
    /// miss, up to [`super::PYTHON_MISSING_TTL`] old). This is what
    /// Settings' "Check again" does after the operator installs Python or
    /// the package.
    #[serde(default)]
    pub recheck: bool,
}

/// The bundled files [`settings_overview`] found on disk.
#[derive(Debug, Serialize, JsonSchema)]
pub struct BundleInfo {
    /// The bundled hedgebuddy command, or null.
    pub binary: Option<PathBuf>,
    /// The bundled wheel, or null.
    pub wheel: Option<PathBuf>,
    /// The wheel's version (from its file name), or null.
    pub wheel_version: Option<String>,
}

/// Result of `settings_overview`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SettingsOverview {
    /// This machine's OS (for OS-specific wording such as the default editor).
    pub os: Os,
    /// The data folder.
    pub data_dir: PathBuf,
    /// Apps whose catalog entry comes from `<data>/catalog/`, by id.
    pub catalog_overrides: Vec<String>,
    /// Why the catalog overrides could not be loaded, or null.
    pub catalog_error: Option<String>,
    /// The Python the Hedge apps use.
    pub python: PythonStatus,
    /// The pip command Install runs, as the operator would type it, or null
    /// without Python or a bundled wheel.
    pub install_command: Option<String>,
    /// The bundled files this build ships with.
    pub bundle: BundleInfo,
    /// The operator's editor command, or null for the system default (also
    /// null when `preferences_error` is set).
    pub editor_command: Option<String>,
    /// Why the preferences file could not be read, or null. Settings still
    /// loads in that case; only `editor_command` is affected.
    pub preferences_error: Option<String>,
}

/// Result of `pip_install`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct PipInstallResult {
    /// Whether pip exited 0.
    pub ok: bool,
    /// pip's exit code.
    pub exit_code: i32,
    /// The command line that ran.
    pub command: String,
    /// pip's stdout then stderr, the last 64 KiB.
    pub output: String,
    /// The hedgebuddy version installed afterwards, if any.
    pub installed: Option<String>,
}

/// The Python, the data folder, its catalog overrides, the bundled files,
/// the pip command that installs the wheel, and the editor command: one
/// call for the Settings screen (spec §6.7). A file it cannot read (the
/// catalog overrides, `preferences.json`) is reported in the matching
/// `_error` field rather than failing the whole call.
pub fn settings_overview(
    ctx: &Context,
    args: SettingsArgs,
    python: &PythonCache,
    bundle: &Bundle,
) -> Result<SettingsOverview, ToolError> {
    if args.recheck {
        python.invalidate();
    }
    let host = ctx.hedge.host();
    let python = python_status(python.get(host)?);
    let bundle = bundle_info(bundle);
    let install_command = bundle
        .wheel
        .as_deref()
        .filter(|_| python.found)
        .map(|wheel| pip_command_line(host.os(), wheel));
    let (editor_command, preferences_error) = match ctx.store.preferences() {
        Ok(p) => (p.editor_command, None),
        Err(e) => (None, Some(e.to_string())),
    };
    Ok(SettingsOverview {
        os: host.os(),
        data_dir: ctx.store.root().to_path_buf(),
        catalog_overrides: ctx.hedge.catalog().overridden().to_vec(),
        catalog_error: ctx.catalog_error.clone(),
        python,
        install_command,
        bundle,
        editor_command,
        preferences_error,
    })
}

/// Install the bundled wheel with pip, offline (`--no-index`), then
/// invalidate the Python cache and re-probe so `installed` (and the next
/// `home_summary`/`settings_overview`) reflect it immediately. This relies
/// on the bundled wheel declaring no dependencies (`dependencies = []` in
/// `python/pyproject.toml`): with `--no-index`, pip could not fetch any it
/// had. Takes no data-folder lock: this needs no profile and touches
/// nothing under the data folder. The Tauri crate keeps installs to one at
/// a time with an app-wide mutex, since two pip runs at once would race on
/// the same interpreter.
pub fn pip_install(
    ctx: &Context,
    python: &PythonCache,
    bundle: &Bundle,
) -> Result<PipInstallResult, ToolError> {
    let host = ctx.hedge.host();
    if python.get(host)?.is_none() {
        return Err(ToolError::new(
            "Python 3 was not found; the Hedge apps need it to run scripts",
        ));
    }
    let wheel = bundle
        .wheel
        .as_deref()
        .filter(|p| p.is_file())
        .ok_or_else(|| ToolError::new(NO_WHEEL))?;
    let os = host.os();
    let argv = pip_argv(os, wheel);
    let program = argv[0].as_str();
    let args: Vec<&str> = argv[1..].iter().map(String::as_str).collect();
    let out = host.run(program, &args).map_err(|e| {
        ToolError::new(format!(
            "couldn't start {program}: {}",
            spawn_reason(program, e)
        ))
    })?;
    let combined = join_output(&out.stdout, &out.stderr);
    python.invalidate();
    let installed = python.get(host)?.and_then(|i| i.hedgebuddy);
    Ok(PipInstallResult {
        ok: out.status == 0,
        exit_code: out.status,
        command: pip_command_line(os, wheel),
        output: cap_tail(&combined, PIP_OUTPUT_CAP),
        installed,
    })
}

/// `bundle`'s paths, keeping only those that exist, and the wheel's parsed
/// version.
fn bundle_info(bundle: &Bundle) -> BundleInfo {
    let binary = bundle.binary.as_ref().filter(|p| p.is_file()).cloned();
    let wheel = bundle.wheel.as_ref().filter(|p| p.is_file()).cloned();
    let wheel_version = wheel.as_deref().and_then(parse_wheel_version);
    BundleInfo {
        binary,
        wheel,
        wheel_version,
    }
}

/// The version in a wheel's file name
/// (`hedgebuddy-<version>-py3-none-any.whl`), or `None` when it isn't
/// shaped like one.
fn parse_wheel_version(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    let version = name
        .strip_prefix(WHEEL_PREFIX)?
        .strip_suffix(WHEEL_SUFFIX)?;
    (!version.is_empty()).then(|| version.to_owned())
}

/// The argv `pip_install` runs: `launcher(os)`, then pip's own arguments
/// (offline, without pip's own version nag), then the wheel path.
fn pip_argv(os: Os, wheel: &Path) -> Vec<String> {
    let mut argv: Vec<String> = launcher(os).into_iter().map(str::to_owned).collect();
    argv.extend(
        [
            "-m",
            "pip",
            "install",
            "--upgrade",
            "--no-index",
            "--disable-pip-version-check",
        ]
        .map(str::to_owned),
    );
    argv.push(wheel.display().to_string());
    argv
}

/// [`pip_argv`], as the operator would type it: the wheel path quoted for a
/// shell on `os` ([`shell_quote`]: single quotes on macOS, double quotes on
/// Windows) — it is only ever shown or copied, never run this way.
fn pip_command_line(os: Os, wheel: &Path) -> String {
    let mut argv = pip_argv(os, wheel);
    if let Some(last) = argv.last_mut() {
        let quoted = shell_quote(os, last);
        *last = quoted;
    }
    argv.join(" ")
}

/// `stdout` and `stderr`, joined by a blank line between them when both are
/// non-empty; either alone, with no added newline; empty when both are.
fn join_output(stdout: &str, stderr: &str) -> String {
    [stdout, stderr]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// `e`'s message with its `CoreError::Host` wrapping ("host error: ") and
/// then a leading "cannot run `<program>`: " stripped, when present (both
/// `RealHost` and `FakeHost` report a spawn failure that way), so
/// `pip_install`'s own "couldn't start `<program>`: " prefix is never
/// doubled into one sentence naming the program twice.
fn spawn_reason(program: &str, e: CoreError) -> String {
    let message = e.to_string();
    let message = message.strip_prefix("host error: ").unwrap_or(&message);
    let prefix = format!("cannot run {program}: ");
    message.strip_prefix(&prefix).unwrap_or(message).to_owned()
}

/// `s`'s last `max_bytes` bytes, kept on a char boundary.
fn cap_tail(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s.to_owned();
    }
    let mut start = s.len() - max_bytes;
    while !s.is_char_boundary(start) {
        start += 1;
    }
    s[start..].to_owned()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::Arc;

    use hedgebuddy_core::host::CommandOutput;
    use hedgebuddy_core::python_env::PROBE;
    use hedgebuddy_core::{FakeHost, Os, Store};

    use super::*;
    use crate::app::checked;
    use crate::test_ctx;

    /// A probe response reporting `hedgebuddy` (or its absence).
    fn with_probe(host: FakeHost, hedgebuddy: Option<&str>) -> FakeHost {
        let pkg = hedgebuddy
            .map(|v| format!("\"{v}\""))
            .unwrap_or_else(|| "null".into());
        host.with_run_response(
            "py",
            &["-3", "-c", PROBE],
            CommandOutput {
                status: 0,
                stdout: format!(
                    "{{\"executable\": \"C:\\\\Py\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": {pkg}}}\n"
                ),
                stderr: String::new(),
            },
        )
    }

    /// A wheel file at `dir` named for `version`, written so it exists.
    fn write_wheel(dir: &Path, version: &str) -> PathBuf {
        let path = dir.join(format!("hedgebuddy-{version}-py3-none-any.whl"));
        fs::write(&path, "wheel").unwrap();
        path
    }

    fn pip_response(status: i32, stdout: &str, stderr: &str) -> CommandOutput {
        CommandOutput {
            status,
            stdout: stdout.to_owned(),
            stderr: stderr.to_owned(),
        }
    }

    /// The pip argv `pip_install` runs for `wheel`, without the program.
    fn pip_args(wheel: &str) -> [&str; 8] {
        [
            "-3",
            "-m",
            "pip",
            "install",
            "--upgrade",
            "--no-index",
            "--disable-pip-version-check",
            wheel,
        ]
    }

    #[test]
    fn overview_reports_folder_overrides_python_and_bundle() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        fs::create_dir_all(store.catalog_dir()).unwrap();
        fs::write(
            store.catalog_dir().join("offshoot.toml"),
            include_str!("../../../../catalog/offshoot.toml"),
        )
        .unwrap();
        let host = with_probe(FakeHost::new(Os::Windows), Some("0.10.0"));
        let ctx = Context::new(store, Arc::new(host));

        let wheel_dir = tempfile::tempdir().unwrap();
        let wheel = write_wheel(wheel_dir.path(), "0.11.0");
        let bundle = Bundle {
            binary: None,
            wheel: Some(wheel.clone()),
        };

        let overview = checked(
            "settings_overview",
            settings_overview(
                &ctx,
                SettingsArgs::default(),
                &PythonCache::default(),
                &bundle,
            )
            .unwrap(),
        );
        assert_eq!(overview.catalog_overrides, ["offshoot".to_owned()]);
        assert_eq!(overview.python.installed.as_deref(), Some("0.10.0"));
        assert!(overview.python.problem.is_some(), "{:?}", overview.python);
        assert_eq!(overview.bundle.wheel.as_deref(), Some(wheel.as_path()));
        assert_eq!(overview.bundle.wheel_version.as_deref(), Some("0.11.0"));
        assert_eq!(overview.preferences_error, None);
        let expected = format!(
            "py -3 -m pip install --upgrade --no-index --disable-pip-version-check \"{}\"",
            wheel.display()
        );
        assert_eq!(overview.install_command.as_deref(), Some(expected.as_str()));
    }

    #[test]
    fn overview_without_python_or_wheel() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let overview = checked(
            "settings_overview",
            settings_overview(
                &ctx,
                SettingsArgs::default(),
                &PythonCache::default(),
                &Bundle::default(),
            )
            .unwrap(),
        );
        assert!(!overview.python.found);
        assert_eq!(overview.install_command, None);
        assert_eq!(overview.bundle.wheel, None);
    }

    #[test]
    fn overview_reports_an_unreadable_preferences_file_without_failing() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        fs::create_dir_all(ctx.store.root()).unwrap();
        fs::write(ctx.store.preferences_path(), "not json {").unwrap();
        let overview = checked(
            "settings_overview",
            settings_overview(
                &ctx,
                SettingsArgs::default(),
                &PythonCache::default(),
                &Bundle::default(),
            )
            .unwrap(),
        );
        assert_eq!(overview.editor_command, None);
        assert!(overview.preferences_error.is_some());
    }

    #[test]
    fn recheck_forces_a_fresh_probe_and_a_plain_call_reuses_the_cache() {
        let host = with_probe(FakeHost::new(Os::Windows), Some("0.10.0"));
        let (_d, fake, ctx) = test_ctx(host);
        let cache = PythonCache::default();

        settings_overview(&ctx, SettingsArgs::default(), &cache, &Bundle::default()).unwrap();
        assert_eq!(fake.runs().len(), 1, "{:?}", fake.runs());

        settings_overview(&ctx, SettingsArgs::default(), &cache, &Bundle::default()).unwrap();
        assert_eq!(
            fake.runs().len(),
            1,
            "a plain call must reuse the cached probe"
        );

        settings_overview(
            &ctx,
            SettingsArgs { recheck: true },
            &cache,
            &Bundle::default(),
        )
        .unwrap();
        assert_eq!(
            fake.runs().len(),
            2,
            "recheck must invalidate the cache and probe again"
        );
    }

    #[test]
    fn pip_install_runs_the_bundled_wheel_offline() {
        let wheel_dir = tempfile::tempdir().unwrap();
        let wheel = write_wheel(wheel_dir.path(), "0.11.0");
        let wheel_str = wheel.display().to_string();
        let bundle = Bundle {
            binary: None,
            wheel: Some(wheel.clone()),
        };

        // Prime the cache from a *different* host reporting the version
        // installed before the upgrade. The pip run itself happens against a
        // second host that reports the new version, so `installed` only
        // matches 0.11.0 if `pip_install` actually invalidates the cache and
        // re-probes afterwards, rather than e.g. returning a stale value.
        let cache = PythonCache::default();
        let (_d0, _f0, ctx_before) =
            test_ctx(with_probe(FakeHost::new(Os::Windows), Some("0.10.0")));
        assert_eq!(
            cache
                .get(ctx_before.hedge.host())
                .unwrap()
                .unwrap()
                .hedgebuddy
                .as_deref(),
            Some("0.10.0")
        );

        let host = with_probe(FakeHost::new(Os::Windows), Some("0.11.0")).with_run_response(
            "py",
            &pip_args(&wheel_str),
            pip_response(0, "Successfully installed hedgebuddy-0.11.0", ""),
        );
        let (_d, fake, ctx) = test_ctx(host);
        let result = checked("pip_install", pip_install(&ctx, &cache, &bundle).unwrap());
        assert!(result.ok);
        assert_eq!(result.exit_code, 0);
        assert!(
            result.output.contains("Successfully installed"),
            "{}",
            result.output
        );
        assert_eq!(result.installed.as_deref(), Some("0.11.0"));

        let mut pip_run = vec!["py".to_owned()];
        pip_run.extend(pip_args(&wheel_str).map(str::to_owned));
        let probe: Vec<String> = ["py", "-3", "-c", PROBE]
            .into_iter()
            .map(str::to_owned)
            .collect();
        assert_eq!(
            fake.runs(),
            vec![pip_run, probe],
            "pip_install must re-probe (on its own host) after pip succeeds"
        );
    }

    #[test]
    fn pip_install_failure_is_a_result_not_an_error() {
        let wheel_dir = tempfile::tempdir().unwrap();
        let wheel = write_wheel(wheel_dir.path(), "0.11.0");
        let wheel_str = wheel.display().to_string();
        let bundle = Bundle {
            binary: None,
            wheel: Some(wheel),
        };
        let host = with_probe(FakeHost::new(Os::Windows), Some("0.10.0")).with_run_response(
            "py",
            &pip_args(&wheel_str),
            pip_response(1, "", "ERROR: could not find a version that satisfies"),
        );
        let (_d, _f, ctx) = test_ctx(host);
        let result = checked(
            "pip_install",
            pip_install(&ctx, &PythonCache::default(), &bundle).unwrap(),
        );
        assert!(!result.ok);
        assert_eq!(result.exit_code, 1);
        assert!(
            result.output.contains("could not find a version"),
            "{}",
            result.output
        );
    }

    #[test]
    fn pip_install_reports_a_spawn_failure_plainly() {
        let wheel_dir = tempfile::tempdir().unwrap();
        let wheel = write_wheel(wheel_dir.path(), "0.11.0");
        let bundle = Bundle {
            binary: None,
            wheel: Some(wheel),
        };
        // No pip run response is registered, so FakeHost::run fails as if
        // the program could not be spawned at all.
        let host = with_probe(FakeHost::new(Os::Windows), Some("0.10.0"));
        let (_d, _f, ctx) = test_ctx(host);
        let err = pip_install(&ctx, &PythonCache::default(), &bundle).unwrap_err();
        assert_eq!(err.0, "couldn't start py: not installed on this fake host");
    }

    #[test]
    fn pip_install_needs_python_and_a_wheel() {
        let wheel_dir = tempfile::tempdir().unwrap();
        let wheel = write_wheel(wheel_dir.path(), "0.11.0");
        let bundle = Bundle {
            binary: None,
            wheel: Some(wheel),
        };
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let err = pip_install(&ctx, &PythonCache::default(), &bundle).unwrap_err();
        assert!(err.0.contains("Python 3 was not found"), "{err}");

        let (_d2, _f2, ctx2) = test_ctx(with_probe(FakeHost::new(Os::Windows), None));
        let err = pip_install(&ctx2, &PythonCache::default(), &Bundle::default()).unwrap_err();
        assert!(err.0.contains("no bundled package"), "{err}");
    }

    #[test]
    fn pip_install_needs_a_wheel_file_that_actually_exists() {
        let wheel_dir = tempfile::tempdir().unwrap();
        // Named like a real wheel, but never written.
        let missing = wheel_dir.path().join("hedgebuddy-0.11.0-py3-none-any.whl");
        let bundle = Bundle {
            binary: None,
            wheel: Some(missing),
        };
        let (_d, _f, ctx) = test_ctx(with_probe(FakeHost::new(Os::Windows), Some("0.10.0")));
        let err = pip_install(&ctx, &PythonCache::default(), &bundle).unwrap_err();
        assert_eq!(err.0, NO_WHEEL);
    }

    #[test]
    fn pip_output_is_capped() {
        let wheel_dir = tempfile::tempdir().unwrap();
        let wheel = write_wheel(wheel_dir.path(), "0.11.0");
        let wheel_str = wheel.display().to_string();
        let bundle = Bundle {
            binary: None,
            wheel: Some(wheel),
        };
        let big: String = "0123456789".repeat(10 * 1024 + 1); // > 64 KiB, ASCII only
        let host = with_probe(FakeHost::new(Os::Windows), Some("0.11.0")).with_run_response(
            "py",
            &pip_args(&wheel_str),
            pip_response(0, &big, ""),
        );
        let (_d, _f, ctx) = test_ctx(host);
        let result = pip_install(&ctx, &PythonCache::default(), &bundle).unwrap();
        assert_eq!(result.output.len(), PIP_OUTPUT_CAP);
        assert!(big.ends_with(&result.output));
    }

    #[test]
    fn cap_tail_advances_past_a_split_multibyte_character() {
        // "ab" (2 bytes) + '€' (3 bytes, at indices 2..5) + "cdef" (4 bytes):
        // 9 bytes total. Capping to the last 6 bytes would naively cut at
        // index 3, inside the euro sign; the result must land on the next
        // real char boundary (index 5) instead of panicking or splitting it.
        let s = format!("ab{}cdef", '\u{20AC}');
        assert_eq!(s.len(), 9);
        assert_eq!(cap_tail(&s, 6), "cdef");
        // Uncapped input (and the exact-length boundary) is returned as is.
        assert_eq!(cap_tail(&s, 9), s);
        assert_eq!(cap_tail("hello", 64), "hello");
    }

    #[test]
    fn join_output_never_adds_a_stray_newline() {
        assert_eq!(join_output("out", "err"), "out\nerr");
        assert_eq!(join_output("out", ""), "out");
        assert_eq!(join_output("", "err"), "err");
        assert_eq!(join_output("", ""), "");
    }

    #[test]
    fn bundle_info_drops_missing_files_and_keeps_an_existing_binary() {
        let dir = tempfile::tempdir().unwrap();
        let binary = dir.path().join("hedgebuddy.exe");
        fs::write(&binary, "bin").unwrap();
        let missing_wheel = dir.path().join("hedgebuddy-0.11.0-py3-none-any.whl");
        let bundle = Bundle {
            binary: Some(binary.clone()),
            wheel: Some(missing_wheel),
        };
        let info = bundle_info(&bundle);
        assert_eq!(info.binary.as_deref(), Some(binary.as_path()));
        assert_eq!(info.wheel, None);
        assert_eq!(info.wheel_version, None);
    }

    #[test]
    fn parse_wheel_version_handles_odd_names() {
        let cases: [(&str, Option<&str>); 6] = [
            ("hedgebuddy-0.11.0-py3-none-any.whl", Some("0.11.0")),
            ("hedgebuddy-1.2.3.dev0-py3-none-any.whl", Some("1.2.3.dev0")),
            ("hedgebuddy--py3-none-any.whl", None),
            ("hedgebuddy-0.11.0-py3-none-any.tar.gz", None),
            ("other-0.11.0-py3-none-any.whl", None),
            ("hedgebuddy-0.11.0-py3-none-any.whl.bak", None),
        ];
        for (name, expected) in cases {
            assert_eq!(
                parse_wheel_version(Path::new(name)).as_deref(),
                expected,
                "{name}"
            );
        }
    }

    #[test]
    fn pip_command_line_quotes_the_wheel_per_os() {
        let win =
            Path::new(r"C:\Program Files\hedgebuddy\wheel\hedgebuddy-0.11.0-py3-none-any.whl");
        let line = pip_command_line(Os::Windows, win);
        assert!(line.ends_with(&format!("\"{}\"", win.display())), "{line}");

        let mac = Path::new("/Users/$USER/hedgebuddy-0.11.0-py3-none-any.whl");
        let line = pip_command_line(Os::Macos, mac);
        assert!(line.ends_with(&format!("'{}'", mac.display())), "{line}");
        assert!(line.contains("$USER"), "{line}");
    }
}
