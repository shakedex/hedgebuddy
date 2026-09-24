//! File actions behind the editing screens (spec §4.3): whether paths exist
//! and their drives are mounted, which paths the app may reveal, how the
//! editor command becomes an argv, a new script's template, and profile
//! export and import. The Tauri crate adds what needs the OS (starting the
//! editor, the opener, the file dialogs); the argument and result types of
//! those commands live here too, so the generated TypeScript covers them.

use std::collections::HashMap;
use std::ffi::OsString;
use std::fs;
use std::path::{Component, Path, PathBuf, Prefix};

use hedgebuddy_core::{
    read_profile_export, validate_script_name, write_profile_export, CoreError, ImportSummary, Os,
    EXPORT_MAX_BYTES,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::resources::script_template_source;
use crate::{Context, ToolError};

/// The most paths one `path_status` call checks.
pub const PATH_STATUS_MAX: usize = 64;

/// Why `reveal_target` refuses a path.
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
    /// Whether the path exists (false for a Windows device path such as
    /// `\\.\pipe\x`, which is never looked at).
    pub exists: bool,
    /// Whether its drive, network share or `/Volumes` volume is present
    /// (true for a relative, empty or device path, which has no drive to be
    /// missing).
    pub mounted: bool,
}

/// Whether each path exists and whether its drive is mounted, so a path
/// variable can say "not mounted" rather than "missing" for an offload
/// drive that is unplugged. Reads the file system only, and looks at each
/// drive's root at most once per call. A network share or `/Volumes` volume
/// is looked at before its paths: when it is missing, its paths read
/// `exists: false, mounted: false` without a look (each would otherwise wait
/// out the network on its own). Windows device paths (`\\.\…`,
/// `\\?\GLOBALROOT…`) are never looked at.
pub fn path_status(_ctx: &Context, args: PathStatusArgs) -> Result<PathStatusList, ToolError> {
    if args.paths.len() > PATH_STATUS_MAX {
        return Err(ToolError::new(format!(
            "path_status checks at most {PATH_STATUS_MAX} paths at a time"
        )));
    }
    Ok(PathStatusList {
        paths: path_states(args.paths, &mut |p: &Path| p.exists()),
    })
}

/// [`path_status`]'s answers, with `exists` the only way it looks at the
/// file system.
fn path_states(paths: Vec<String>, exists: &mut dyn FnMut(&Path) -> bool) -> Vec<PathState> {
    let mut roots = Roots::default();
    let mut states = Vec::with_capacity(paths.len());
    for path in paths {
        let p = Path::new(&path);
        let (found, mounted) = if path.is_empty() || is_device_path(p) {
            (false, true)
        } else {
            match volume_of(p) {
                None => (exists(p), true),
                // A root already found missing: none of its paths is looked at.
                Some(v) if roots.known_missing(&v.root) => (false, false),
                Some(v) if v.root_first => {
                    if roots.present(&v.root, exists) {
                        (exists(p), true)
                    } else {
                        (false, false)
                    }
                }
                // A path that exists is on a mounted drive; only a missing
                // one needs its root looked at.
                Some(v) => {
                    if exists(p) {
                        (true, true)
                    } else {
                        (false, roots.present(&v.root, exists))
                    }
                }
            }
        };
        states.push(PathState {
            path,
            exists: found,
            mounted,
        });
    }
    states
}

/// Whether each volume root seen in one `path_status` call is present, by
/// its lowercase text, so each is looked at once.
#[derive(Default)]
struct Roots(HashMap<String, bool>);

impl Roots {
    /// Whether `root` was already looked at and found missing.
    fn known_missing(&self, root: &Path) -> bool {
        self.0.get(&Self::key(root)) == Some(&false)
    }

    /// Whether `root` is present, looking at it only the first time.
    fn present(&mut self, root: &Path, exists: &mut dyn FnMut(&Path) -> bool) -> bool {
        *self
            .0
            .entry(Self::key(root))
            .or_insert_with(|| exists(root))
    }

    fn key(root: &Path) -> String {
        root.to_string_lossy().to_lowercase()
    }
}

/// The drive a path lives on, when it has one that can be missing.
struct Volume {
    /// `C:\` for `C:\x`, `\\server\share\` for a UNC path, and on macOS
    /// `/Volumes/<name>` for a path under it.
    root: PathBuf,
    /// Whether to look at the root before the path: true for a network
    /// share and a `/Volumes` volume, where a missing root makes every look
    /// at a path on it slow.
    root_first: bool,
}

/// The volume `path` lives on; `None` for relative paths and every other
/// absolute path.
fn volume_of(path: &Path) -> Option<Volume> {
    let mut components = path.components();
    match components.next()? {
        Component::Prefix(prefix) => {
            let mut root = OsString::from(prefix.as_os_str());
            root.push("\\");
            Some(Volume {
                root: PathBuf::from(root),
                root_first: is_network_path(path),
            })
        }
        #[cfg(target_os = "macos")]
        Component::RootDir => match (components.next(), components.next()) {
            (Some(Component::Normal(volumes)), Some(Component::Normal(name)))
                if volumes == "Volumes" =>
            {
                Some(Volume {
                    root: Path::new("/Volumes").join(name),
                    root_first: true,
                })
            }
            _ => None,
        },
        _ => None,
    }
}

/// Whether `path` is a Windows device path rather than a file's: `\\.\…`,
/// `\\?\…` other than a drive or `UNC` path (`\\?\GLOBALROOT…`,
/// `\\?\Volume{…}`), `//?/…`, `\??\…`, or this machine's named pipes and
/// mailslots reached as a share (`\\localhost\pipe\…`,
/// `\\127.0.0.1\pipe\…`, `\\?\UNC\localhost\pipe\…`). These reach raw
/// devices, pipes and mailslots, so they are never opened or looked at.
fn is_device_path(path: &Path) -> bool {
    let mut components = path.components();
    match components.next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::DeviceNS(_) | Prefix::Verbatim(_) => true,
            // `//?/x` is not verbatim (its separators are not `\`), so it
            // parses as share `x` of a server named `?`; Windows reads it as
            // a device path.
            Prefix::UNC(server, share) | Prefix::VerbatimUNC(server, share) => {
                server == "?"
                    || server == "."
                    || (is_this_machine(server)
                        && (share.eq_ignore_ascii_case("pipe")
                            || share.eq_ignore_ascii_case("mailslot")))
            }
            Prefix::Disk(_) | Prefix::VerbatimDisk(_) => false,
        },
        Some(Component::RootDir) => {
            cfg!(windows) && matches!(components.next(), Some(Component::Normal(s)) if s == "??")
        }
        _ => false,
    }
}

/// Whether a UNC server name is this machine: `localhost`, a loopback
/// address (`127.x.x.x`, `::1` with or without brackets, or its
/// `0--1.ipv6-literal.net` form), or on Windows the computer's own name.
fn is_this_machine(server: &std::ffi::OsStr) -> bool {
    let Some(name) = server.to_str() else {
        return false;
    };
    let name = name.to_ascii_lowercase();
    let bare = name.trim_start_matches('[').trim_end_matches(']');
    name == "localhost"
        || name == "0--1.ipv6-literal.net"
        || bare
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback())
        || (cfg!(windows)
            && std::env::var("COMPUTERNAME").is_ok_and(|me| me.eq_ignore_ascii_case(&name)))
}

/// `path` as lowercase parts, with `.` and `..` resolved by their text
/// alone (`..` at the root stays there, as the OS does), for comparing
/// paths without touching the file system. A drive or share reads the same
/// with or without `\\?\`. Lowercase makes the comparison looser than a
/// case-sensitive file system, never stricter than Windows or macOS.
fn lexical(path: &Path) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    // How many parts (a prefix, the root) `..` cannot remove.
    let mut floor = 0;
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => {
                let text = match prefix.kind() {
                    Prefix::Disk(d) | Prefix::VerbatimDisk(d) => format!("{}:", d as char),
                    Prefix::UNC(server, share) | Prefix::VerbatimUNC(server, share) => format!(
                        r"\\{}\{}",
                        server.to_string_lossy(),
                        share.to_string_lossy()
                    ),
                    _ => prefix.as_os_str().to_string_lossy().into_owned(),
                };
                parts.push(text.to_lowercase());
                floor = parts.len();
            }
            Component::RootDir => {
                parts.push(String::from("/"));
                floor = parts.len();
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if parts.len() > floor {
                    parts.pop();
                }
            }
            Component::Normal(name) => parts.push(name.to_string_lossy().to_lowercase()),
        }
    }
    parts
}

/// The canonical form of `path` when the app may show it in the file
/// manager (spec §4.3): it exists and is inside the data folder, or it is a
/// catalog app's resolved callback log or event log, or it is inside an
/// app's presets folder. A relative path, a device path, and every path
/// not inside one of those places by its text (`..` resolved, case ignored;
/// a local place's canonical text counts too, so long and 8.3 short names
/// both match) is refused before the path itself is looked at, so a refused
/// network path is never contacted. Then both sides are canonicalized
/// (resolving `..` and links) and compared component by component, so
/// `C:\data2` is not inside `C:\data` and a link out of the data folder
/// leads nowhere.
pub fn reveal_target(ctx: &Context, path: &str) -> Result<PathBuf, ToolError> {
    let given = Path::new(path);
    if !given.is_absolute() || is_device_path(given) {
        return Err(ToolError::new(REVEAL_REFUSED));
    }
    let allowed = RevealAllowed::of(ctx);
    if !allowed.admits_text(given) {
        return Err(ToolError::new(REVEAL_REFUSED));
    }
    let target =
        canonical(given).ok_or_else(|| ToolError::new(format!("{path} does not exist")))?;
    if allowed.admits(&target) {
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

/// The places `reveal_target` shows: folders (with everything inside them)
/// and single files. Only absolute, non-device paths are kept: an app path
/// that is relative (a registry override can hold one) would resolve
/// against the app's current folder.
struct RevealAllowed(Vec<Allowed>);

/// One place `reveal_target` shows.
struct Allowed {
    /// The path as HedgeBuddy knows it.
    path: PathBuf,
    /// Whether everything inside it is shown too (a folder), or only it.
    folder: bool,
    /// Whether it is on this machine rather than a network share.
    local: bool,
    /// Its canonical form, worked out up front when it is local.
    canonical: Option<PathBuf>,
}

impl RevealAllowed {
    /// The data folder, and each catalog app's resolved callback log, event
    /// log and presets folder. Apps that cannot be described are skipped.
    /// The local ones are canonicalized here: they are HedgeBuddy's own and
    /// the operator's paths, so looking at them contacts nothing the caller
    /// chose, and their canonical text (long names, where the configured
    /// text may use 8.3 short names such as `RUNNER~1`) is admitted too.
    fn of(ctx: &Context) -> RevealAllowed {
        let mut places = vec![(ctx.store.root().to_path_buf(), true)];
        for m in ctx.hedge.catalog().apps() {
            let Ok(app) = ctx.hedge.describe_app(&m.app.id) else {
                continue;
            };
            let files = app.files;
            places.extend(files.callback_log.map(|p| (p, false)));
            places.extend(files.event_log.map(|p| (p, false)));
            places.extend(files.presets_dir.map(|p| (p, true)));
        }
        RevealAllowed(
            places
                .into_iter()
                .filter(|(path, _)| path.is_absolute() && !is_device_path(path))
                .map(|(path, folder)| {
                    let local = !is_network_path(&path);
                    let canonical = if local { canonical(&path) } else { None };
                    Allowed {
                        path,
                        folder,
                        local,
                        canonical,
                    }
                })
                .collect(),
        )
    }

    /// Whether `path` is one of the files or inside one of the folders, by
    /// its text alone: against each place's own text and, for a local
    /// place, its canonical text.
    fn admits_text(&self, path: &Path) -> bool {
        let given = lexical(path);
        self.0.iter().any(|place| {
            std::iter::once(place.path.as_path())
                .chain(place.canonical.as_deref())
                .any(|p| {
                    let p = lexical(p);
                    if place.folder {
                        given.starts_with(&p)
                    } else {
                        given == p
                    }
                })
        })
    }

    /// Whether canonical `target` is one of the files or inside one of the
    /// folders, canonicalized (those that do not exist are skipped). A
    /// network place is looked at only now, after the text check passed.
    fn admits(&self, target: &Path) -> bool {
        self.0.iter().any(|place| {
            let canonical = if place.local {
                place.canonical.clone()
            } else {
                canonical(&place.path)
            };
            canonical.is_some_and(|c| {
                if place.folder {
                    target.starts_with(c)
                } else {
                    target == c
                }
            })
        })
    }
}

/// Whether `path` is on a network share (`\\server\share\…`).
fn is_network_path(path: &Path) -> bool {
    matches!(
        path.components().next(),
        Some(Component::Prefix(p)) if matches!(p.kind(), Prefix::UNC(..) | Prefix::VerbatimUNC(..))
    )
}

/// The argv that opens `file` with the operator's editor `command`. The
/// command is split into words the way a shell would, but no shell ever
/// runs it: whitespace separates words; `"…"` and `'…'` group, `\"` is a
/// quote inside double quotes, and nothing is escaped inside single quotes.
/// A word `{file}` is replaced by the path; with none, the path is appended.
/// An empty command, an unterminated quote, or a command whose first word
/// is empty or `{file}` (which would run the script rather than open it) is
/// an error.
pub fn editor_argv(command: &str, file: &Path) -> Result<Vec<String>, ToolError> {
    let mut words = split_words(command)?;
    match words.first().map(String::as_str) {
        None => return Err(ToolError::new("the editor command is empty")),
        Some(FILE_PLACEHOLDER) => {
            return Err(ToolError::new(
                "the editor command must start with a program, not {file}",
            ))
        }
        Some(program) if program.trim().is_empty() => {
            return Err(ToolError::new(
                "the editor command must start with a program, not an empty word",
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

/// The argv that opens `file` in a text editor when the operator has set no
/// editor command, and what to call that editor: Notepad on Windows, the
/// default text editor on macOS (`open -t`). Not the default app for `.py`
/// files, which is often Python itself and would run the script.
pub fn text_editor_argv(os: Os, file: &Path) -> Result<(Vec<String>, &'static str), ToolError> {
    let path = file
        .to_str()
        .ok_or_else(|| ToolError::new(format!("{} is not valid Unicode", file.display())))?
        .to_owned();
    Ok(match os {
        Os::Windows => (vec!["notepad.exe".to_owned(), path], "Notepad"),
        Os::Macos => (
            vec!["/usr/bin/open".to_owned(), "-t".to_owned(), path],
            "the default text editor",
        ),
    })
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

/// Where `program` is, found the way Windows finds a command. An absolute
/// `program` is returned as is when it is a file. A bare name is looked for
/// in each absolute directory of `path_var` (split with
/// [`std::env::split_paths`]) with each `pathext` extension (`;`-separated,
/// any case) and then as is. The current directory, and empty or relative
/// `PATH` entries (which mean it), are never searched, so a file planted
/// there cannot stand in for the editor; for the same reason a program with
/// a folder part that is not absolute (`.\code.cmd`, `bin/ed`, `C:ed.exe`)
/// is refused. `Ok(None)` when nothing is found.
pub fn find_in_path(
    program: &str,
    path_var: &str,
    pathext: &str,
) -> Result<Option<PathBuf>, ToolError> {
    if program.is_empty() {
        return Ok(None);
    }
    let p = Path::new(program);
    if p.is_absolute() {
        return Ok(p.is_file().then(|| p.to_path_buf()));
    }
    let has_dir = program.contains(['/', '\\'])
        || matches!(p.components().next(), Some(Component::Prefix(_)));
    if has_dir {
        return Err(ToolError::new(format!(
            "the editor program {program} is inside a relative folder; \
             use an absolute path or a bare program name"
        )));
    }
    let exts: Vec<String> = pathext
        .split(';')
        .map(str::trim)
        .filter(|e| !e.is_empty())
        .map(str::to_ascii_lowercase)
        .collect();
    Ok(std::env::split_paths(path_var)
        .filter(|dir| dir.is_absolute())
        .find_map(|dir| {
            exts.iter()
                .map(|ext| dir.join(format!("{program}{ext}")))
                .chain(std::iter::once(dir.join(program)))
                .find(|candidate| candidate.is_file())
        }))
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
    /// The absolute path of the file to write (replaced if it exists),
    /// outside the data folder.
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
/// `include_secrets`, its secret values) to `dest`, which must be outside
/// the data folder: an export written there could replace a profile's own
/// files. A read of the data folder, so it takes no lock.
pub fn export_profile(ctx: &Context, args: ExportArgs) -> Result<ExportResult, ToolError> {
    let dest = absolute(&args.dest, "export destination")?;
    if lands_in_data_folder(ctx, dest) {
        return Err(ToolError::new(format!(
            "{} is inside the data folder; export to a place outside it",
            args.dest
        )));
    }
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

/// Create profile `name` from the export file at `path`. The whole file is
/// read and checked first, and only then is the write lock taken, so a slow
/// or broken file never holds up other writes.
pub fn import_profile(ctx: &Context, args: ImportArgs) -> Result<ImportSummary, ToolError> {
    let path = absolute(&args.path, "export file")?;
    let export = read_profile_export(path, EXPORT_MAX_BYTES)?;
    let _guard = ctx.write_guard()?;
    Ok(ctx.store.import_profile(&export, &args.name)?)
}

/// Whether writing absolute `dest` would land inside the data folder: by
/// its text (`..` resolved, case ignored), or through a link on the way to
/// its nearest folder that exists. The export creates missing folders and
/// replaces `dest` itself rather than writing through it, so the file's own
/// target does not matter.
fn lands_in_data_folder(ctx: &Context, dest: &Path) -> bool {
    let root = ctx.store.root();
    if lexical(dest).starts_with(&lexical(root)) {
        return true;
    }
    let Some(root) = canonical(root) else {
        return false;
    };
    dest.ancestors()
        .skip(1)
        .find_map(canonical)
        .is_some_and(|folder| folder.starts_with(root))
}

/// `path` when it is absolute: a relative one would resolve against the
/// app's working directory, which the operator never chose. A Windows
/// device path is not a file path and is refused too.
fn absolute<'a>(path: &'a str, what: &str) -> Result<&'a Path, ToolError> {
    let p = Path::new(path);
    if is_device_path(p) {
        Err(ToolError::new(format!(
            "the {what} must be a file path, not '{path}'"
        )))
    } else if p.is_absolute() {
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

/// The docs page of catalog app `app`, when it is an `https://` address:
/// the browser opens nothing else (a catalog override could name a local
/// program or a `file:` URL).
pub fn app_docs_url(ctx: &Context, app: &str) -> Result<String, ToolError> {
    let docs = &ctx.hedge.catalog().app(app)?.app.docs;
    if docs.starts_with("https://") {
        Ok(docs.clone())
    } else {
        Err(ToolError::new(format!(
            "the docs link of {app} is not an https:// address: {docs}"
        )))
    }
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
            find_in_path("code", &path_var, ".EXE;.CMD").unwrap(),
            Some(dir.path().join("code.cmd"))
        );
        assert_eq!(find_in_path("nope", &path_var, ".EXE;.CMD").unwrap(), None);
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
            find_in_path("code", &both, ".EXE;.CMD").unwrap(),
            Some(first.path().join("code.cmd"))
        );
        assert_eq!(
            find_in_path("code", &both, "").unwrap(),
            Some(first.path().join("code"))
        );
        assert_eq!(
            find_in_path("code.exe", &both, ".EXE").unwrap(),
            Some(second.path().join("code.exe"))
        );
        // A folder is not a program.
        assert_eq!(find_in_path("tool", &both, ".EXE").unwrap(), None);
        // A path is used as is, and only when it is a file.
        let full = first.path().join("code").display().to_string();
        assert_eq!(
            find_in_path(&full, "", ".EXE").unwrap(),
            Some(first.path().join("code"))
        );
        let gone = first.path().join("gone").display().to_string();
        assert_eq!(find_in_path(&gone, &both, ".EXE").unwrap(), None);
        assert_eq!(find_in_path("", &both, ".EXE").unwrap(), None);
        // Relative and empty PATH entries mean the current folder, which is
        // never searched: tests run in the crate folder, next to Cargo.toml.
        assert!(Path::new("Cargo.toml").is_file());
        assert_eq!(find_in_path("Cargo", ".", ".TOML").unwrap(), None);
        assert_eq!(find_in_path("Cargo.toml", ".", "").unwrap(), None);
        let empty_entry = format!("{}{}", if cfg!(windows) { ";" } else { ":" }, both);
        assert_eq!(find_in_path("Cargo.toml", &empty_entry, "").unwrap(), None);
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

    /// A context whose data folder holds a catalog override `relapp` with
    /// `files` as its `[files.<os>]` table.
    fn ctx_with_app_files(files: &str) -> (tempfile::TempDir, Context) {
        let dir = tempfile::tempdir().unwrap();
        let store = hedgebuddy_core::Store::open(dir.path().join("HedgeBuddy"));
        std::fs::create_dir_all(store.catalog_dir()).unwrap();
        let manifest = format!(
            "catalog_version = 1\ntested_against = \"1.0\"\n[app]\nid = \"relapp\"\n\
             name = \"Rel App\"\ndocs = \"https://example.com\"\n\
             [files.windows]\n{files}\n[files.macos]\n{files}\n"
        );
        std::fs::write(store.catalog_dir().join("relapp.toml"), manifest).unwrap();
        let ctx = Context::new(store, std::sync::Arc::new(FakeHost::new(Os::Windows)));
        assert_eq!(ctx.catalog_error, None);
        (dir, ctx)
    }

    #[test]
    fn reveal_skips_app_paths_that_are_not_absolute() {
        // Tests run in the crate folder: a relative app path would resolve
        // against it and let any file there be revealed.
        let cargo_toml = std::fs::canonicalize("Cargo.toml").unwrap();
        let lib_rs = std::fs::canonicalize("src/lib.rs").unwrap();
        let (_d, ctx) =
            ctx_with_app_files("callback_log = \"Cargo.toml\"\nevent_log = \"Cargo.toml\"");
        let err = reveal_target(&ctx, &cargo_toml.display().to_string()).unwrap_err();
        assert_eq!(err.0, REVEAL_REFUSED);
        // A relative presets folder, as a registry override could hold.
        let host = FakeHost::new(Os::Windows).with_registry_value(
            r"HKCU\Software\Hedge",
            "PresetsLocation",
            hedgebuddy_core::host::RegValue::String("src".into()),
        );
        let (_d, _f, ctx) = test_ctx(host);
        let err = reveal_target(&ctx, &lib_rs.display().to_string()).unwrap_err();
        assert_eq!(err.0, REVEAL_REFUSED);
        // The same files, named absolutely, are allowed.
        let (_d, ctx) = ctx_with_app_files(&format!("callback_log = '{}'", cargo_toml.display()));
        assert_eq!(
            reveal_target(&ctx, &cargo_toml.display().to_string()).unwrap(),
            cargo_toml
        );
    }

    #[test]
    fn reveal_refuses_before_looking_at_the_file_system() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        // A missing path outside the allowed places is refused as such, not
        // reported missing: nothing looked for it.
        let outside = dir.path().join("gone.txt").display().to_string();
        assert_eq!(reveal_target(&ctx, &outside).unwrap_err().0, REVEAL_REFUSED);
        // Inside the data folder, a missing path is reported missing.
        let missing = ctx.store.root().join("gone.txt").display().to_string();
        assert!(reveal_target(&ctx, &missing)
            .unwrap_err()
            .0
            .contains("does not exist"));
        // `..` is resolved by its text first; `<data>/../gone.txt` is outside.
        let up = ctx.store.root().join("..").join("gone.txt");
        assert_eq!(
            reveal_target(&ctx, &up.display().to_string())
                .unwrap_err()
                .0,
            REVEAL_REFUSED
        );
        // Other spellings of the data folder's own path are inside it: a
        // different case, the `\\?\` form of its text, and its canonical form
        // (long names even when the data folder's text has 8.3 short names,
        // as a `TEMP` of `C:\Users\RUNNER~1\…` gives it in CI).
        #[cfg(windows)]
        {
            let root = ctx.store.root().display().to_string();
            let upper = root.to_uppercase();
            assert!(reveal_target(&ctx, &upper).is_ok(), "{upper}");
            let verbatim_text = format!(r"\\?\{root}");
            assert!(
                reveal_target(&ctx, &verbatim_text).is_ok(),
                "{verbatim_text}"
            );
            let canonical = std::fs::canonicalize(ctx.store.root()).unwrap();
            let profiles = canonical.join("profiles").display().to_string();
            assert!(reveal_target(&ctx, &profiles).is_ok(), "{profiles}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn reveal_never_contacts_shares_or_devices() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        for p in [
            r"\\hb-no-such-host.invalid\share\x.txt",
            r"\\.\pipe\hb-no-such-pipe",
            r"\\.\C:\Windows",
            r"//./C:/Windows",
            r"\\?\GLOBALROOT\Device\Null",
            r"//?/GLOBALROOT/Device/Null",
            r"\\?\Volume{00000000-0000-0000-0000-000000000000}\x",
            r"\??\C:\Windows",
        ] {
            let started = std::time::Instant::now();
            assert_eq!(reveal_target(&ctx, p).unwrap_err().0, REVEAL_REFUSED, "{p}");
            assert!(started.elapsed() < std::time::Duration::from_secs(1), "{p}");
        }
    }

    #[test]
    fn a_program_with_a_relative_folder_is_refused() {
        // Such a program would resolve against the app's current folder.
        let mut relative = vec![r".\code.cmd", "./code", "bin/ed", r"bin\ed.exe"];
        if cfg!(windows) {
            relative.extend([r"C:ed.exe", r"\Tools\ed.exe"]);
        }
        for program in relative {
            let err = find_in_path(program, "", ".EXE").unwrap_err();
            assert!(
                err.0
                    .contains("use an absolute path or a bare program name"),
                "{program}: {err}"
            );
        }
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("ed.exe"), "").unwrap();
        let full = dir.path().join("ed.exe");
        assert_eq!(
            find_in_path(&full.display().to_string(), "", "").unwrap(),
            Some(full)
        );
        assert_eq!(find_in_path("ed", "", ".EXE").unwrap(), None);
    }

    /// `path_states` with a file system in which only `present` exist,
    /// and the paths it looked at, in order.
    #[cfg(any(windows, target_os = "macos"))]
    fn probed(paths: &[&str], present: &[&str]) -> (Vec<PathState>, Vec<String>) {
        let mut seen = Vec::new();
        let states = path_states(
            paths.iter().map(|p| p.to_string()).collect(),
            &mut |p: &Path| {
                let p = p.display().to_string();
                let found = present.contains(&p.as_str());
                seen.push(p);
                found
            },
        );
        (states, seen)
    }

    #[cfg(any(windows, target_os = "macos"))]
    fn state(path: &str, exists: bool, mounted: bool) -> PathState {
        PathState {
            path: path.into(),
            exists,
            mounted,
        }
    }

    #[cfg(windows)]
    #[test]
    fn path_status_looks_at_each_volume_once_and_shares_before_their_paths() {
        let paths = [
            r"\\nas\media\a",
            r"\\NAS\Media\b",
            r"Q:\one",
            r"q:\two",
            r"\\live\share\x",
            r"C:\there",
        ];
        let (states, seen) = probed(&paths, &[r"\\live\share\", r"C:\there"]);
        assert_eq!(
            states,
            [
                state(r"\\nas\media\a", false, false),
                state(r"\\NAS\Media\b", false, false),
                state(r"Q:\one", false, false),
                state(r"q:\two", false, false),
                state(r"\\live\share\x", false, true),
                state(r"C:\there", true, true),
            ]
        );
        // A missing share is looked at once and its paths never; a drive's
        // path comes first and its root once, and once the root is known to
        // be missing the drive's other paths are not looked at.
        assert_eq!(
            seen,
            [
                r"\\nas\media\",
                r"Q:\one",
                r"Q:\",
                r"\\live\share\",
                r"\\live\share\x",
                r"C:\there",
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn path_status_never_looks_at_devices() {
        let devices = [
            r"\\.\pipe\x",
            r"//./C:/x",
            r"\\?\GLOBALROOT\Device\Null",
            r"//?/GLOBALROOT/Device/Null",
            r"\\?\Volume{00000000-0000-0000-0000-000000000000}\x",
            r"\??\C:\x",
            // Named pipes and mailslots of this machine, through a share.
            r"\\localhost\pipe\x",
            r"\\LOCALHOST\PIPE\x",
            r"\\?\UNC\localhost\pipe\x",
            r"\\127.0.0.1\pipe\x",
            r"\\127.1.2.3\pipe\x",
            r"\\0--1.ipv6-literal.net\pipe\x",
            r"\\localhost\mailslot\x",
        ];
        let (states, seen) = probed(&devices, &[]);
        assert!(seen.is_empty(), "{seen:?}");
        assert!(states.iter().all(|s| !s.exists), "{states:?}");
        // Verbatim drive and share paths are ordinary paths.
        let (states, _) = probed(&[r"\\?\C:\x"], &[r"\\?\C:\x"]);
        assert_eq!(states, [state(r"\\?\C:\x", true, true)]);
        let (states, seen) = probed(&[r"\\?\UNC\nas\media\x"], &[]);
        assert_eq!(states, [state(r"\\?\UNC\nas\media\x", false, false)]);
        assert_eq!(seen, [r"\\?\UNC\nas\media\"]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn path_status_looks_at_each_volume_once_and_before_its_paths() {
        let paths = [
            "/Volumes/Gone/a",
            "/Volumes/Gone/b",
            "/Volumes/Here/x",
            "/tmp/y",
        ];
        let (states, seen) = probed(&paths, &["/Volumes/Here"]);
        assert_eq!(
            states,
            [
                state("/Volumes/Gone/a", false, false),
                state("/Volumes/Gone/b", false, false),
                state("/Volumes/Here/x", false, true),
                state("/tmp/y", false, true),
            ]
        );
        assert_eq!(
            seen,
            [
                "/Volumes/Gone",
                "/Volumes/Here",
                "/Volumes/Here/x",
                "/tmp/y"
            ]
        );
    }

    #[test]
    fn docs_open_only_over_https() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        assert_eq!(
            app_docs_url(&ctx, "offshoot").unwrap(),
            "https://docs.hedge.video/offshoot/features/automation"
        );
        assert!(app_docs_url(&ctx, "nope").is_err());
        for docs in [
            "http://example.com",
            "file:///C:/Windows/System32/calc.exe",
            "HTTPS://example.com",
            " https://example.com",
            "C:\\docs.html",
        ] {
            let dir = tempfile::tempdir().unwrap();
            let store = hedgebuddy_core::Store::open(dir.path().join("HedgeBuddy"));
            std::fs::create_dir_all(store.catalog_dir()).unwrap();
            let manifest = format!(
                "catalog_version = 1\ntested_against = \"1.0\"\n[app]\nid = \"relapp\"\n\
                 name = \"Rel App\"\ndocs = '{docs}'\n"
            );
            std::fs::write(store.catalog_dir().join("relapp.toml"), manifest).unwrap();
            let ctx = Context::new(store, std::sync::Arc::new(FakeHost::new(Os::Windows)));
            assert_eq!(ctx.catalog_error, None, "{docs}");
            let err = app_docs_url(&ctx, "relapp").unwrap_err();
            assert!(err.0.contains("https://"), "{docs}: {err}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn export_and_import_refuse_device_paths() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        for p in [r"\\.\pipe\hb-no-such-pipe", r"\\?\GLOBALROOT\Device\Null"] {
            let export = ExportArgs {
                name: "p".into(),
                include_secrets: false,
                dest: p.into(),
            };
            let err = export_profile(&ctx, export).unwrap_err();
            assert!(err.0.contains("file path"), "{p}: {err}");
            let import = ImportArgs {
                path: p.into(),
                name: "q".into(),
            };
            let err = import_profile(&ctx, import).unwrap_err();
            assert!(err.0.contains("file path"), "{p}: {err}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn only_this_machines_pipe_and_mailslot_shares_are_devices() {
        for p in [
            r"\\localhost\pipe\x",
            r"\\?\UNC\LocalHost\Pipe\x",
            r"\\127.0.0.1\pipe",
            r"\\[::1]\pipe\x",
            r"\\::1\pipe\x",
            r"\\localhost\mailslot\x",
        ] {
            assert!(is_device_path(Path::new(p)), "{p}");
        }
        if let Ok(me) = std::env::var("COMPUTERNAME") {
            let p = format!(r"\\{me}\pipe\x");
            assert!(is_device_path(Path::new(&p)), "{p}");
        }
        for p in [
            r"\\localhost\share\x",
            r"\\127.0.0.1\c$\x",
            r"\\nas\media\pipe",
            r"\\localhost\pipes\x",
            r"C:\pipe\x",
        ] {
            assert!(!is_device_path(Path::new(p)), "{p}");
        }
    }

    #[test]
    fn without_an_editor_command_a_text_editor_opens_the_script() {
        let f = Path::new("/d/a b.py");
        assert_eq!(
            text_editor_argv(Os::Windows, f).unwrap(),
            (
                vec!["notepad.exe".to_owned(), "/d/a b.py".to_owned()],
                "Notepad"
            )
        );
        assert_eq!(
            text_editor_argv(Os::Macos, f).unwrap(),
            (
                vec![
                    "/usr/bin/open".to_owned(),
                    "-t".to_owned(),
                    "/d/a b.py".to_owned()
                ],
                "the default text editor"
            )
        );
    }

    #[test]
    fn an_editor_command_needs_a_program() {
        let f = Path::new("/d/a.py");
        assert!(editor_argv("'' --x", f)
            .unwrap_err()
            .0
            .contains("must start with a program"));
        assert!(editor_argv("\"\"", f).is_err());
    }

    #[test]
    fn import_reads_the_file_before_waiting_for_the_lock() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = ctx.with_lock_timeout(std::time::Duration::from_millis(100));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let bad = dir.path().join("bad.json");
        std::fs::write(&bad, "not json").unwrap();
        let _held = hedgebuddy_core::Store::open(ctx.store.root())
            .lock()
            .unwrap();
        for path in [bad, dir.path().join("gone.json")] {
            let err = import_profile(
                &ctx,
                ImportArgs {
                    path: path.display().to_string(),
                    name: "q".into(),
                },
            )
            .unwrap_err();
            assert!(!err.is_busy(), "{err}");
            assert!(err.0.contains(&path.display().to_string()), "{err}");
        }
    }

    #[test]
    fn export_refuses_a_destination_in_the_data_folder() {
        let (dir, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let profile_json = ctx
            .store
            .root()
            .join("profiles")
            .join("p")
            .join("profile.json");
        let before = std::fs::read(&profile_json).unwrap();
        let root = ctx.store.root().to_path_buf();
        for dest in [
            profile_json.clone(),
            root.join("p.json"),
            root.join("new").join("p.json"),
            dir.path()
                .join("elsewhere")
                .join("..")
                .join("HedgeBuddy")
                .join("p.json"),
        ] {
            let err = export_profile(
                &ctx,
                ExportArgs {
                    name: "p".into(),
                    include_secrets: false,
                    dest: dest.display().to_string(),
                },
            )
            .unwrap_err();
            assert!(err.0.contains("data folder"), "{err}");
        }
        assert_eq!(std::fs::read(&profile_json).unwrap(), before);
        assert!(!root.join("p.json").exists());
        assert!(!root.join("new").exists());
        #[cfg(windows)]
        {
            let upper = root.join("p.json").display().to_string().to_uppercase();
            let args = ExportArgs {
                name: "p".into(),
                include_secrets: false,
                dest: upper,
            };
            assert!(export_profile(&ctx, args).is_err());
            assert!(!root.join("p.json").exists());
        }
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
