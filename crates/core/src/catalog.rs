//! The Hedge app catalog: one TOML manifest per Hedge app (see
//! `catalog/README.md`). Manifests are embedded in the binary and can be
//! replaced or extended from a folder of overrides.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::host::{Host, Os};
use crate::variable::validate_slug;

const EMBEDDED: [(&str, &str); 4] = [
    ("canister", include_str!("../../../catalog/canister.toml")),
    ("editready", include_str!("../../../catalog/editready.toml")),
    ("foolcat", include_str!("../../../catalog/foolcat.toml")),
    ("offshoot", include_str!("../../../catalog/offshoot.toml")),
];

/// A value that may differ between Windows and macOS.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(bound(deserialize = "T: Deserialize<'de>"))]
pub struct PerOs<T> {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub windows: Option<T>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub macos: Option<T>,
}

impl<T> Default for PerOs<T> {
    fn default() -> Self {
        PerOs {
            windows: None,
            macos: None,
        }
    }
}

impl<T> PerOs<T> {
    /// The value for `os`, if any.
    pub fn get(&self, os: Os) -> Option<&T> {
        match os {
            Os::Windows => self.windows.as_ref(),
            Os::Macos => self.macos.as_ref(),
        }
    }
}

/// `[app]`: identity of a Hedge app.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheme: Option<String>,
    #[serde(default)]
    pub requires_pro: bool,
    pub docs: String,
}

/// `[detect.<os>]`: how to tell whether the app is installed.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Detect {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registry_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
}

/// `[scripting.<os>]`: where script attachments live on that platform.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Scripting {
    Registry {
        key: String,
        enable_value: String,
        value_pattern: String,
    },
    HelperWorkspace {
        workspace_dir: String,
        workspace_file: String,
        enable_pref: String,
        pref_pattern: String,
    },
    Manual {
        note: String,
    },
}

/// `[[events]]`: one scripting event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventSpec {
    pub id: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registry_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pref_name: Option<String>,
    #[serde(default)]
    pub payload: Vec<String>,
    #[serde(default)]
    pub json_fields: Vec<String>,
}

/// How a command is encoded as a URL.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CommandForm {
    Url,
    Action,
}

/// `[[commands]]`: one URL-scheme command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandSpec {
    pub id: String,
    #[serde(default)]
    pub description: String,
    pub form: CommandForm,
    #[serde(default)]
    pub params: BTreeMap<String, String>,
    #[serde(default)]
    pub platforms: Vec<Os>,
    #[serde(default)]
    pub confirm: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub list_separator: Option<String>,
}

/// `[files.<os>]`: app log files.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Files {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub callback_log: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_log: Option<String>,
}

/// `[presets.<os>]`: where presets live and how one is selected.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PresetsSpec {
    pub dir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registry_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location_override_value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_value: Option<String>,
}

/// One catalog file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppManifest {
    pub catalog_version: u32,
    pub tested_against: String,
    pub app: AppInfo,
    #[serde(default)]
    pub detect: PerOs<Detect>,
    #[serde(default)]
    pub scripting: PerOs<Scripting>,
    #[serde(default)]
    pub events: Vec<EventSpec>,
    #[serde(default)]
    pub commands: Vec<CommandSpec>,
    #[serde(default)]
    pub files: PerOs<Files>,
    #[serde(default)]
    pub presets: PerOs<PresetsSpec>,
}

/// Types a command parameter can have.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParamType {
    String,
    Path,
    PathList,
    Int,
    Bool,
    Json,
}

/// A parsed parameter declaration such as `"path[]?"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParamSpec {
    pub ty: ParamType,
    pub optional: bool,
}

impl ParamSpec {
    /// Parse `string`, `path`, `path[]`, `int`, `bool`, or `json`, each
    /// optionally followed by `?`.
    pub fn parse(spec: &str) -> Result<ParamSpec> {
        let (base, optional) = match spec.strip_suffix('?') {
            Some(b) => (b, true),
            None => (spec, false),
        };
        let ty = match base {
            "string" => ParamType::String,
            "path" => ParamType::Path,
            "path[]" => ParamType::PathList,
            "int" => ParamType::Int,
            "bool" => ParamType::Bool,
            "json" => ParamType::Json,
            other => {
                return Err(CoreError::Catalog(format!(
                    "unknown parameter type '{other}'"
                )));
            }
        };
        Ok(ParamSpec { ty, optional })
    }
}

impl CommandSpec {
    /// Every parameter's parsed declaration.
    pub fn param_specs(&self) -> Result<BTreeMap<String, ParamSpec>> {
        self.params
            .iter()
            .map(|(name, spec)| {
                ParamSpec::parse(spec)
                    .map(|p| (name.clone(), p))
                    .map_err(|e| {
                        CoreError::Catalog(format!("command {} parameter {name}: {e}", self.id))
                    })
            })
            .collect()
    }

    /// Whether the command can run on `os` (an empty `platforms` means all).
    pub fn available_on(&self, os: Os) -> bool {
        self.platforms.is_empty() || self.platforms.contains(&os)
    }
}

impl AppManifest {
    /// The event with this id.
    pub fn event(&self, id: &str) -> Result<&EventSpec> {
        self.events
            .iter()
            .find(|e| e.id == id)
            .ok_or_else(|| CoreError::EventNotFound {
                app: self.app.id.clone(),
                event: id.to_owned(),
            })
    }

    /// The command with this id.
    pub fn command(&self, id: &str) -> Result<&CommandSpec> {
        self.commands
            .iter()
            .find(|c| c.id == id)
            .ok_or_else(|| CoreError::CommandNotFound {
                app: self.app.id.clone(),
                command: id.to_owned(),
            })
    }

    /// Check the catalog's own rules (see `catalog/README.md`).
    pub fn validate(&self) -> Result<()> {
        let fail = |msg: String| -> Result<()> { Err(CoreError::Catalog(msg)) };
        if self.catalog_version != 1 {
            return fail(format!(
                "unsupported catalog_version {} (expected 1)",
                self.catalog_version
            ));
        }
        validate_slug(&self.app.id).map_err(|e| CoreError::Catalog(e.to_string()))?;
        if self.tested_against.trim().is_empty() {
            return fail("tested_against is empty".into());
        }
        let mut seen = BTreeSet::new();
        for e in &self.events {
            if e.id.is_empty() || !e.id.chars().all(|c| c.is_ascii_alphanumeric()) {
                return fail(format!("event id '{}' must be letters and digits", e.id));
            }
            if !seen.insert(e.id.as_str()) {
                return fail(format!("duplicate event '{}'", e.id));
            }
            if let Some(f) = e.json_fields.iter().find(|f| !e.payload.contains(f)) {
                return fail(format!(
                    "event {}: json field '{f}' is not in its payload",
                    e.id
                ));
            }
        }
        let mut seen = BTreeSet::new();
        for c in &self.commands {
            if !seen.insert(c.id.as_str()) {
                return fail(format!("duplicate command '{}'", c.id));
            }
            let specs = c.param_specs()?;
            if c.list_separator.is_some() && !specs.values().any(|s| s.ty == ParamType::PathList) {
                return fail(format!(
                    "command {}: list_separator needs a path[] parameter",
                    c.id
                ));
            }
        }
        if !self.commands.is_empty() && self.app.scheme.as_deref().is_none_or(str::is_empty) {
            return fail("commands need [app] scheme".into());
        }
        for s in [
            self.scripting.windows.as_ref(),
            self.scripting.macos.as_ref(),
        ]
        .into_iter()
        .flatten()
        {
            match s {
                Scripting::Registry { value_pattern, .. }
                    if !value_pattern.contains("{registry_name}") =>
                {
                    return fail("registry value_pattern must contain {registry_name}".into());
                }
                Scripting::HelperWorkspace { pref_pattern, .. }
                    if !pref_pattern.contains("{pref_name}") =>
                {
                    return fail("helper_workspace pref_pattern must contain {pref_name}".into());
                }
                _ => {}
            }
        }
        Ok(())
    }
}

/// Parse and validate one catalog file. `source` names it in error messages.
pub fn parse_app_manifest(text: &str, source: &str) -> Result<AppManifest> {
    let manifest: AppManifest =
        toml::from_str(text).map_err(|e| CoreError::Catalog(format!("{source}: {e}")))?;
    manifest
        .validate()
        .map_err(|e| CoreError::Catalog(format!("{source}: {e}")))?;
    Ok(manifest)
}

/// The set of app manifests in use.
#[derive(Debug, Clone, PartialEq)]
pub struct Catalog {
    apps: BTreeMap<String, AppManifest>,
    overridden: Vec<String>,
}

impl Catalog {
    /// The manifests built into this binary.
    pub fn embedded() -> Result<Catalog> {
        let mut apps = BTreeMap::new();
        for (id, text) in EMBEDDED {
            let m = parse_app_manifest(text, &format!("embedded {id}.toml"))?;
            apps.insert(m.app.id.clone(), m);
        }
        Ok(Catalog {
            apps,
            overridden: Vec::new(),
        })
    }

    /// The embedded manifests, with every `<id>.toml` in `overrides_dir`
    /// replacing or adding the app of the same id. A missing folder is fine.
    pub fn load(overrides_dir: Option<&Path>) -> Result<Catalog> {
        let mut catalog = Catalog::embedded()?;
        let Some(dir) = overrides_dir else {
            return Ok(catalog);
        };
        let Ok(entries) = fs::read_dir(dir) else {
            return Ok(catalog);
        };
        let mut files: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "toml"))
            .collect();
        files.sort();
        for path in files {
            let source = path.display().to_string();
            let text = fs::read_to_string(&path).map_err(|e| CoreError::io(&path, e))?;
            let m = parse_app_manifest(&text, &source)?;
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            if m.app.id != stem {
                return Err(CoreError::Catalog(format!(
                    "{source}: app id '{}' must match the file name '{stem}'",
                    m.app.id
                )));
            }
            catalog.overridden.push(m.app.id.clone());
            catalog.apps.insert(m.app.id.clone(), m);
        }
        catalog.overridden.sort();
        Ok(catalog)
    }

    /// All apps, sorted by id.
    pub fn apps(&self) -> impl Iterator<Item = &AppManifest> {
        self.apps.values()
    }

    /// The app with this id.
    pub fn app(&self, id: &str) -> Result<&AppManifest> {
        self.apps
            .get(id)
            .ok_or_else(|| CoreError::AppNotFound(id.to_owned()))
    }

    /// Ids of apps whose manifest came from the overrides folder, sorted.
    pub fn overridden(&self) -> &[String] {
        &self.overridden
    }
}

/// Expand a leading `~` (home directory) and `%NAME%` environment variables.
/// On non-Windows builds, backslashes become slashes.
pub fn expand_path(host: &dyn Host, template: &str) -> Result<PathBuf> {
    let mut out = String::new();
    let mut rest = template;
    if let Some(after) = rest.strip_prefix('~') {
        if after.is_empty() || after.starts_with('/') || after.starts_with('\\') {
            let home = host
                .home_dir()
                .ok_or_else(|| CoreError::Host("the home directory is unknown".into()))?;
            out.push_str(&home.to_string_lossy());
            rest = after;
        }
    }
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let end = after
            .find('%')
            .ok_or_else(|| CoreError::Catalog(format!("unterminated %VAR% in '{template}'")))?;
        let name = &after[..end];
        let value = host
            .env_var(name)
            .ok_or_else(|| CoreError::Host(format!("environment variable {name} is not set")))?;
        out.push_str(&value);
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    // Windows catalog templates use backslashes. On non-Windows builds they
    // are only reached from tests with a Windows FakeHost, and those tests
    // still touch the real Unix filesystem, so make them usable there.
    if !cfg!(windows) {
        out = out.replace('\\', "/");
    }
    Ok(PathBuf::from(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::FakeHost;

    #[test]
    fn embedded_catalog_has_four_valid_apps() {
        let c = Catalog::embedded().unwrap();
        let ids: Vec<&str> = c.apps().map(|m| m.app.id.as_str()).collect();
        assert_eq!(ids, vec!["canister", "editready", "foolcat", "offshoot"]);
        assert!(c.overridden().is_empty());
        assert!(matches!(
            c.app("postlab").unwrap_err(),
            CoreError::AppNotFound(_)
        ));
    }

    #[test]
    fn offshoot_facts_are_encoded() {
        let c = Catalog::embedded().unwrap();
        let o = c.app("offshoot").unwrap();
        assert_eq!(o.events.len(), 10);
        assert_eq!(
            o.event("VerificationIssue")
                .unwrap()
                .registry_name
                .as_deref(),
            Some("CheckpointIssue")
        );
        assert_eq!(
            o.event("OffShootStarted").unwrap().registry_name.as_deref(),
            Some("AppStarted")
        );
        assert_eq!(
            o.event("DisksIdle").unwrap().registry_name.as_deref(),
            Some("AllDisksIdle")
        );
        assert_eq!(o.event("SourceAdded").unwrap().registry_name, None);
        assert_eq!(
            o.event("FileCopyCompleted").unwrap().json_fields,
            vec!["FileCopyCompleted_sourceInfo"]
        );
        assert!(matches!(
            o.event("Nope").unwrap_err(),
            CoreError::EventNotFound { .. }
        ));
        let set_source = o.command("setSource").unwrap();
        assert_eq!(set_source.form, CommandForm::Action);
        let specs = set_source.param_specs().unwrap();
        assert_eq!(
            specs["paths"],
            ParamSpec {
                ty: ParamType::PathList,
                optional: false
            }
        );
        assert_eq!(
            specs["label"],
            ParamSpec {
                ty: ParamType::String,
                optional: true
            }
        );
        for banned in ["activate", "deactivate", "update"] {
            assert!(
                o.command(banned).is_err(),
                "{banned} must not be in the catalog"
            );
        }
        assert!(matches!(
            o.scripting.get(Os::Windows),
            Some(Scripting::Registry { .. })
        ));
        assert!(matches!(
            o.scripting.get(Os::Macos),
            Some(Scripting::HelperWorkspace { .. })
        ));
        let canister = c.app("canister").unwrap();
        assert!(canister.events.is_empty());
        assert_eq!(
            canister
                .command("addarchive")
                .unwrap()
                .list_separator
                .as_deref(),
            Some("|")
        );
    }

    #[test]
    fn param_specs_parse() {
        assert_eq!(
            ParamSpec::parse("path[]?").unwrap(),
            ParamSpec {
                ty: ParamType::PathList,
                optional: true
            }
        );
        assert_eq!(
            ParamSpec::parse("int").unwrap(),
            ParamSpec {
                ty: ParamType::Int,
                optional: false
            }
        );
        for bad in ["", "?", "date", "path[]??", "string[]"] {
            assert!(ParamSpec::parse(bad).is_err(), "{bad:?}");
        }
    }

    const MINIMAL: &str = r#"
catalog_version = 1
tested_against = "1.0"
[app]
id = "newapp"
name = "New App"
docs = "https://example.com"
"#;

    #[test]
    fn overrides_replace_and_add() {
        let dir = tempfile::tempdir().unwrap();
        let offshoot = EMBEDDED.iter().find(|(id, _)| *id == "offshoot").unwrap().1;
        fs::write(
            dir.path().join("offshoot.toml"),
            offshoot.replace("tested_against = \"26.1\"", "tested_against = \"99.0\""),
        )
        .unwrap();
        fs::write(dir.path().join("newapp.toml"), MINIMAL).unwrap();
        fs::write(dir.path().join("notes.txt"), "ignored").unwrap();
        let c = Catalog::load(Some(dir.path())).unwrap();
        assert_eq!(c.app("offshoot").unwrap().tested_against, "99.0");
        assert_eq!(c.app("newapp").unwrap().app.name, "New App");
        assert_eq!(c.apps().count(), 5);
        assert_eq!(
            c.overridden(),
            ["newapp".to_string(), "offshoot".to_string()]
        );
        assert_eq!(
            Catalog::load(Some(&dir.path().join("missing")))
                .unwrap()
                .apps()
                .count(),
            4
        );
        assert_eq!(Catalog::load(None).unwrap(), Catalog::embedded().unwrap());
    }

    #[test]
    fn invalid_overrides_are_reported_with_the_file_name() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("broken.toml"), "catalog_version = [").unwrap();
        let err = Catalog::load(Some(dir.path())).unwrap_err();
        assert!(
            matches!(&err, CoreError::Catalog(m) if m.contains("broken.toml")),
            "{err}"
        );

        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("other.toml"), MINIMAL).unwrap();
        let err = Catalog::load(Some(dir.path())).unwrap_err();
        assert!(
            matches!(&err, CoreError::Catalog(m) if m.contains("other.toml")),
            "{err}"
        );
    }

    #[test]
    fn validation_rules() {
        let bad = |extra: &str| parse_app_manifest(&format!("{MINIMAL}{extra}"), "t").unwrap_err();
        assert!(matches!(
            parse_app_manifest(
                &MINIMAL.replace("catalog_version = 1", "catalog_version = 2"),
                "t"
            )
            .unwrap_err(),
            CoreError::Catalog(_)
        ));
        bad("\n[[events]]\nid = \"A\"\n[[events]]\nid = \"A\"\n");
        bad("\n[[events]]\nid = \"has space\"\n");
        bad("\n[[events]]\nid = \"A\"\npayload = [\"x\"]\njson_fields = [\"y\"]\n");
        bad("\n[[commands]]\nid = \"open\"\nform = \"url\"\n"); // no scheme
        bad("\n[scripting.windows]\nkind = \"registry\"\nkey = 'HKCU\\X'\nenable_value = \"E\"\nvalue_pattern = \"Fixed\"\n");
        bad("\n[unknown]\nx = 1\n");
        let with_scheme = MINIMAL.replace(
            "name = \"New App\"",
            "name = \"New App\"\nscheme = \"newapp\"",
        );
        assert!(parse_app_manifest(
            &format!("{with_scheme}\n[[commands]]\nid = \"a\"\nform = \"url\"\nparams = {{ x = \"date\" }}\n"),
            "t"
        )
        .is_err());
        assert!(parse_app_manifest(
            &format!("{with_scheme}\n[[commands]]\nid = \"a\"\nform = \"url\"\nparams = {{ x = \"string\" }}\nlist_separator = \"|\"\n"),
            "t"
        )
        .is_err());
        parse_app_manifest(
            &format!("{with_scheme}\n[[commands]]\nid = \"a\"\nform = \"url\"\n"),
            "t",
        )
        .unwrap();
    }

    #[test]
    fn paths_expand_env_and_home() {
        let host = FakeHost::new(Os::Windows)
            .with_env("APPDATA", "C:\\Users\\x\\AppData\\Roaming")
            .with_home("/Users/x");
        let slash = |p: PathBuf| p.to_string_lossy().replace('\\', "/");
        assert_eq!(
            slash(expand_path(&host, "%APPDATA%\\Hedge\\Presets").unwrap()),
            "C:/Users/x/AppData/Roaming/Hedge/Presets"
        );
        assert_eq!(
            expand_path(&host, "~/Library/Logs/x.txt").unwrap(),
            PathBuf::from("/Users/x/Library/Logs/x.txt")
        );
        assert_eq!(
            expand_path(&host, "/abs/~x").unwrap(),
            PathBuf::from("/abs/~x")
        );
        assert!(matches!(
            expand_path(&host, "%MISSING%\\x").unwrap_err(),
            CoreError::Host(_)
        ));
        assert!(matches!(
            expand_path(&host, "%APPDATA\\x").unwrap_err(),
            CoreError::Catalog(_)
        ));
    }
}
