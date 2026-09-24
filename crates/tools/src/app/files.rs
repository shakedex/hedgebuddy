//! File actions behind the editing screens (spec §4.3): whether paths exist
//! and their drives are mounted, which paths the app may reveal, how the
//! editor command becomes an argv, a new script's template, and profile
//! export and import. The Tauri crate adds what needs the OS (starting the
//! editor, the opener, the file dialogs); the argument and result types of
//! those commands live here too, so the generated TypeScript covers them.

use std::ffi::OsString;
use std::fs;
use std::path::{Component, Path, PathBuf};

use hedgebuddy_core::{
    read_profile_export, validate_script_name, write_profile_export, CoreError, ImportSummary,
    EXPORT_MAX_BYTES,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::resources::script_template_source;
use crate::{Context, ToolError};

/// The most paths one `path_status` call checks.
pub const PATH_STATUS_MAX: usize = 64;

/// Why `reveal_target` refuses a path that exists.
const REVEAL_REFUSED: &str = "HedgeBuddy only reveals its data folder and Hedge app files";

/// The editor command word replaced by the script's path.
const FILE_PLACEHOLDER: &str = "{file}";

/// Arguments of `path_status`.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PathStatusArgs {
    /// The paths to check, at most 64.
    pub paths: Vec<String>,
}

/// Result of `path_status`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct PathStatusList {
    /// One entry per path asked about, in the same order.
    pub paths: Vec<PathState>,
}

/// Whether a path exists, and whether the drive it lives on is there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PathState {
    /// The path as given.
    pub path: String,
    /// Whether the path exists.
    pub exists: bool,
    /// Whether its drive, network share or `/Volumes` volume is present
    /// (true for a relative or empty path, which has no drive to be missing).
    pub mounted: bool,
}

/// Whether each path exists and whether its drive is mounted, so a path
/// variable can say "not mounted" rather than "missing" for an offload
/// drive that is unplugged. Reads the file system only.
pub fn path_status(_ctx: &Context, args: PathStatusArgs) -> Result<PathStatusList, ToolError> {
    if args.paths.len() > PATH_STATUS_MAX {
        return Err(ToolError::new(format!(
            "path_status checks at most {PATH_STATUS_MAX} paths at a time"
        )));
    }
    Ok(PathStatusList {
        paths: args.paths.into_iter().map(path_state).collect(),
    })
}

fn path_state(path: String) -> PathState {
    let p = Path::new(&path);
    let exists = !path.is_empty() && p.exists();
    // A path that exists is on a mounted drive; checking only the others
    // saves a second look at a slow network share.
    let mounted = exists || volume_root(p).is_none_or(|root| root.exists());
    PathState {
        path,
        exists,
        mounted,
    }
}

/// The root of the drive `path` lives on, when it has one that can be
/// missing: `C:\` for `C:\x`, `\\server\share\` for a UNC path, and on macOS
/// `/Volumes/<name>` for a path under it. `None` for relative paths and
/// every other absolute path.
fn volume_root(path: &Path) -> Option<PathBuf> {
    let mut components = path.components();
    match components.next()? {
        Component::Prefix(prefix) => {
            let mut root = OsString::from(prefix.as_os_str());
            root.push("\\");
            Some(PathBuf::from(root))
        }
        #[cfg(target_os = "macos")]
        Component::RootDir => match (components.next(), components.next()) {
            (Some(Component::Normal(volumes)), Some(Component::Normal(name)))
                if volumes == "Volumes" =>
            {
                Some(Path::new("/Volumes").join(name))
            }
            _ => None,
        },
        _ => None,
    }
}

/// The canonical form of `path` when the app may show it in the file
/// manager (spec §4.3): it exists and is inside the data folder, or it is a
/// catalog app's resolved callback log or event log, or it is inside an
/// app's presets folder. Both sides are canonicalized (resolving `..` and
/// links) and compared component by component, so `C:\data2` is not inside
/// `C:\data` and `<data>\..\x` is not inside the data folder.
pub fn reveal_target(ctx: &Context, path: &str) -> Result<PathBuf, ToolError> {
    let given = Path::new(path);
    if !given.is_absolute() {
        return Err(ToolError::new(REVEAL_REFUSED));
    }
    let target =
        canonical(given).ok_or_else(|| ToolError::new(format!("{path} does not exist")))?;
    if inside(&target, ctx.store.root()) || is_app_file(ctx, &target) {
        Ok(target)
    } else {
        Err(ToolError::new(REVEAL_REFUSED))
    }
}

/// `path` with `..` and links resolved, when it exists.
fn canonical(path: &Path) -> Option<PathBuf> {
    if path.as_os_str().is_empty() {
        return None;
    }
    fs::canonicalize(path).ok()
}

/// Whether canonical `target` is `base` or inside it (false when `base`
/// does not exist).
fn inside(target: &Path, base: &Path) -> bool {
    canonical(base).is_some_and(|base| target.starts_with(base))
}

/// Whether canonical `target` is a catalog app's callback or event log, or
/// inside its presets folder. Apps whose files do not resolve are skipped.
fn is_app_file(ctx: &Context, target: &Path) -> bool {
    ctx.hedge.catalog().apps().any(|m| {
        let Ok(app) = ctx.hedge.describe_app(&m.app.id) else {
            return false;
        };
        let files = app.files;
        let is_target = |p: Option<&Path>| p.and_then(canonical).is_some_and(|p| p == target);
        is_target(files.callback_log.as_deref())
            || is_target(files.event_log.as_deref())
            || files
                .presets_dir
                .as_deref()
                .is_some_and(|dir| inside(target, dir))
    })
}

/// The argv that opens `file` with the operator's editor `command`. The
/// command is split into words the way a shell would, but no shell ever
/// runs it: whitespace separates words; `"…"` and `'…'` group, `\"` is a
/// quote inside double quotes, and nothing is escaped inside single quotes.
/// A word `{file}` is replaced by the path; with none, the path is appended.
/// An empty command, an unterminated quote, or a command that starts with
/// `{file}` (which would run the script rather than open it) is an error.
pub fn editor_argv(command: &str, file: &Path) -> Result<Vec<String>, ToolError> {
    let mut words = split_words(command)?;
    match words.first().map(String::as_str) {
        None => return Err(ToolError::new("the editor command is empty")),
        Some(FILE_PLACEHOLDER) => {
            return Err(ToolError::new(
                "the editor command must start with a program, not {file}",
            ))
        }
        Some(_) => {}
    }
    let path = file
        .to_str()
        .ok_or_else(|| ToolError::new(format!("{} is not valid Unicode", file.display())))?;
    let mut replaced = false;
    for word in words.iter_mut().filter(|w| *w == FILE_PLACEHOLDER) {
        *word = path.to_owned();
        replaced = true;
    }
    if !replaced {
        words.push(path.to_owned());
    }
    Ok(words)
}

/// Split `command` into words; see [`editor_argv`].
fn split_words(command: &str) -> Result<Vec<String>, ToolError> {
    let unterminated =
        || ToolError::new(format!("unterminated quote in editor command: {command}"));
    let mut words = Vec::new();
    let mut word = String::new();
    // Whether a word has started; `""` is an empty word, not nothing.
    let mut in_word = false;
    let mut chars = command.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                in_word = true;
                loop {
                    match chars.next().ok_or_else(unterminated)? {
                        '"' => break,
                        '\\' if chars.peek() == Some(&'"') => {
                            chars.next();
                            word.push('"');
                        }
                        c => word.push(c),
                    }
                }
            }
            '\'' => {
                in_word = true;
                loop {
                    match chars.next().ok_or_else(unterminated)? {
                        '\'' => break,
                        c => word.push(c),
                    }
                }
            }
            c if c.is_whitespace() => {
                if in_word {
                    words.push(std::mem::take(&mut word));
                    in_word = false;
                }
            }
            c => {
                in_word = true;
                word.push(c);
            }
        }
    }
    if in_word {
        words.push(word);
    }
    Ok(words)
}

/// Where `program` is, found the way Windows finds a command. A program
/// with a directory part (a separator, a drive, or an absolute path) is
/// returned as is when it is a file. Otherwise each absolute directory of
/// `path_var` (split with [`std::env::split_paths`]) is tried with
/// `program` plus each `pathext` extension (`;`-separated, any case), then
/// `program` itself. The current directory, and empty or relative `PATH`
/// entries (which mean it), are never searched, so a file planted there
/// cannot stand in for the editor.
pub fn find_in_path(program: &str, path_var: &str, pathext: &str) -> Option<PathBuf> {
    if program.is_empty() {
        return None;
    }
    let p = Path::new(program);
    let has_dir = program.contains(['/', '\\'])
        || p.is_absolute()
        || matches!(p.components().next(), Some(Component::Prefix(_)));
    if has_dir {
        return p.is_file().then(|| p.to_path_buf());
    }
    let exts: Vec<String> = pathext
        .split(';')
        .map(str::trim)
        .filter(|e| !e.is_empty())
        .map(str::to_ascii_lowercase)
        .collect();
    std::env::split_paths(path_var)
        .filter(|dir| dir.is_absolute())
        .find_map(|dir| {
            exts.iter()
                .map(|ext| dir.join(format!("{program}{ext}")))
                .chain(std::iter::once(dir.join(program)))
                .find(|candidate| candidate.is_file())
        })
}

/// The path of an existing script of an existing profile (the active
/// profile when `profile` is `None`).
pub fn script_file(
    ctx: &Context,
    profile: Option<&str>,
    script: &str,
) -> Result<PathBuf, ToolError> {
    let profile = ctx.profile(profile)?;
    validate_script_name(script)?;
    if !ctx.store.profile_exists(&profile) {
        return Err(CoreError::ProfileNotFound(profile).into());
    }
    let path = ctx.store.script_path(&profile, script);
    if !path.is_file() {
        return Err(CoreError::ScriptNotFound(script.to_owned()).into());
    }
    Ok(path)
}

/// Arguments of `script_template`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ScriptTemplateArgs {
    /// Catalog app id.
    pub app: String,
    /// The app's event id.
    pub event: String,
    /// The profile the script is for; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
}

/// Result of `script_template`: a starting point for a new script. Nothing
/// is written.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ScriptTemplate {
    /// A suggested file name no script of the profile uses yet, such as
    /// `on_file_copy_completed.py`.
    pub name: String,
    /// The script's Python source.
    pub source: String,
}

/// A new script's source for `app`'s `event`, and a free file name for it:
/// `on_<event in snake_case>.py`, then `_2`, `_3` … while that name is taken.
pub fn script_template(
    ctx: &Context,
    args: ScriptTemplateArgs,
) -> Result<ScriptTemplate, ToolError> {
    let source = script_template_source(ctx, &args.app, &args.event)?;
    let profile = ctx.profile(args.profile.as_deref())?;
    if !ctx.store.profile_exists(&profile) {
        return Err(CoreError::ProfileNotFound(profile).into());
    }
    let stem = format!("on_{}", snake_case(&args.event));
    let mut name = format!("{stem}.py");
    let mut n = 2;
    while ctx.store.script_path(&profile, &name).exists() {
        name = format!("{stem}_{n}.py");
        n += 1;
    }
    validate_script_name(&name)?;
    Ok(ScriptTemplate { name, source })
}

/// `FileCopyCompleted` → `file_copy_completed`. A run of capitals stays one
/// word (`HTTPRequest` → `http_request`); anything but ASCII letters and
/// digits becomes `_`.
fn snake_case(id: &str) -> String {
    let chars: Vec<char> = id.chars().collect();
    let mut out = String::new();
    for (i, &c) in chars.iter().enumerate() {
        if c.is_ascii_uppercase() {
            let prev = i.checked_sub(1).map(|j| chars[j]);
            let next = chars.get(i + 1);
            let boundary = prev.is_some_and(|p| p.is_ascii_lowercase() || p.is_ascii_digit())
                || (prev.is_some_and(|p| p.is_ascii_uppercase())
                    && next.is_some_and(|n| n.is_ascii_lowercase()));
            if boundary && !out.ends_with('_') {
                out.push('_');
            }
            out.push(c.to_ascii_lowercase());
        } else if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('_') {
            out.push('_');
        }
    }
    out.trim_end_matches('_').to_owned()
}

/// Arguments of `export_profile`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ExportArgs {
    /// The profile to export.
    pub name: String,
    /// Whether to include secret values; the file is then created
    /// owner-only on Unix.
    pub include_secrets: bool,
    /// The absolute path of the file to write (replaced if it exists).
    pub dest: String,
}

/// Result of `export_profile`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ExportResult {
    /// The file written.
    pub path: String,
    /// How many variables it holds.
    pub variables: usize,
    /// How many scripts it holds.
    pub scripts: usize,
    /// Whether it holds any secret values.
    pub secrets_included: bool,
}

/// Write profile `name` (its variables, its scripts and, only with
/// `include_secrets`, its secret values) to `dest`. A read of the data
/// folder, so it takes no lock.
pub fn export_profile(ctx: &Context, args: ExportArgs) -> Result<ExportResult, ToolError> {
    let dest = absolute(&args.dest, "export destination")?;
    let export = ctx.store.export_profile(&args.name, args.include_secrets)?;
    write_profile_export(dest, &export)?;
    Ok(ExportResult {
        variables: export.profile.variables.len(),
        scripts: export.scripts.len(),
        secrets_included: export.secrets.as_ref().is_some_and(|s| !s.is_empty()),
        path: args.dest,
    })
}

/// Arguments of `import_profile`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ImportArgs {
    /// The absolute path of the export file to read.
    pub path: String,
    /// The new profile's name.
    pub name: String,
}

/// Create profile `name` from the export file at `path`, under the write
/// lock. The whole file is checked before anything is written.
pub fn import_profile(ctx: &Context, args: ImportArgs) -> Result<ImportSummary, ToolError> {
    let path = absolute(&args.path, "export file")?;
    let _guard = ctx.write_guard()?;
    let export = read_profile_export(path, EXPORT_MAX_BYTES)?;
    Ok(ctx.store.import_profile(&export, &args.name)?)
}

/// `path` when it is absolute: a relative one would resolve against the
/// app's working directory, which the operator never chose.
fn absolute<'a>(path: &'a str, what: &str) -> Result<&'a Path, ToolError> {
    let p = Path::new(path);
    if p.is_absolute() {
        Ok(p)
    } else {
        Err(ToolError::new(format!(
            "the {what} must be an absolute path, not '{path}'"
        )))
    }
}

/// Arguments of `open_in_editor`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OpenInEditorArgs {
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Script file name.
    pub script: String,
}

/// What `open_in_editor`, `reveal_path` or `open_app_docs` opened.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct Opened {
    /// The file, folder or URL that was opened.
    pub path: String,
    /// What opened it: the editor command, or a phrase such as "the default app".
    pub with: String,
}

/// Arguments of `reveal_path`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RevealArgs {
    /// The path to show in the file manager: inside the data folder, or a
    /// Hedge app file.
    pub path: String,
}

/// Arguments of `open_app_docs`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OpenAppDocsArgs {
    /// Catalog app id; its `https://` docs page opens in the browser.
    pub app: String,
}

/// Arguments of `pick_folder`.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PickFolderArgs {
    /// The dialog's title.
    #[serde(default)]
    pub title: Option<String>,
}

/// Arguments of `pick_export_path`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PickExportArgs {
    /// The file name the save dialog suggests.
    pub default_name: String,
}

/// Result of `pick_folder`, `pick_export_path` and `pick_import_file`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PickedPath {
    /// The chosen path, or null when the dialog was cancelled.
    pub path: Option<String>,
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use super::*;
    use crate::app::checked;
    use crate::{call, test_ctx};

    #[test]
    fn path_status_tells_missing_folders_from_absent_drives() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let here = dir.path().display().to_string();
        let gone = dir.path().join("nope").display().to_string();
        let out = checked(
            "path_status",
            path_status(
                &ctx,
                PathStatusArgs {
                    paths: vec![here.clone(), gone.clone(), String::new()],
                },
            )
            .unwrap(),
        );
        assert_eq!(
            out.paths[0],
            PathState {
                path: here,
                exists: true,
                mounted: true
            }
        );
        assert_eq!(
            out.paths[1],
            PathState {
                path: gone,
                exists: false,
                mounted: true
            }
        );
        assert!(!out.paths[2].exists);
        #[cfg(windows)]
        {
            let absent = (b'D'..=b'Z')
                .map(|c| format!("{}:\\", c as char))
                .find(|d| !Path::new(d).exists());
            if let Some(d) = absent {
                let p = format!("{d}Offload");
                let out = path_status(&ctx, PathStatusArgs { paths: vec![p] }).unwrap();
                assert!(!out.paths[0].mounted);
            }
        }
        #[cfg(target_os = "macos")]
        {
            let out = path_status(
                &ctx,
                PathStatusArgs {
                    paths: vec!["/Volumes/HB-NOT-MOUNTED-7f3/x".into()],
                },
            )
            .unwrap();
            assert!(!out.paths[0].mounted);
        }
        assert!(path_status(
            &ctx,
            PathStatusArgs {
                paths: vec![String::new(); 65]
            }
        )
        .is_err());
    }

    #[test]
    fn reveal_allows_the_data_folder_and_nothing_else() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "a.py", "source": "print(1)\n"}),
        )
        .unwrap();
        let script = ctx.store.script_path("p", "a.py");
        assert!(reveal_target(&ctx, &script.display().to_string()).is_ok());
        assert!(reveal_target(&ctx, &ctx.store.root().display().to_string()).is_ok());
        let outside = dir.path().join("outside.txt");
        std::fs::write(&outside, "x").unwrap();
        assert!(reveal_target(&ctx, &outside.display().to_string()).is_err());
        let sneaky = ctx.store.root().join("..").join("outside.txt");
        assert!(reveal_target(&ctx, &sneaky.display().to_string()).is_err());
        assert!(reveal_target(
            &ctx,
            &ctx.store.root().join("missing.txt").display().to_string()
        )
        .is_err());
    }

    #[test]
    fn reveal_allows_a_hedge_app_log() {
        let appdata = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(appdata.path().join("Hedge")).unwrap();
        std::fs::write(appdata.path().join("Hedge").join("HedgeCallback.log"), "x").unwrap();
        let host =
            FakeHost::new(Os::Windows).with_env("APPDATA", &appdata.path().display().to_string());
        let (_d, _f, ctx) = test_ctx(host);
        let log = appdata.path().join("Hedge").join("HedgeCallback.log");
        assert!(reveal_target(&ctx, &log.display().to_string()).is_ok());
    }

    #[test]
    fn editor_commands_split_like_a_shell() {
        let f = Path::new("C:/data/p/scripts/a b.py");
        assert_eq!(
            editor_argv("code -n", f).unwrap(),
            ["code", "-n", "C:/data/p/scripts/a b.py"]
        );
        assert_eq!(
            editor_argv("\"C:/Program Files/Sublime/subl.exe\" --wait {file}", f).unwrap(),
            [
                "C:/Program Files/Sublime/subl.exe",
                "--wait",
                "C:/data/p/scripts/a b.py"
            ]
        );
        assert_eq!(
            editor_argv("open -a 'BBEdit'", f).unwrap(),
            ["open", "-a", "BBEdit", "C:/data/p/scripts/a b.py"]
        );
        assert!(editor_argv("   ", f).is_err());
        assert!(editor_argv("code \"unterminated", f).is_err());
    }

    #[test]
    fn programs_are_found_through_path_and_pathext() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("code.cmd"), "").unwrap();
        let path_var = std::env::join_paths([dir.path()])
            .unwrap()
            .into_string()
            .unwrap();
        assert_eq!(
            find_in_path("code", &path_var, ".EXE;.CMD"),
            Some(dir.path().join("code.cmd"))
        );
        assert_eq!(find_in_path("nope", &path_var, ".EXE;.CMD"), None);
    }

    #[test]
    fn a_template_suggests_a_free_name() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let args = || ScriptTemplateArgs {
            app: "offshoot".into(),
            event: "FileCopyCompleted".into(),
            profile: None,
        };
        let t = checked("script_template", script_template(&ctx, args()).unwrap());
        assert_eq!(t.name, "on_file_copy_completed.py");
        call(
            &ctx,
            "write_script",
            json!({"name": t.name, "source": t.source}),
        )
        .unwrap();
        assert_eq!(
            script_template(&ctx, args()).unwrap().name,
            "on_file_copy_completed_2.py"
        );
    }

    #[test]
    fn export_and_import_go_through_files() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(
            &ctx,
            "set_var",
            json!({"name": "HOOK", "type": "secret", "value": "https://hook"}),
        )
        .unwrap();
        let dest = dir.path().join("p.hedgebuddy.json");
        let out = checked(
            "export_profile",
            export_profile(
                &ctx,
                ExportArgs {
                    name: "p".into(),
                    include_secrets: false,
                    dest: dest.display().to_string(),
                },
            )
            .unwrap(),
        );
        assert!(!out.secrets_included);
        assert!(!std::fs::read_to_string(&dest)
            .unwrap()
            .contains("https://hook"));
        let imported = checked(
            "import_profile",
            import_profile(
                &ctx,
                ImportArgs {
                    path: dest.display().to_string(),
                    name: "q".into(),
                },
            )
            .unwrap(),
        );
        assert_eq!(imported.secrets_missing, vec!["HOOK".to_owned()]);
        assert!(ctx.store.profile_exists("q"));
    }

    #[test]
    fn path_status_takes_exactly_the_limit() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let out = path_status(
            &ctx,
            PathStatusArgs {
                paths: vec!["relative/x".into(); PATH_STATUS_MAX],
            },
        )
        .unwrap();
        assert_eq!(out.paths.len(), PATH_STATUS_MAX);
        assert!(out.paths.iter().all(|p| !p.exists && p.mounted));
    }

    #[test]
    fn reveal_compares_whole_components_and_refuses_relative_paths() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        // The data folder is `<dir>/HedgeBuddy`; a sibling sharing its name
        // as a string prefix is outside it.
        let sibling = dir.path().join("HedgeBuddy2");
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(sibling.join("x.txt"), "x").unwrap();
        let err = reveal_target(&ctx, &sibling.join("x.txt").display().to_string()).unwrap_err();
        assert_eq!(err.0, REVEAL_REFUSED);
        assert!(reveal_target(&ctx, &sibling.display().to_string()).is_err());
        assert!(reveal_target(&ctx, "").is_err());
        assert!(reveal_target(&ctx, ".").is_err());
        assert!(reveal_target(&ctx, "HedgeBuddy").is_err());
        let missing = ctx.store.root().join("missing.txt").display().to_string();
        assert!(reveal_target(&ctx, &missing)
            .unwrap_err()
            .0
            .contains("does not exist"));
    }

    #[test]
    fn reveal_allows_app_logs_exactly_and_anything_inside_presets() {
        let appdata = tempfile::tempdir().unwrap();
        let hedge = appdata.path().join("Hedge");
        std::fs::create_dir_all(hedge.join("Presets")).unwrap();
        for f in ["Hedge.log", "HedgeCallback.log", "other.txt"] {
            std::fs::write(hedge.join(f), "x").unwrap();
        }
        std::fs::write(hedge.join("Presets").join("a.hedge"), "{}").unwrap();
        let host =
            FakeHost::new(Os::Windows).with_env("APPDATA", &appdata.path().display().to_string());
        let (_d, _f, ctx) = test_ctx(host);
        let ok = |p: PathBuf| reveal_target(&ctx, &p.display().to_string()).is_ok();
        assert!(ok(hedge.join("Hedge.log")));
        assert!(ok(hedge.join("Presets")));
        assert!(ok(hedge.join("Presets").join("a.hedge")));
        // The logs' folder is not an app file, nor is its neighbour.
        assert!(!ok(hedge.clone()));
        assert!(!ok(hedge.join("other.txt")));
        assert!(!ok(hedge.join("Presets").join("..").join("other.txt")));
    }

    #[test]
    fn editor_quotes_escapes_and_placeholders() {
        let f = Path::new("/d/a.py");
        assert_eq!(
            editor_argv(r#"ed "say \"hi\"" 'no\"esc'"#, f).unwrap(),
            ["ed", "say \"hi\"", "no\\\"esc", "/d/a.py"]
        );
        assert_eq!(
            editor_argv("ed\t--a=\"b c\"d  ''", f).unwrap(),
            ["ed", "--a=b cd", "", "/d/a.py"]
        );
        assert_eq!(
            editor_argv("ed {file} --then {file}", f).unwrap(),
            ["ed", "/d/a.py", "--then", "/d/a.py"]
        );
        assert_eq!(
            editor_argv(r"C:\Tools\ed.exe", f).unwrap(),
            [r"C:\Tools\ed.exe", "/d/a.py"]
        );
        assert!(editor_argv("", f).is_err());
        assert!(editor_argv("ed 'open", f).is_err());
        assert!(editor_argv(r#"ed "ends with \""#, f).is_err());
        assert!(editor_argv("{file} --x", f).is_err());
    }

    #[test]
    fn program_search_order_and_what_is_never_searched() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        std::fs::write(first.path().join("code"), "").unwrap();
        std::fs::write(first.path().join("code.cmd"), "").unwrap();
        std::fs::write(second.path().join("code.exe"), "").unwrap();
        std::fs::create_dir(second.path().join("tool.exe")).unwrap();
        let path_var = |dirs: &[&Path]| std::env::join_paths(dirs).unwrap().into_string().unwrap();
        let both = path_var(&[first.path(), second.path()]);
        // An extension beats the bare name in the same folder, and the
        // first folder wins.
        assert_eq!(
            find_in_path("code", &both, ".EXE;.CMD"),
            Some(first.path().join("code.cmd"))
        );
        assert_eq!(
            find_in_path("code", &both, ""),
            Some(first.path().join("code"))
        );
        assert_eq!(
            find_in_path("code.exe", &both, ".EXE"),
            Some(second.path().join("code.exe"))
        );
        // A folder is not a program.
        assert_eq!(find_in_path("tool", &both, ".EXE"), None);
        // A path is used as is, and only when it is a file.
        let full = first.path().join("code").display().to_string();
        assert_eq!(
            find_in_path(&full, "", ".EXE"),
            Some(first.path().join("code"))
        );
        let gone = first.path().join("gone").display().to_string();
        assert_eq!(find_in_path(&gone, &both, ".EXE"), None);
        assert_eq!(find_in_path("", &both, ".EXE"), None);
        // Relative and empty PATH entries mean the current folder, which is
        // never searched: tests run in the crate folder, next to Cargo.toml.
        assert!(Path::new("Cargo.toml").is_file());
        assert_eq!(find_in_path("Cargo", ".", ".TOML"), None);
        assert_eq!(find_in_path("Cargo.toml", ".", ""), None);
        let empty_entry = format!("{}{}", if cfg!(windows) { ";" } else { ":" }, both);
        assert_eq!(find_in_path("Cargo.toml", &empty_entry, ""), None);
    }

    #[test]
    fn event_ids_become_snake_case() {
        assert_eq!(snake_case("FileCopyCompleted"), "file_copy_completed");
        assert_eq!(snake_case("OffShootStarted"), "off_shoot_started");
        assert_eq!(snake_case("DisksIdle"), "disks_idle");
        assert_eq!(snake_case("HTTPRequest2Done"), "http_request2_done");
        assert_eq!(snake_case("a-b c"), "a_b_c");
    }

    #[test]
    fn a_template_needs_a_known_event_and_an_existing_profile() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let args = |event: &str, profile: Option<&str>| ScriptTemplateArgs {
            app: "offshoot".into(),
            event: event.into(),
            profile: profile.map(str::to_owned),
        };
        assert!(script_template(&ctx, args("FileCopyCompleted", None))
            .unwrap_err()
            .0
            .contains("no active profile"));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        assert!(script_template(&ctx, args("Nope", None)).is_err());
        assert!(script_template(&ctx, args("DiskAdded", Some("ghost"))).is_err());
        assert!(script_template(&ctx, args("DiskAdded", Some("../p"))).is_err());
        assert_eq!(
            script_template(&ctx, args("DiskAdded", Some("p")))
                .unwrap()
                .name,
            "on_disk_added.py"
        );
    }

    #[test]
    fn script_files_must_exist_in_an_existing_profile() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "a.py", "source": "print(1)\n"}),
        )
        .unwrap();
        assert_eq!(
            script_file(&ctx, None, "a.py").unwrap(),
            ctx.store.script_path("p", "a.py")
        );
        assert_eq!(
            script_file(&ctx, Some("p"), "a.py").unwrap(),
            ctx.store.script_path("p", "a.py")
        );
        assert!(script_file(&ctx, None, "b.py")
            .unwrap_err()
            .0
            .contains("not found"));
        assert!(script_file(&ctx, None, "../p/a.py").is_err());
        assert!(script_file(&ctx, Some("ghost"), "a.py")
            .unwrap_err()
            .0
            .contains("profile 'ghost' not found"));
        assert!(script_file(&ctx, Some(".."), "a.py").is_err());
    }

    #[test]
    fn exports_with_secrets_carry_them_and_paths_must_be_absolute() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(
            &ctx,
            "set_var",
            json!({"name": "HOOK", "type": "secret", "value": "https://hook"}),
        )
        .unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "a.py", "source": "print(1)\n"}),
        )
        .unwrap();
        let dest = dir.path().join("with.json");
        let args = |dest: String, include_secrets: bool| ExportArgs {
            name: "p".into(),
            include_secrets,
            dest,
        };
        let out = export_profile(&ctx, args(dest.display().to_string(), true)).unwrap();
        assert!(out.secrets_included);
        assert_eq!((out.variables, out.scripts), (1, 1));
        assert_eq!(out.path, dest.display().to_string());
        assert!(std::fs::read_to_string(&dest)
            .unwrap()
            .contains("https://hook"));
        let imported = import_profile(
            &ctx,
            ImportArgs {
                path: dest.display().to_string(),
                name: "q".into(),
            },
        )
        .unwrap();
        assert_eq!((imported.secrets_imported, imported.scripts), (1, 1));
        assert!(imported.secrets_missing.is_empty());
        assert!(export_profile(&ctx, args("rel.json".into(), false))
            .unwrap_err()
            .0
            .contains("absolute"));
        assert!(!Path::new("rel.json").exists());
        let err = import_profile(
            &ctx,
            ImportArgs {
                path: "rel.json".into(),
                name: "r".into(),
            },
        )
        .unwrap_err();
        assert!(err.0.contains("absolute"), "{err}");
        let err = import_profile(
            &ctx,
            ImportArgs {
                path: dest.display().to_string(),
                name: "q".into(),
            },
        )
        .unwrap_err();
        assert!(err.0.contains("already exists"), "{err}");
    }

    #[test]
    fn import_waits_for_the_lock_and_reports_busy() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = ctx.with_lock_timeout(std::time::Duration::from_millis(100));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let dest = dir.path().join("p.json");
        export_profile(
            &ctx,
            ExportArgs {
                name: "p".into(),
                include_secrets: false,
                dest: dest.display().to_string(),
            },
        )
        .unwrap();
        let _held = hedgebuddy_core::Store::open(ctx.store.root())
            .lock()
            .unwrap();
        let err = import_profile(
            &ctx,
            ImportArgs {
                path: dest.display().to_string(),
                name: "q".into(),
            },
        )
        .unwrap_err();
        assert!(err.is_busy(), "{err}");
        assert!(!ctx.store.profile_exists("q"));
    }
}
