//! Profile export and import: one JSON file with a profile's variables, its
//! scripts and, only when asked, its secret values. App-only: no tool
//! reaches this, so an agent cannot export secrets.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::Path;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::manifest::parse_manifest;
use crate::profile::Profile;
use crate::scripts::validate_script_name;
use crate::store::Store;
use crate::variable::{validate_slug, VarType};

/// The largest export file `read_profile_export` accepts by default.
pub const EXPORT_MAX_BYTES: u64 = 16 * 1024 * 1024;

/// A profile as one file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileExport {
    /// Export format version; always 1.
    pub hedgebuddy_profile_export: u32,
    /// When it was exported (UTC, RFC 3339).
    pub exported_at: String,
    /// The profile exactly as `profile.json` holds it (no secret values).
    pub profile: Profile,
    /// Secret values by variable name, present only when exported with secrets.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secrets: Option<BTreeMap<String, String>>,
    /// Script sources by file name.
    #[serde(default)]
    pub scripts: BTreeMap<String, String>,
}

/// What an import created.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct ImportSummary {
    /// The new profile's name.
    pub profile: String,
    /// Whether it became the active profile (the first profile does).
    pub active: bool,
    /// How many variables it has.
    pub variables: usize,
    /// How many scripts it has.
    pub scripts: usize,
    /// How many secret values the file carried.
    pub secrets_imported: usize,
    /// Secret variables that arrived without a value; set them before use.
    pub secrets_missing: Vec<String>,
}

impl Store {
    /// A profile, its scripts and, with `include_secrets`, its secret
    /// values. Only the values of secret-typed variables are included; a
    /// key left behind in `secrets.json` by a deleted or retyped variable
    /// (core tolerates such orphans) is dropped rather than exported.
    /// Refuses when any script's manifest fails to parse, since importing
    /// such a file would fail anyway.
    pub fn export_profile(&self, name: &str, include_secrets: bool) -> Result<ProfileExport> {
        let profile = self.load_profile(name)?;
        let secrets = if include_secrets {
            let all = self.load_secrets(name)?;
            Some(
                all.into_iter()
                    .filter(|(k, _)| {
                        profile
                            .variables
                            .get(k)
                            .is_some_and(|v| v.ty == VarType::Secret)
                    })
                    .collect(),
            )
        } else {
            None
        };

        let infos = self.list_scripts(name)?;
        let broken: Vec<&str> = infos
            .iter()
            .filter(|i| i.manifest_error.is_some())
            .map(|i| i.name.as_str())
            .collect();
        if !broken.is_empty() {
            return Err(CoreError::Validation(format!(
                "fix the manifest of {} before exporting",
                broken.join(", ")
            )));
        }

        let mut scripts = BTreeMap::new();
        for info in infos {
            let source = self.read_script(name, &info.name)?;
            scripts.insert(info.name, source);
        }
        Ok(ProfileExport {
            hedgebuddy_profile_export: 1,
            exported_at: crate::clock::now_rfc3339(),
            profile,
            secrets,
            scripts,
        })
    }

    /// Create profile `name` from `export`. Everything is checked before
    /// anything is written, and a profile half-created by a failed write is
    /// removed. The first profile becomes active. The caller holds the write
    /// lock.
    pub fn import_profile(&self, export: &ProfileExport, name: &str) -> Result<ImportSummary> {
        if export.hedgebuddy_profile_export != 1 {
            return Err(CoreError::Validation(format!(
                "unsupported profile export version {} (expected 1)",
                export.hedgebuddy_profile_export
            )));
        }
        validate_slug(name)?;
        if self.profile_dir(name).exists() {
            return Err(CoreError::ProfileExists(name.to_owned()));
        }
        let mut profile = export.profile.clone();
        profile.name = name.to_owned();
        profile.validate()?;
        let secret_names: BTreeSet<&String> = profile
            .variables
            .iter()
            .filter(|(_, v)| v.ty == VarType::Secret)
            .map(|(n, _)| n)
            .collect();
        let secrets = export.secrets.clone().unwrap_or_default();
        if let Some(key) = secrets.keys().find(|k| !secret_names.contains(k)) {
            return Err(CoreError::Validation(format!(
                "the file has a secret value for '{key}', which is not a secret variable of the profile"
            )));
        }
        let mut seen_lower: BTreeSet<String> = BTreeSet::new();
        for (script, source) in &export.scripts {
            validate_script_name(script)?;
            parse_manifest(source)?;
            if !seen_lower.insert(script.to_lowercase()) {
                return Err(CoreError::Validation(format!(
                    "script name '{script}' differs only by case from another script in this file"
                )));
            }
        }

        // Only roll back a profile this call itself created: if
        // `create_profile` fails (for example because something else won
        // a race and created `name` first, or the index is unreadable),
        // there is nothing of ours to delete.
        self.create_profile(name, &profile.description)?;
        let written = (|| {
            self.save_profile(&profile)?;
            if !secrets.is_empty() {
                self.save_secrets(name, &secrets)?;
            }
            for (script, source) in &export.scripts {
                self.write_script(name, script, source)?;
            }
            Ok::<(), CoreError>(())
        })();
        if let Err(e) = written {
            let _ = self.delete_profile(name);
            return Err(e);
        }
        Ok(ImportSummary {
            profile: name.to_owned(),
            // Everything above is already written; a failed read here does
            // not mean the import failed, only that we cannot say it is
            // active.
            active: self.active_profile_name().unwrap_or(None).as_deref() == Some(name),
            variables: profile.variables.len(),
            scripts: export.scripts.len(),
            secrets_imported: secrets.len(),
            secrets_missing: secret_names
                .into_iter()
                .filter(|n| !secrets.contains_key(*n))
                .cloned()
                .collect(),
        })
    }
}

/// Write an export file as pretty JSON, atomically. A file holding secrets
/// is created owner-only (0600) on Unix.
pub fn write_profile_export(path: &Path, export: &ProfileExport) -> Result<()> {
    fs_util::write_json_atomic(path, export, export.secrets.is_some())
}

/// Read an export file, refusing one larger than `max_bytes` (checked
/// against bytes actually read, not trusted file metadata). The version is
/// checked before the rest is deserialized, so a file from a future,
/// incompatible export version is reported clearly rather than as a
/// generic "unknown field" JSON error.
pub fn read_profile_export(path: &Path, max_bytes: u64) -> Result<ProfileExport> {
    let file = fs::File::open(path).map_err(|e| CoreError::io(path, e))?;
    let mut buf = Vec::new();
    file.take(max_bytes + 1)
        .read_to_end(&mut buf)
        .map_err(|e| CoreError::io(path, e))?;
    if buf.len() as u64 > max_bytes {
        return Err(CoreError::Validation(format!(
            "{} is larger than {max_bytes} bytes, too large to be a profile export",
            path.display()
        )));
    }

    let value: Value = serde_json::from_slice(&buf).map_err(|e| CoreError::Json {
        path: path.to_path_buf(),
        source: e,
    })?;
    let version = value.get("hedgebuddy_profile_export");
    if !matches!(version, Some(Value::Number(n)) if n.as_u64() == Some(1)) {
        let shown = version
            .map(|v| v.to_string())
            .unwrap_or_else(|| "missing".to_owned());
        return Err(CoreError::Validation(format!(
            "unsupported profile export version {shown} (expected 1)"
        )));
    }
    serde_json::from_value(value).map_err(|e| CoreError::Json {
        path: path.to_path_buf(),
        source: e,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::secrets::VariableInput;
    use crate::variable::VarType;

    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\"}\n---\n\"\"\"\nprint('x')\n";

    fn store_with_profile() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        store.create_profile("a", "Client A").unwrap();
        store
            .set_variable(
                "a",
                "PROJECT_NAME",
                VariableInput {
                    ty: VarType::String,
                    value: Some(json!("Spot")),
                    description: "Name".into(),
                },
            )
            .unwrap();
        store
            .set_variable(
                "a",
                "HOOK",
                VariableInput {
                    ty: VarType::Secret,
                    value: Some(json!("https://secret")),
                    description: String::new(),
                },
            )
            .unwrap();
        store.write_script("a", "copy.py", COPY).unwrap();
        (dir, store)
    }

    #[test]
    fn an_export_leaves_secrets_out_unless_asked() {
        let (_d, store) = store_with_profile();
        let plain = store.export_profile("a", false).unwrap();
        assert_eq!(plain.hedgebuddy_profile_export, 1);
        assert_eq!(plain.secrets, None);
        assert_eq!(plain.scripts["copy.py"], COPY);
        assert_eq!(plain.profile.variables.len(), 2);
        assert!(!serde_json::to_string(&plain)
            .unwrap()
            .contains("https://secret"));
        let full = store.export_profile("a", true).unwrap();
        assert_eq!(full.secrets.unwrap()["HOOK"], "https://secret");
    }

    #[test]
    fn an_import_recreates_the_profile_under_a_new_name() {
        let (_d, store) = store_with_profile();
        let export = store.export_profile("a", true).unwrap();
        let summary = store.import_profile(&export, "b").unwrap();
        assert_eq!(
            summary,
            ImportSummary {
                profile: "b".into(),
                active: false,
                variables: 2,
                scripts: 1,
                secrets_imported: 1,
                secrets_missing: vec![]
            }
        );
        assert_eq!(store.load_profile("b").unwrap().name, "b");
        assert_eq!(
            store.get_variable("b", "HOOK").unwrap().value,
            Some(json!("https://secret"))
        );
        assert_eq!(store.read_script("b", "copy.py").unwrap(), COPY);
        assert_eq!(store.active_profile_name().unwrap().as_deref(), Some("a"));
    }

    #[test]
    fn an_import_without_secrets_reports_them_missing() {
        let (_d, store) = store_with_profile();
        let export = store.export_profile("a", false).unwrap();
        let summary = store.import_profile(&export, "b").unwrap();
        assert_eq!(summary.secrets_imported, 0);
        assert_eq!(summary.secrets_missing, vec!["HOOK".to_owned()]);
        assert_eq!(store.get_variable("b", "HOOK").unwrap().value, None);
    }

    #[test]
    fn the_first_import_becomes_active() {
        let (_d, source) = store_with_profile();
        let export = source.export_profile("a", false).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let fresh = Store::open(dir.path().join("HedgeBuddy"));
        assert!(fresh.import_profile(&export, "a").unwrap().active);
        assert_eq!(fresh.active_profile_name().unwrap().as_deref(), Some("a"));
    }

    #[test]
    fn a_bad_file_writes_nothing() {
        let (_d, store) = store_with_profile();
        let good = store.export_profile("a", true).unwrap();
        assert!(matches!(
            store.import_profile(&good, "a"),
            Err(CoreError::ProfileExists(_))
        ));
        assert!(store.import_profile(&good, "Bad Name").is_err());
        let mut wrong_secret = good.clone();
        wrong_secret
            .secrets
            .as_mut()
            .unwrap()
            .insert("PROJECT_NAME".into(), "x".into());
        assert!(store.import_profile(&wrong_secret, "c").is_err());
        let mut bad_script = good.clone();
        bad_script
            .scripts
            .insert("../x.py".into(), "print(1)\n".into());
        assert!(store.import_profile(&bad_script, "c").is_err());
        let mut bad_manifest = good.clone();
        bad_manifest
            .scripts
            .insert("m.py".into(), "\"\"\"\n{not json\n---\n\"\"\"\n".into());
        assert!(store.import_profile(&bad_manifest, "c").is_err());
        let mut bad_version = good.clone();
        bad_version.hedgebuddy_profile_export = 2;
        assert!(store.import_profile(&bad_version, "c").is_err());
        assert!(!store.profile_dir("c").exists(), "nothing was written");
    }

    #[test]
    fn files_round_trip_and_large_files_are_refused() {
        let (dir, store) = store_with_profile();
        let path = dir.path().join("out").join("a.hedgebuddy.json");
        let export = store.export_profile("a", false).unwrap();
        write_profile_export(&path, &export).unwrap();
        assert_eq!(
            read_profile_export(&path, EXPORT_MAX_BYTES).unwrap(),
            export
        );
        assert!(read_profile_export(&path, 10).is_err());
    }

    #[test]
    fn export_leaves_orphaned_secrets_out_and_the_export_imports_cleanly() {
        let (_d, store) = store_with_profile();
        // An orphaned secret: a key in secrets.json with no matching
        // secret-typed variable in profile.json (see secrets.rs
        // `delete_variable_cleans_an_orphaned_secret`; core tolerates it).
        let mut secrets = store.load_secrets("a").unwrap();
        secrets.insert("ORPHAN".into(), "leftover".into());
        store.save_secrets("a", &secrets).unwrap();

        let export = store.export_profile("a", true).unwrap();
        let exported_secrets = export.secrets.as_ref().unwrap();
        assert!(!exported_secrets.contains_key("ORPHAN"));
        assert_eq!(exported_secrets.len(), 1);
        assert_eq!(exported_secrets["HOOK"], "https://secret");

        let summary = store.import_profile(&export, "b").unwrap();
        assert_eq!(summary.secrets_imported, 1);
        assert_eq!(summary.secrets_missing, Vec::<String>::new());
    }

    #[test]
    fn export_refuses_a_profile_with_a_broken_manifest() {
        let (_d, store) = store_with_profile();
        std::fs::write(
            store.script_path("a", "broken.py"),
            "\"\"\"\n{\"hedgebuddy\": 1,\n---\n\"\"\"\n",
        )
        .unwrap();
        let err = store.export_profile("a", false).unwrap_err();
        match err {
            CoreError::Validation(msg) => assert!(msg.contains("broken.py"), "{msg}"),
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[test]
    fn import_refuses_script_names_that_collide_case_insensitively() {
        let (_d, store) = store_with_profile();
        let mut export = store.export_profile("a", false).unwrap();
        export.scripts.insert("Copy.py".into(), "print(1)\n".into());
        assert!(store.import_profile(&export, "c").is_err());
        assert!(!store.profile_dir("c").exists(), "nothing was written");
    }

    #[test]
    fn read_profile_export_reports_a_clear_version_error_before_deserializing() {
        let (dir, _store) = store_with_profile();
        let path = dir.path().join("v2.json");
        std::fs::write(
            &path,
            r#"{"hedgebuddy_profile_export": 2, "exported_at": "x", "profile": {}, "unexpected_field": true}"#,
        )
        .unwrap();
        let err = read_profile_export(&path, EXPORT_MAX_BYTES).unwrap_err();
        match err {
            CoreError::Validation(msg) => {
                assert!(
                    msg.contains("unsupported profile export version 2"),
                    "{msg}"
                )
            }
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[cfg(unix)]
    #[test]
    fn an_export_with_secrets_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let (dir, store) = store_with_profile();
        let path = dir.path().join("secret.json");
        write_profile_export(&path, &store.export_profile("a", true).unwrap()).unwrap();
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
