//! Claude Desktop's MCP config (spec §6.6, §10): where this machine's Claude
//! Desktop reads `claude_desktop_config.json`, whether HedgeBuddy is set up
//! in it, and setting it up. Only `mcpServers.hedgebuddy` ever changes:
//! every other server and key is kept, and the original file is copied to a
//! backup beside it before each write. A file that can't be read or isn't
//! valid is never written. The Tauri crate wraps these commands and passes
//! the [`Bundle`] it found, so no argument from the webview names a path.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use hedgebuddy_core::catalog::expand_path;
use hedgebuddy_core::{write_atomic, Host, Os};
use schemars::JsonSchema;
use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::{Context, ToolError};

/// The config file's name.
const CONFIG_NAME: &str = "claude_desktop_config.json";
/// The one `mcpServers` entry HedgeBuddy manages.
const ENTRY_NAME: &str = "hedgebuddy";
/// A backup's name is this, a stamp (`YYYYMMDD-HHMMSS`), then [`BACKUP_SUFFIX`].
const BACKUP_PREFIX: &str = "claude_desktop_config.";
/// The end of a backup's name.
const BACKUP_SUFFIX: &str = ".hedgebuddy-backup.json";
/// How many HedgeBuddy backups are kept beside the config.
const BACKUP_KEEP: usize = 5;
/// Why a build without the bundled command can't set up Claude Desktop.
const NO_BINARY: &str =
    "this build has no bundled hedgebuddy command, so it can't set up Claude Desktop";

/// The files the desktop app ships with, found by the app at start.
#[derive(Debug, Clone, Default)]
pub struct Bundle {
    /// The bundled `hedgebuddy` command, or `None` in a build without one.
    pub binary: Option<PathBuf>,
    /// The bundled `hedgebuddy` Python wheel, or `None` in a build without one.
    pub wheel: Option<PathBuf>,
}

/// Whether Claude Desktop is set up to start HedgeBuddy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ClaudeDesktopState {
    /// The `hedgebuddy` entry runs the bundled command.
    SetUp,
    /// There is a `hedgebuddy` entry, but it runs something else.
    Outdated,
    /// Claude Desktop's folder is there, but it has no `hedgebuddy` entry.
    NotSetUp,
    /// Neither the config file nor its folder exists.
    NoClaude,
    /// The config file can't be read or isn't valid; it is never changed.
    Invalid,
}

/// The `mcpServers.hedgebuddy` entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct ServerEntry {
    /// The program Claude Desktop starts.
    pub command: String,
    /// Its arguments.
    pub args: Vec<String>,
}

/// Result of `claude_desktop_status`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ClaudeDesktopStatus {
    /// The config file this machine's Claude Desktop reads.
    pub config_path: PathBuf,
    /// Whether HedgeBuddy is set up in it.
    pub state: ClaudeDesktopState,
    /// Why the config can't be read (state `invalid`), else null.
    pub problem: Option<String>,
    /// The hedgebuddy entry in the file now, if any.
    pub current: Option<ServerEntry>,
    /// The entry Set up writes, or null without a bundled binary.
    pub expected: Option<ServerEntry>,
    /// The other MCP servers in the file, by name (kept as they are).
    pub other_servers: Vec<String>,
    /// The bundled hedgebuddy command, or null in a build without one.
    pub binary: Option<PathBuf>,
    /// `claude mcp add hedgebuddy -- "<binary>" mcp` (or `hedgebuddy mcp`
    /// without a binary).
    pub claude_code_command: String,
    /// `{"mcpServers": {"hedgebuddy": {...}}}` for other clients,
    /// pretty-printed.
    pub client_json: String,
}

/// Result of `claude_desktop_plan`: what `claude_desktop_apply` would do.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ClaudeDesktopPlan {
    /// The config file that would change.
    pub config_path: PathBuf,
    /// True when the file does not exist yet and will be created.
    pub creates_file: bool,
    /// Where the original is copied first, or null when there is no file
    /// yet or nothing would change.
    pub backup_path: Option<PathBuf>,
    /// The hedgebuddy entry in the file now, if any.
    pub before: Option<ServerEntry>,
    /// The hedgebuddy entry after the change.
    pub after: ServerEntry,
    /// The other MCP servers in the file, by name (kept as they are).
    pub other_servers: Vec<String>,
    /// True when nothing would change (already set up).
    pub unchanged: bool,
}

/// Result of `claude_desktop_apply`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ClaudeDesktopApplied {
    /// The config file that was written.
    pub config_path: PathBuf,
    /// Where the original was copied, or null when there was no file or
    /// nothing changed.
    pub backup_path: Option<PathBuf>,
    /// Old HedgeBuddy backups removed to keep the newest five.
    pub removed_backups: Vec<PathBuf>,
}

/// Whether Claude Desktop is set up to start HedgeBuddy, and the commands
/// that set up other clients. Reads the config file only.
pub fn claude_desktop_status(
    ctx: &Context,
    bundle: &Bundle,
) -> Result<ClaudeDesktopStatus, ToolError> {
    let config_path = config_path(ctx.hedge.host())?;
    let file = read_config(&config_path);
    let expected = expected(bundle);
    Ok(ClaudeDesktopStatus {
        state: file.state(expected.as_ref()),
        problem: file.problem(),
        current: file.current(),
        other_servers: file.other_servers(),
        expected,
        binary: bundle.binary.clone(),
        claude_code_command: claude_code_command(bundle),
        client_json: client_json(bundle),
        config_path,
    })
}

/// What [`claude_desktop_apply`] would change, without writing anything.
/// The backup name it shows uses the time now; the one applied uses the
/// time it runs.
pub fn claude_desktop_plan(ctx: &Context, bundle: &Bundle) -> Result<ClaudeDesktopPlan, ToolError> {
    let change = prepare(ctx, bundle)?;
    let unchanged = change.unchanged();
    let exists = change.file.exists();
    Ok(ClaudeDesktopPlan {
        creates_file: !exists,
        backup_path: (exists && !unchanged).then(|| backup_path(&change.path, &backup_stamp())),
        before: change.file.current(),
        other_servers: change.file.other_servers(),
        unchanged,
        after: change.after,
        config_path: change.path,
    })
}

/// Set up Claude Desktop to start the bundled `hedgebuddy` command, under
/// the data folder's write lock. The existing file is copied to
/// `claude_desktop_config.<now>.hedgebuddy-backup.json` first, then the
/// merged config is written atomically, then older HedgeBuddy backups past
/// the newest five are removed. `now` is the local time as
/// `YYYYMMDD-HHMMSS` ([`backup_stamp`]). Writes nothing when Claude Desktop
/// is already set up.
pub fn claude_desktop_apply(
    ctx: &Context,
    bundle: &Bundle,
    now: &str,
) -> Result<ClaudeDesktopApplied, ToolError> {
    if !is_stamp(now) {
        return Err(ToolError::new(format!(
            "'{now}' is not a backup time (YYYYMMDD-HHMMSS)"
        )));
    }
    let _guard = ctx.write_guard()?;
    let change = prepare(ctx, bundle)?;
    let mut applied = ClaudeDesktopApplied {
        config_path: change.path.clone(),
        backup_path: None,
        removed_backups: Vec::new(),
    };
    if change.unchanged() {
        return Ok(applied);
    }
    if change.file.exists() {
        applied.backup_path = Some(write_backup(&change.path, now)?);
    }
    write_config(&change.path, merged(change.file, &change.after))?;
    if let Some(backup) = &applied.backup_path {
        applied.removed_backups = prune_backups(backup);
    }
    Ok(applied)
}

/// Now, in local time, as a backup stamp: `YYYYMMDD-HHMMSS`. The app passes
/// this to [`claude_desktop_apply`].
pub fn backup_stamp() -> String {
    jiff::Zoned::now().strftime("%Y%m%d-%H%M%S").to_string()
}

/// The config file this machine's Claude Desktop reads: on Windows, the
/// Microsoft Store package's redirected folder when exactly one `Claude_*`
/// package is installed, else `%APPDATA%\Claude`; on macOS,
/// `~/Library/Application Support/Claude`.
fn config_path(host: &dyn Host) -> Result<PathBuf, ToolError> {
    let folder = match host.os() {
        Os::Windows => match msix_folder(host) {
            Some(folder) => folder,
            None => expand_path(host, "%APPDATA%")?.join("Claude"),
        },
        Os::Macos => expand_path(host, "~")?
            .join("Library")
            .join("Application Support")
            .join("Claude"),
    };
    Ok(folder.join(CONFIG_NAME))
}

/// The Claude folder inside the one `%LOCALAPPDATA%\Packages\Claude_*`
/// package, or `None` when there is no such package or more than one.
fn msix_folder(host: &dyn Host) -> Option<PathBuf> {
    let packages = expand_path(host, "%LOCALAPPDATA%").ok()?.join("Packages");
    let found: Vec<PathBuf> = fs::read_dir(packages)
        .ok()?
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("Claude_"))
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    match found.as_slice() {
        [one] => Some(one.join("LocalCache").join("Roaming").join("Claude")),
        _ => None,
    }
}

/// What `claude_desktop_config.json` holds.
enum ConfigFile {
    /// There is no file; `folder_exists` tells "not set up" from "no Claude
    /// Desktop".
    Missing { folder_exists: bool },
    /// A JSON object whose `mcpServers`, if present, is an object.
    Object(Map<String, Value>),
    /// Why the file can't be used.
    Invalid(String),
}

/// Read the config at `path`.
fn read_config(path: &Path) -> ConfigFile {
    match fs::read(path) {
        Ok(bytes) => parse_config(&bytes),
        Err(e) if e.kind() == io::ErrorKind::NotFound => ConfigFile::Missing {
            folder_exists: path.parent().is_some_and(Path::is_dir),
        },
        Err(e) => ConfigFile::Invalid(format!("{CONFIG_NAME} can't be read: {e}")),
    }
}

/// The config in `bytes`: a JSON object whose `mcpServers`, if present, is
/// an object.
fn parse_config(bytes: &[u8]) -> ConfigFile {
    let invalid = |why: &str| ConfigFile::Invalid(format!("{CONFIG_NAME} isn't valid: {why}"));
    match serde_json::from_slice::<Value>(bytes) {
        Err(e) => invalid(&e.to_string()),
        Ok(Value::Object(map)) => match map.get("mcpServers") {
            Some(servers) if !servers.is_object() => invalid("\"mcpServers\" is not an object"),
            _ => ConfigFile::Object(map),
        },
        Ok(_) => invalid("it is not a JSON object"),
    }
}

impl ConfigFile {
    /// Whether the file exists and can be merged into.
    fn exists(&self) -> bool {
        matches!(self, ConfigFile::Object(_))
    }

    /// The `mcpServers` object, if the file has one.
    fn servers(&self) -> Option<&Map<String, Value>> {
        match self {
            ConfigFile::Object(map) => map.get("mcpServers").and_then(Value::as_object),
            _ => None,
        }
    }

    /// Whether `mcpServers` has a `hedgebuddy` entry, of any shape.
    fn has_entry(&self) -> bool {
        self.servers().is_some_and(|s| s.contains_key(ENTRY_NAME))
    }

    /// The `hedgebuddy` entry as a command and its arguments, or `None`
    /// when there is none or it isn't shaped like one.
    fn current(&self) -> Option<ServerEntry> {
        let entry = self.servers()?.get(ENTRY_NAME)?;
        let command = entry.get("command")?.as_str()?.to_owned();
        let args = match entry.get("args") {
            None => Vec::new(),
            Some(args) => args
                .as_array()?
                .iter()
                .map(|a| a.as_str().map(str::to_owned))
                .collect::<Option<_>>()?,
        };
        Some(ServerEntry { command, args })
    }

    /// The names of the other entries in `mcpServers`.
    fn other_servers(&self) -> Vec<String> {
        self.servers()
            .into_iter()
            .flat_map(|servers| servers.keys())
            .filter(|name| *name != ENTRY_NAME)
            .cloned()
            .collect()
    }

    /// Why the file can't be used, if it can't.
    fn problem(&self) -> Option<String> {
        match self {
            ConfigFile::Invalid(problem) => Some(problem.clone()),
            _ => None,
        }
    }

    /// Whether HedgeBuddy is set up, against the entry Set up writes. With
    /// no entry to compare (no bundled command), any usable entry counts.
    fn state(&self, expected: Option<&ServerEntry>) -> ClaudeDesktopState {
        use ClaudeDesktopState::*;
        match self {
            ConfigFile::Invalid(_) => Invalid,
            ConfigFile::Missing {
                folder_exists: false,
            } => NoClaude,
            ConfigFile::Missing { .. } => NotSetUp,
            ConfigFile::Object(_) if !self.has_entry() => NotSetUp,
            ConfigFile::Object(_) => match (self.current(), expected) {
                (Some(current), Some(expected)) if current == *expected => SetUp,
                (Some(_), None) => SetUp,
                _ => Outdated,
            },
        }
    }
}

/// The entry Set up writes, or `None` without a bundled command.
fn expected(bundle: &Bundle) -> Option<ServerEntry> {
    bundle.binary.as_ref().map(|binary| ServerEntry {
        command: binary.display().to_string(),
        args: vec!["mcp".into()],
    })
}

/// The Claude Code command that adds HedgeBuddy.
fn claude_code_command(bundle: &Bundle) -> String {
    match &bundle.binary {
        Some(binary) => format!(r#"claude mcp add hedgebuddy -- "{}" mcp"#, binary.display()),
        None => "claude mcp add hedgebuddy -- hedgebuddy mcp".into(),
    }
}

/// A config other MCP clients can take, pretty-printed.
fn client_json(bundle: &Bundle) -> String {
    let entry = expected(bundle).unwrap_or_else(|| ServerEntry {
        command: "hedgebuddy".into(),
        args: vec!["mcp".into()],
    });
    let config = json!({ "mcpServers": { ENTRY_NAME: entry } });
    serde_json::to_string_pretty(&config).expect("JSON values serialize")
}

/// A change [`claude_desktop_apply`] can make.
struct Change {
    /// The config file.
    path: PathBuf,
    /// What it holds now (never [`ConfigFile::Invalid`]).
    file: ConfigFile,
    /// The entry to write.
    after: ServerEntry,
}

impl Change {
    /// Whether the file already has the entry.
    fn unchanged(&self) -> bool {
        self.file.state(Some(&self.after)) == ClaudeDesktopState::SetUp
    }
}

/// The change to make, or why none can be: the build has no bundled
/// command, or the config can't be read or isn't valid.
fn prepare(ctx: &Context, bundle: &Bundle) -> Result<Change, ToolError> {
    let after = expected(bundle).ok_or_else(|| ToolError::new(NO_BINARY))?;
    let path = config_path(ctx.hedge.host())?;
    match read_config(&path) {
        ConfigFile::Invalid(problem) => Err(ToolError::new(format!(
            "{problem}. HedgeBuddy leaves it as it is: fix it or move it away, then try again"
        ))),
        file => Ok(Change { path, file, after }),
    }
}

/// `file` with `mcpServers.hedgebuddy` running `after`: the entry's
/// `command` and `args` are replaced and its other keys kept; everything
/// else in the file stays as it is.
fn merged(file: ConfigFile, after: &ServerEntry) -> Value {
    let mut config = match file {
        ConfigFile::Object(map) => map,
        _ => Map::new(),
    };
    let servers = config.entry("mcpServers").or_insert_with(|| json!({}));
    if let Some(servers) = servers.as_object_mut() {
        set_entry(servers, after);
    }
    Value::Object(config)
}

/// Set `servers.hedgebuddy`'s `command` and `args` to `after`'s.
fn set_entry(servers: &mut Map<String, Value>, after: &ServerEntry) {
    let entry = servers.entry(ENTRY_NAME).or_insert_with(|| json!({}));
    if !entry.is_object() {
        *entry = json!({});
    }
    if let Some(entry) = entry.as_object_mut() {
        entry.insert("command".into(), json!(after.command));
        entry.insert("args".into(), json!(after.args));
    }
}

/// Write `config` to `path` as pretty JSON, atomically.
fn write_config(path: &Path, config: Value) -> Result<(), ToolError> {
    let mut bytes = serde_json::to_vec_pretty(&config).expect("JSON values serialize");
    bytes.push(b'\n');
    Ok(write_atomic(path, &bytes, false)?)
}

/// `claude_desktop_config.<stamp>.hedgebuddy-backup.json` beside `config`.
fn backup_path(config: &Path, stamp: &str) -> PathBuf {
    config.with_file_name(format!("{BACKUP_PREFIX}{stamp}{BACKUP_SUFFIX}"))
}

/// Copy the config at `path` to its backup for `stamp`.
fn write_backup(path: &Path, stamp: &str) -> Result<PathBuf, ToolError> {
    let backup = backup_path(path, stamp);
    fs::copy(path, &backup).map_err(|e| {
        ToolError::new(format!(
            "couldn't back up {} to {}: {e}",
            path.display(),
            backup.display()
        ))
    })?;
    Ok(backup)
}

/// Remove HedgeBuddy backups beside `newest` so that it and the four newest
/// others remain. Returns what was removed; one that can't be removed is
/// left, and not listed.
fn prune_backups(newest: &Path) -> Vec<PathBuf> {
    let Some(folder) = newest.parent() else {
        return Vec::new();
    };
    let mut others: Vec<PathBuf> = fs::read_dir(folder)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.as_path() != newest && is_backup_name(p))
        .collect();
    others.sort();
    let excess = others.len().saturating_sub(BACKUP_KEEP - 1);
    others
        .into_iter()
        .take(excess)
        .filter(|p| fs::remove_file(p).is_ok())
        .collect()
}

/// Whether `path` is named `claude_desktop_config.<stamp>.hedgebuddy-backup.json`.
fn is_backup_name(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| n.strip_prefix(BACKUP_PREFIX))
        .and_then(|n| n.strip_suffix(BACKUP_SUFFIX))
        .is_some_and(is_stamp)
}

/// Whether `s` is `YYYYMMDD-HHMMSS`: eight digits, `-`, six digits.
fn is_stamp(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 15
        && b.iter().enumerate().all(|(i, c)| {
            if i == 8 {
                *c == b'-'
            } else {
                c.is_ascii_digit()
            }
        })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::Arc;
    use std::time::Duration;

    use hedgebuddy_core::{FakeHost, Os, Store};
    use serde_json::{json, Value};
    use tempfile::TempDir;

    use super::*;
    use crate::app::checked;
    use crate::test_ctx;

    const BIN: &str = "/opt/hb";
    const NOW: &str = "20260928-120000";

    /// A Windows machine whose `%APPDATA%` and `%LOCALAPPDATA%` live in a
    /// temporary folder: (that folder, the store's folder, the context).
    fn windows() -> (TempDir, TempDir, Context) {
        let machine = tempfile::tempdir().unwrap();
        let host = FakeHost::new(Os::Windows)
            .with_env(
                "APPDATA",
                &machine.path().join("Roaming").display().to_string(),
            )
            .with_env(
                "LOCALAPPDATA",
                &machine.path().join("Local").display().to_string(),
            );
        let (store, _fake, ctx) = test_ctx(host);
        (machine, store, ctx)
    }

    fn bundled() -> Bundle {
        Bundle {
            binary: Some(PathBuf::from(BIN)),
            wheel: None,
        }
    }

    fn expected_entry() -> ServerEntry {
        ServerEntry {
            command: PathBuf::from(BIN).display().to_string(),
            args: vec!["mcp".into()],
        }
    }

    /// `%APPDATA%\Claude\claude_desktop_config.json` on the machine.
    fn appdata_config(machine: &Path) -> PathBuf {
        machine
            .join("Roaming")
            .join("Claude")
            .join("claude_desktop_config.json")
    }

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    fn read_json(path: &Path) -> Value {
        serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
    }

    fn status(ctx: &Context, bundle: &Bundle) -> ClaudeDesktopStatus {
        checked(
            "claude_desktop_status",
            claude_desktop_status(ctx, bundle).unwrap(),
        )
    }

    fn apply(ctx: &Context, bundle: &Bundle, now: &str) -> ClaudeDesktopApplied {
        checked(
            "claude_desktop_apply",
            claude_desktop_apply(ctx, bundle, now).unwrap(),
        )
    }

    /// The names of the files in `folder`, sorted.
    fn names_in(folder: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn is_backup(name: &str) -> bool {
        name.starts_with("claude_desktop_config.") && name.ends_with(".hedgebuddy-backup.json")
    }

    #[test]
    fn windows_path_is_appdata_claude() {
        let (m, _s, ctx) = windows();
        fs::create_dir_all(m.path().join("Local")).unwrap();
        let st = status(&ctx, &bundled());
        assert_eq!(st.config_path, appdata_config(m.path()));
        assert_eq!(st.state, ClaudeDesktopState::NoClaude);
        assert_eq!(st.problem, None);
        assert_eq!(st.current, None);
        assert!(st.other_servers.is_empty());
    }

    #[test]
    fn windows_msix_package_path_wins() {
        let (m, _s, ctx) = windows();
        let packages = m.path().join("Local").join("Packages");
        let claude = packages
            .join("Claude_pzs8sxrjxfjjc")
            .join("LocalCache")
            .join("Roaming")
            .join("Claude");
        fs::create_dir_all(&claude).unwrap();
        fs::create_dir_all(packages.join("Microsoft.WindowsNotepad_8wekyb3d8bbwe")).unwrap();
        let st = status(&ctx, &bundled());
        assert_eq!(st.config_path, claude.join("claude_desktop_config.json"));
        assert_eq!(st.state, ClaudeDesktopState::NotSetUp);
    }

    #[test]
    fn two_claude_packages_fall_back_to_appdata() {
        let (m, _s, ctx) = windows();
        let packages = m.path().join("Local").join("Packages");
        fs::create_dir_all(packages.join("Claude_one")).unwrap();
        fs::create_dir_all(packages.join("Claude_two")).unwrap();
        assert_eq!(
            status(&ctx, &bundled()).config_path,
            appdata_config(m.path())
        );
    }

    #[test]
    fn macos_path_is_application_support() {
        let machine = tempfile::tempdir().unwrap();
        let (_s, _f, ctx) = test_ctx(FakeHost::new(Os::Macos).with_home(machine.path()));
        let st = status(&ctx, &bundled());
        assert_eq!(
            st.config_path,
            machine
                .path()
                .join("Library")
                .join("Application Support")
                .join("Claude")
                .join("claude_desktop_config.json")
        );
        assert_eq!(st.state, ClaudeDesktopState::NoClaude);
    }

    #[test]
    fn status_states() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        assert_eq!(status(&ctx, &bundled()).state, ClaudeDesktopState::NotSetUp);

        write(&path, r#"{"mcpServers":{"other":{"command":"x"}}}"#);
        let st = status(&ctx, &bundled());
        assert_eq!(st.state, ClaudeDesktopState::NotSetUp);
        assert_eq!(st.other_servers, ["other"]);
        assert_eq!(st.current, None);
        assert_eq!(st.expected, Some(expected_entry()));

        write(
            &path,
            r#"{"mcpServers":{"other":{"command":"x"},"hedgebuddy":{"command":"hedgebuddy","args":["mcp"]}}}"#,
        );
        let st = status(&ctx, &bundled());
        assert_eq!(st.state, ClaudeDesktopState::Outdated);
        assert_eq!(
            st.current,
            Some(ServerEntry {
                command: "hedgebuddy".into(),
                args: vec!["mcp".into()]
            })
        );
        assert_eq!(st.other_servers, ["other"]);

        let set_up = json!({"mcpServers": {"hedgebuddy": expected_entry()}});
        write(&path, &set_up.to_string());
        assert_eq!(status(&ctx, &bundled()).state, ClaudeDesktopState::SetUp);

        for bad in ["[1,2]", r#"{"mcpServers": 3}"#, "not json {"] {
            write(&path, bad);
            let st = status(&ctx, &bundled());
            assert_eq!(st.state, ClaudeDesktopState::Invalid, "{bad}");
            assert!(st.problem.is_some(), "{bad}");
            assert_eq!(st.current, None, "{bad}");
        }
    }

    #[test]
    fn an_entry_without_a_bundled_binary_to_compare_reads_as_set_up() {
        let (m, _s, ctx) = windows();
        write(
            &appdata_config(m.path()),
            r#"{"mcpServers":{"hedgebuddy":{"command":"hedgebuddy","args":["mcp"]}}}"#,
        );
        let st = status(&ctx, &Bundle::default());
        assert_eq!(st.state, ClaudeDesktopState::SetUp);
        assert_eq!(st.expected, None);
    }

    #[test]
    fn a_malformed_entry_reads_as_outdated() {
        let (m, _s, ctx) = windows();
        write(
            &appdata_config(m.path()),
            r#"{"mcpServers":{"hedgebuddy":{"command":3}}}"#,
        );
        let st = status(&ctx, &bundled());
        assert_eq!(st.state, ClaudeDesktopState::Outdated);
        assert_eq!(st.current, None);
    }

    #[test]
    fn commands_quote_the_binary() {
        let (_m, _s, ctx) = windows();
        let st = status(&ctx, &bundled());
        let bin = PathBuf::from(BIN).display().to_string();
        assert_eq!(
            st.claude_code_command,
            format!(r#"claude mcp add hedgebuddy -- "{bin}" mcp"#)
        );
        assert_eq!(st.binary, Some(PathBuf::from(BIN)));
        let client: Value = serde_json::from_str(&st.client_json).unwrap();
        assert_eq!(
            client,
            json!({"mcpServers": {"hedgebuddy": {"command": bin, "args": ["mcp"]}}})
        );
        assert!(st.client_json.contains('\n'), "pretty-printed");

        let plain = status(&ctx, &Bundle::default());
        assert_eq!(
            plain.claude_code_command,
            "claude mcp add hedgebuddy -- hedgebuddy mcp"
        );
        assert_eq!(plain.binary, None);
        let client: Value = serde_json::from_str(&plain.client_json).unwrap();
        assert_eq!(
            client,
            json!({"mcpServers": {"hedgebuddy": {"command": "hedgebuddy", "args": ["mcp"]}}})
        );
    }

    #[test]
    fn plan_describes_the_change_without_writing() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        let original = r#"{"mcpServers":{"other":{"command":"x"},"hedgebuddy":{"command":"hedgebuddy","args":["mcp"]}}}"#;
        write(&path, original);
        let plan = checked(
            "claude_desktop_plan",
            claude_desktop_plan(&ctx, &bundled()).unwrap(),
        );
        assert_eq!(plan.config_path, path);
        assert!(!plan.creates_file);
        assert!(!plan.unchanged);
        let backup = plan.backup_path.expect("a backup is planned");
        assert_eq!(backup.parent(), path.parent());
        let name = backup.file_name().unwrap().to_string_lossy().into_owned();
        assert!(is_backup(&name), "{name}");
        assert_eq!(
            plan.before,
            Some(ServerEntry {
                command: "hedgebuddy".into(),
                args: vec!["mcp".into()]
            })
        );
        assert_eq!(plan.after, expected_entry());
        assert_eq!(plan.other_servers, ["other"]);
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
        assert_eq!(
            names_in(path.parent().unwrap()),
            ["claude_desktop_config.json"]
        );
    }

    #[test]
    fn plan_of_a_missing_or_set_up_file() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        let plan = claude_desktop_plan(&ctx, &bundled()).unwrap();
        assert!(plan.creates_file && !plan.unchanged);
        assert_eq!(plan.backup_path, None);
        assert_eq!(plan.before, None);
        assert!(!path.parent().unwrap().exists(), "the plan creates nothing");

        write(
            &path,
            &json!({"mcpServers": {"hedgebuddy": expected_entry()}}).to_string(),
        );
        let plan = checked(
            "claude_desktop_plan",
            claude_desktop_plan(&ctx, &bundled()).unwrap(),
        );
        assert!(plan.unchanged && !plan.creates_file);
        assert_eq!(plan.backup_path, None);
    }

    #[test]
    fn apply_keeps_other_servers_and_writes_a_backup() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        let original = r#"{
  "globalShortcut": "Ctrl+Space",
  "mcpServers": {"other": {"command": "x", "args": ["--y"], "env": {"K": "v"}}}
}"#;
        write(&path, original);
        let applied = apply(&ctx, &bundled(), NOW);
        assert_eq!(applied.config_path, path);
        let backup = path
            .parent()
            .unwrap()
            .join("claude_desktop_config.20260928-120000.hedgebuddy-backup.json");
        assert_eq!(applied.backup_path.as_deref(), Some(backup.as_path()));
        assert!(applied.removed_backups.is_empty());
        assert_eq!(fs::read_to_string(&backup).unwrap(), original);

        let now = read_json(&path);
        assert_eq!(now["globalShortcut"], "Ctrl+Space");
        assert_eq!(
            now["mcpServers"]["other"],
            json!({"command": "x", "args": ["--y"], "env": {"K": "v"}})
        );
        assert_eq!(
            now["mcpServers"]["hedgebuddy"],
            serde_json::to_value(expected_entry()).unwrap()
        );
        assert_eq!(status(&ctx, &bundled()).state, ClaudeDesktopState::SetUp);
    }

    #[test]
    fn apply_updates_the_entry_and_keeps_its_other_keys() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        write(
            &path,
            r#"{"mcpServers":{"hedgebuddy":{"command":"hedgebuddy","args":["mcp"],"env":{"HEDGEBUDDY_DATA_DIR":"D:\\hb"}}}}"#,
        );
        apply(&ctx, &bundled(), NOW);
        let entry = &read_json(&path)["mcpServers"]["hedgebuddy"];
        assert_eq!(entry["command"], expected_entry().command);
        assert_eq!(entry["args"], json!(["mcp"]));
        assert_eq!(entry["env"], json!({"HEDGEBUDDY_DATA_DIR": "D:\\hb"}));
    }

    #[test]
    fn apply_of_a_set_up_file_writes_nothing() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        let text = json!({"mcpServers": {"hedgebuddy": expected_entry()}}).to_string();
        write(&path, &text);
        let applied = apply(&ctx, &bundled(), NOW);
        assert_eq!(applied.backup_path, None);
        assert!(applied.removed_backups.is_empty());
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
        assert_eq!(
            names_in(path.parent().unwrap()),
            ["claude_desktop_config.json"]
        );
    }

    #[test]
    fn apply_creates_a_missing_file_and_folder() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        assert_eq!(status(&ctx, &bundled()).state, ClaudeDesktopState::NoClaude);
        let applied = apply(&ctx, &bundled(), NOW);
        assert_eq!(applied.backup_path, None);
        assert_eq!(
            read_json(&path),
            json!({"mcpServers": {"hedgebuddy": expected_entry()}})
        );
        assert!(fs::read_to_string(&path).unwrap().ends_with('\n'));
        assert_eq!(status(&ctx, &bundled()).state, ClaudeDesktopState::SetUp);
    }

    #[test]
    fn apply_refuses_invalid_and_missing_binary() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        write(&path, "not json {");
        let err = claude_desktop_apply(&ctx, &bundled(), NOW).unwrap_err();
        assert!(err.0.contains("isn't valid"), "{err}");
        assert_eq!(fs::read_to_string(&path).unwrap(), "not json {");
        assert_eq!(
            names_in(path.parent().unwrap()),
            ["claude_desktop_config.json"]
        );
        let err = claude_desktop_plan(&ctx, &bundled()).unwrap_err();
        assert!(err.0.contains("isn't valid"), "{err}");

        fs::remove_file(&path).unwrap();
        let err = claude_desktop_apply(&ctx, &Bundle::default(), NOW).unwrap_err();
        assert!(err.0.contains("no bundled hedgebuddy command"), "{err}");
        let err = claude_desktop_plan(&ctx, &Bundle::default()).unwrap_err();
        assert!(err.0.contains("no bundled hedgebuddy command"), "{err}");
        assert!(!path.exists());
    }

    #[test]
    fn apply_refuses_a_malformed_stamp() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        write(&path, "{}");
        for bad in ["", "2026-09-28", "20260928-12000x", "../../x"] {
            assert!(
                claude_desktop_apply(&ctx, &bundled(), bad).is_err(),
                "{bad}"
            );
        }
        assert_eq!(fs::read_to_string(&path).unwrap(), "{}");
    }

    #[test]
    fn backups_keep_the_newest_five() {
        let (m, _s, ctx) = windows();
        let path = appdata_config(m.path());
        write(&path, "{}");
        let folder = path.parent().unwrap().to_path_buf();
        let old = |d: u32| {
            folder.join(format!(
                "claude_desktop_config.2026010{d}-000000.hedgebuddy-backup.json"
            ))
        };
        for d in 1..=6 {
            fs::write(old(d), "{}").unwrap();
        }
        let unrelated = folder.join("claude_desktop_config.backup.json");
        fs::write(&unrelated, "{}").unwrap();

        let applied = apply(&ctx, &bundled(), NOW);
        assert_eq!(applied.removed_backups, [old(1), old(2)]);
        let kept: Vec<String> = names_in(&folder)
            .into_iter()
            .filter(|n| is_backup(n))
            .collect();
        assert_eq!(
            kept,
            [
                "claude_desktop_config.20260103-000000.hedgebuddy-backup.json",
                "claude_desktop_config.20260104-000000.hedgebuddy-backup.json",
                "claude_desktop_config.20260105-000000.hedgebuddy-backup.json",
                "claude_desktop_config.20260106-000000.hedgebuddy-backup.json",
                "claude_desktop_config.20260928-120000.hedgebuddy-backup.json",
            ]
        );
        assert!(unrelated.exists());
    }

    #[test]
    fn apply_takes_the_write_lock() {
        let (m, _s, ctx) = windows();
        let ctx = ctx.with_lock_timeout(Duration::from_millis(50));
        let other = Context::new(
            Store::open(ctx.store.root()),
            Arc::new(FakeHost::new(Os::Windows)),
        );
        let _held = other.write_guard().unwrap();
        let err = claude_desktop_apply(&ctx, &bundled(), NOW).unwrap_err();
        assert!(err.is_busy(), "{err}");
        assert!(!appdata_config(m.path()).exists());
    }

    #[test]
    fn backup_stamps_are_local_date_and_time() {
        let stamp = backup_stamp();
        let b = stamp.as_bytes();
        assert_eq!(b.len(), 15, "{stamp}");
        assert_eq!(b[8], b'-', "{stamp}");
        assert!(
            b.iter()
                .enumerate()
                .all(|(i, c)| i == 8 || c.is_ascii_digit()),
            "{stamp}"
        );
    }
}
