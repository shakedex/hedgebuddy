//! Script tools.

use std::path::PathBuf;

use hedgebuddy_core::hedge::{managed_script, validate_manifest, AttachState};
use hedgebuddy_core::{
    parse_manifest, python_env, validate_script_name, Manifest, RequirementIssue, ScriptInfo,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{tool, Context, ToolDef, ToolError, DESTRUCTIVE, READ};
use crate::profiles::ProfileArg;

/// A script in a profile.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ScriptArg {
    /// Script file name, e.g. `on_copy_complete.py`.
    pub name: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
}

/// Arguments of `write_script`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WriteScript {
    /// Script file name ending in `.py`.
    pub name: String,
    /// The full Python source, starting with the manifest docstring.
    pub source: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
}

/// A script plus `dry_run`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ScriptDry {
    /// Script file name.
    pub name: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Report what would happen without doing it.
    #[serde(default)]
    pub dry_run: bool,
}

/// A Hedge app event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct AppEvent {
    /// Catalog app id.
    pub app: String,
    /// Event id.
    pub event: String,
}

/// Result of `list_scripts`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListScriptsResult {
    /// The profile listed.
    pub profile: String,
    /// Its scripts with their manifests.
    pub scripts: Vec<ScriptInfo>,
}

/// Result of `read_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ReadScriptResult {
    /// The profile the script belongs to.
    pub profile: String,
    /// Script file name.
    pub name: String,
    /// The full Python source.
    pub source: String,
}

/// Result of `write_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct WriteScriptResult {
    /// The profile written to.
    pub profile: String,
    /// Script file name.
    pub name: String,
    /// Whether an existing script was replaced.
    pub replaced: bool,
    /// App events still attached to the replaced script.
    pub attached_to: Vec<AppEvent>,
    /// The parsed manifest, or null when the script has none.
    pub manifest: Option<Manifest>,
    /// Requirements the profile does not meet.
    pub unmet: Vec<RequirementIssue>,
}

/// A script in a profile.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ScriptRef {
    /// Profile name.
    pub profile: String,
    /// Script file name.
    pub name: String,
}

/// Result of `delete_script`.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DeleteScriptResult {
    /// With `dry_run`: what would be deleted.
    DryRun {
        /// Always true.
        dry_run: bool,
        /// The script that would be deleted.
        would_delete: ScriptRef,
        /// App events attached to it.
        attached_to: Vec<AppEvent>,
    },
    /// The script was deleted.
    Deleted {
        /// Script file name.
        deleted: String,
        /// Profile name.
        profile: String,
        /// App events that still point at the deleted file.
        left_attached: Vec<AppEvent>,
    },
}

/// Result of `check_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct CheckScriptResult {
    /// Profile name.
    pub profile: String,
    /// Script file name.
    pub name: String,
    /// The parsed manifest, or null.
    pub manifest: Option<Manifest>,
    /// Requirements the profile does not meet.
    pub unmet: Vec<RequirementIssue>,
    /// Why the manifest's app or event is not in the catalog, if so.
    pub catalog_error: Option<String>,
    /// Whether a Python compile check ran.
    pub syntax_checked: bool,
    /// The interpreter used for the compile check.
    pub python: Option<PathBuf>,
    /// The compile error, if any.
    pub syntax_error: Option<String>,
    /// Why the script's `import hedgebuddy` would fail, if so.
    pub package_problem: Option<String>,
    /// True when nothing above is a problem.
    pub ok: bool,
}

/// The script tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_scripts",
            "List a profile's scripts with their manifests (target app/event and required variables). Defaults to the active profile.",
            READ,
            ProfileArg,
            ListScriptsResult,
            list_scripts
        ),
        tool!(
            "read_script",
            "Return a script's source.",
            READ,
            ScriptArg,
            ReadScriptResult,
            read_script
        ),
        tool!(
            "write_script",
            "Create or replace a script. The source must start with a docstring whose first part is the JSON manifest, e.g. {\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\", \"requires\": {...}} followed by a line ---. The app and event are checked against the catalog (see describe_app). Returns unmet requirements; set them with set_var before attaching. When it replaces a script, attached_to lists the app events still attached to it; if the manifest's event changed, detach the old one with detach_script.",
            DESTRUCTIVE,
            WriteScript,
            WriteScriptResult,
            write_script
        ),
        tool!(
            "delete_script",
            "Delete a script. Run with dry_run first; the result lists Hedge app events still attached to it (detach them first with detach_script).",
            DESTRUCTIVE,
            ScriptDry,
            DeleteScriptResult,
            delete_script
        ),
        tool!(
            "check_script",
            "Check a script without running it: manifest against the catalog, required variables against the profile, a Python compile check with the interpreter Hedge apps use, and whether the hedgebuddy package the script imports is installed there at the right version.",
            READ,
            ScriptArg,
            CheckScriptResult,
            check_script
        ),
    ]
}

/// Events currently attached to (or staged for) `profile/script`, across all
/// apps. Apps whose attachment state cannot be read are skipped.
pub(crate) fn attached_to(ctx: &Context, profile: &str, script: &str) -> Vec<AppEvent> {
    let mut out = Vec::new();
    for app in ctx.hedge.catalog().apps() {
        let Ok(list) = ctx.hedge.attachments(&app.app.id, &ctx.store) else {
            continue;
        };
        for a in list {
            let path = match &a.state {
                AttachState::Attached { path, .. } | AttachState::Staged { path, .. } => path,
                _ => continue,
            };
            if managed_script(&ctx.store, path) == Some((profile.to_owned(), script.to_owned())) {
                out.push(AppEvent {
                    app: a.app,
                    event: a.event,
                });
            }
        }
    }
    out
}

fn list_scripts(ctx: &Context, p: ProfileArg) -> Result<ListScriptsResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let scripts = ctx.store.list_scripts(&profile)?;
    Ok(ListScriptsResult { profile, scripts })
}

fn read_script(ctx: &Context, p: ScriptArg) -> Result<ReadScriptResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let source = ctx.store.read_script(&profile, &p.name)?;
    Ok(ReadScriptResult {
        profile,
        name: p.name,
        source,
    })
}

fn write_script(ctx: &Context, p: WriteScript) -> Result<WriteScriptResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    validate_script_name(&p.name)?;
    if let Some(manifest) = parse_manifest(&p.source)? {
        validate_manifest(ctx.hedge.catalog(), &manifest)?;
    }
    let replaced = ctx.store.script_path(&profile, &p.name).is_file();
    ctx.store.write_script(&profile, &p.name, &p.source)?;
    let check = ctx.store.check_script(&profile, &p.name)?;
    let attached = if replaced {
        attached_to(ctx, &profile, &p.name)
    } else {
        Vec::new()
    };
    Ok(WriteScriptResult {
        profile,
        name: p.name,
        replaced,
        attached_to: attached,
        manifest: check.manifest,
        unmet: check.issues,
    })
}

fn delete_script(ctx: &Context, p: ScriptDry) -> Result<DeleteScriptResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    ctx.store.read_script(&profile, &p.name)?; // exists?
    let attached = attached_to(ctx, &profile, &p.name);
    if p.dry_run {
        return Ok(DeleteScriptResult::DryRun {
            dry_run: true,
            would_delete: ScriptRef {
                profile,
                name: p.name,
            },
            attached_to: attached,
        });
    }
    ctx.store.delete_script(&profile, &p.name)?;
    Ok(DeleteScriptResult::Deleted {
        deleted: p.name,
        profile,
        left_attached: attached,
    })
}

fn check_script(ctx: &Context, p: ScriptArg) -> Result<CheckScriptResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let check = ctx.store.check_script(&profile, &p.name)?;
    let catalog_error = check
        .manifest
        .as_ref()
        .and_then(|m| validate_manifest(ctx.hedge.catalog(), m).err())
        .map(|e| e.to_string());
    let host = ctx.hedge.host();
    let (python, syntax_error) = match python_env::find_python(host)? {
        Some(info) => {
            let err = python_env::syntax_check(
                host,
                &info.executable,
                &ctx.store.script_path(&profile, &p.name),
            )?;
            (Some(info), err)
        }
        None => (None, None),
    };
    let package_problem = python.as_ref().and_then(|info| {
        let source = ctx.store.read_script(&profile, &p.name).ok()?;
        python_env::imports_hedgebuddy(&source)
            .then(|| python_env::package_problem(info, env!("CARGO_PKG_VERSION")))
            .flatten()
    });
    let ok = check.issues.is_empty()
        && catalog_error.is_none()
        && syntax_error.is_none()
        && package_problem.is_none();
    Ok(CheckScriptResult {
        profile,
        name: p.name,
        manifest: check.manifest,
        unmet: check.issues,
        catalog_error,
        syntax_checked: python.is_some(),
        python: python.map(|info| info.executable),
        syntax_error,
        package_problem,
        ok,
    })
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::CommandOutput;
    use hedgebuddy_core::python_env::{PROBE, SYNTAX_CHECK};
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::{call, test_ctx};

    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\", \"requires\": {\"HOOK\": {\"type\": \"secret\"}}}\n---\n\"\"\"\nprint('x')\n";

    #[test]
    fn write_validates_against_the_catalog_and_reports_unmet() {
        let (_d, _f, ctx) =
            test_ctx(FakeHost::new(Os::Windows).with_registry_key("HKCU\\Software\\Hedge"));
        ctx.store.create_profile("p", "").unwrap();
        let out = call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": COPY}),
        )
        .unwrap();
        assert_eq!(out["replaced"], false);
        assert_eq!(out["attached_to"], json!([]));
        assert_eq!(out["manifest"]["event"], "FileCopyCompleted");
        assert_eq!(out["unmet"][0]["name"], "HOOK");

        // Replacing an attached script with a different event reports the
        // event that is still attached.
        call(
            &ctx,
            "set_var",
            json!({"name": "HOOK", "type": "secret", "value": "https://h"}),
        )
        .unwrap();
        ctx.hedge
            .attach_script(&ctx.store, "p", "copy.py", false)
            .unwrap();
        let moved = COPY.replace("FileCopyCompleted", "DiskAdded");
        let again = call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": moved}),
        )
        .unwrap();
        assert_eq!(again["replaced"], true);
        assert_eq!(
            again["attached_to"],
            json!([{"app": "offshoot", "event": "FileCopyCompleted"}])
        );
        let bad = COPY.replace("FileCopyCompleted", "Nope");
        assert!(call(
            &ctx,
            "write_script",
            json!({"name": "bad.py", "source": bad})
        )
        .unwrap_err()
        .0
        .contains("Nope"));
        assert!(!ctx.store.script_path("p", "bad.py").exists());
        assert!(call(
            &ctx,
            "write_script",
            json!({"name": "../x.py", "source": "x"})
        )
        .is_err());
        assert_eq!(
            call(&ctx, "read_script", json!({"name": "copy.py"})).unwrap()["source"],
            moved
        );
        assert_eq!(
            call(&ctx, "list_scripts", json!({})).unwrap()["scripts"][0]["name"],
            "copy.py"
        );
    }

    #[test]
    fn write_refuses_names_that_leave_the_scripts_folder() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        ctx.store.create_profile("p", "").unwrap();
        for name in ["C:x.py", "ab:c.py", "CON.py"] {
            let err = call(
                &ctx,
                "write_script",
                json!({"name": name, "source": "print('x')\n"}),
            )
            .unwrap_err();
            assert!(err.0.contains("script name"), "{name}: {err}");
        }
        let scripts = ctx.store.scripts_dir("p");
        assert!(
            !scripts.exists() || std::fs::read_dir(&scripts).unwrap().next().is_none(),
            "nothing is written to the scripts folder"
        );
        // On Windows, `C:x.py` is relative to drive C's current folder.
        assert!(!std::path::Path::new("C:x.py").exists());
    }

    #[test]
    fn check_without_python_skips_the_compile_step() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        ctx.store.create_profile("p", "").unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": COPY}),
        )
        .unwrap();
        let out = call(&ctx, "check_script", json!({"name": "copy.py"})).unwrap();
        assert_eq!(out["syntax_checked"], false);
        assert_eq!(out["ok"], false, "HOOK is unmet");
        assert_eq!(out["catalog_error"], serde_json::Value::Null);
    }

    #[test]
    fn check_reports_compile_errors_from_python() {
        let dir = tempfile::tempdir().unwrap();
        let store_root = dir.path().join("HedgeBuddy");
        let script_s = hedgebuddy_core::Store::open(&store_root)
            .script_path("p", "plain.py")
            .to_string_lossy()
            .to_string();
        let host = FakeHost::new(Os::Windows)
            .with_run_response(
                "py",
                &["-3", "-c", PROBE],
                CommandOutput {
                    status: 0,
                    stdout: "{\"executable\": \"C:\\\\Py\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": null}\n".into(),
                    stderr: String::new(),
                },
            )
            .with_run_response(
                "C:\\Py\\python.exe",
                &["-c", SYNTAX_CHECK, &script_s],
                CommandOutput { status: 1, stdout: String::new(), stderr: "SyntaxError: 'return' outside function\n".into() },
            );
        let ctx = crate::Context::new(
            hedgebuddy_core::Store::open(&store_root),
            std::sync::Arc::new(host),
        );
        ctx.store.create_profile("p", "").unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "plain.py", "source": "return 1\n"}),
        )
        .unwrap();
        let out = call(&ctx, "check_script", json!({"name": "plain.py"})).unwrap();
        assert_eq!(out["syntax_checked"], true);
        assert_eq!(
            out["syntax_error"],
            "SyntaxError: 'return' outside function"
        );
        assert_eq!(out["package_problem"], serde_json::Value::Null);
        assert_eq!(out["ok"], false);
    }

    #[test]
    fn check_reports_a_missing_hedgebuddy_package() {
        let dir = tempfile::tempdir().unwrap();
        let store_root = dir.path().join("HedgeBuddy");
        let script_s = hedgebuddy_core::Store::open(&store_root)
            .script_path("p", "uses_hb.py")
            .to_string_lossy()
            .to_string();
        let host = FakeHost::new(Os::Windows)
            .with_run_response(
                "py",
                &["-3", "-c", PROBE],
                CommandOutput {
                    status: 0,
                    stdout: "{\"executable\": \"C:\\\\Py\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": null}\n".into(),
                    stderr: String::new(),
                },
            )
            .with_run_response(
                "C:\\Py\\python.exe",
                &["-c", SYNTAX_CHECK, &script_s],
                CommandOutput { status: 0, stdout: String::new(), stderr: String::new() },
            );
        let ctx = crate::Context::new(
            hedgebuddy_core::Store::open(&store_root),
            std::sync::Arc::new(host),
        );
        ctx.store.create_profile("p", "").unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "uses_hb.py", "source": "import hedgebuddy as hb\n"}),
        )
        .unwrap();
        let out = call(&ctx, "check_script", json!({"name": "uses_hb.py"})).unwrap();
        assert!(
            out["package_problem"]
                .as_str()
                .unwrap()
                .contains("not installed"),
            "{out}"
        );
        assert_eq!(out["ok"], false);
    }

    #[test]
    fn delete_reports_attachments_and_has_a_dry_run() {
        let (_d, _f, ctx) =
            test_ctx(FakeHost::new(Os::Windows).with_registry_key("HKCU\\Software\\Hedge"));
        ctx.store.create_profile("p", "").unwrap();
        let plain = COPY.replace(", \"requires\": {\"HOOK\": {\"type\": \"secret\"}}", "");
        call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": plain}),
        )
        .unwrap();
        ctx.hedge
            .attach_script(&ctx.store, "p", "copy.py", false)
            .unwrap();
        let dry = call(
            &ctx,
            "delete_script",
            json!({"name": "copy.py", "dry_run": true}),
        )
        .unwrap();
        assert_eq!(
            dry["attached_to"],
            json!([{"app": "offshoot", "event": "FileCopyCompleted"}])
        );
        assert!(ctx.store.script_path("p", "copy.py").is_file());
        let done = call(&ctx, "delete_script", json!({"name": "copy.py"})).unwrap();
        assert_eq!(done["left_attached"][0]["event"], "FileCopyCompleted");
        assert!(!ctx.store.script_path("p", "copy.py").exists());
    }
}
