//! The `scripts/` folder of a profile.

use std::fs;
use std::path::PathBuf;

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::manifest::{check_requirements, parse_manifest, Manifest, RequirementIssue};
use crate::store::Store;

#[derive(Debug, Clone, PartialEq)]
pub struct ScriptInfo {
    pub name: String,
    pub manifest: Option<Manifest>,
    /// Set when the file has a manifest block that does not parse.
    pub manifest_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ScriptCheck {
    pub name: String,
    pub manifest: Option<Manifest>,
    pub issues: Vec<RequirementIssue>,
}

/// A single `*.py` file name with no path separators.
pub fn validate_script_name(name: &str) -> Result<()> {
    let stem = name.strip_suffix(".py");
    let ok = matches!(stem, Some(s) if !s.is_empty())
        && !name.contains('/')
        && !name.contains('\\')
        && !name.starts_with("..")
        && !name.contains("..");
    if ok {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "script name '{name}' must be a single file name ending in .py"
        )))
    }
}

impl Store {
    /// Get the path to a script within a profile's scripts folder.
    pub fn script_path(&self, profile: &str, name: &str) -> PathBuf {
        self.scripts_dir(profile).join(name)
    }

    fn require_profile(&self, profile: &str) -> Result<()> {
        if self.profile_exists(profile) {
            Ok(())
        } else {
            Err(CoreError::ProfileNotFound(profile.to_owned()))
        }
    }

    /// List all valid scripts in a profile's scripts folder.
    pub fn list_scripts(&self, profile: &str) -> Result<Vec<ScriptInfo>> {
        self.require_profile(profile)?;
        let dir = self.scripts_dir(profile);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut names: Vec<String> = fs::read_dir(&dir)
            .map_err(|e| CoreError::io(&dir, e))?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_file())
            .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
            .filter(|name| validate_script_name(name).is_ok())
            .collect();
        names.sort();
        names
            .into_iter()
            .map(|name| {
                let source = self.read_script(profile, &name)?;
                let (manifest, manifest_error) = match parse_manifest(&source) {
                    Ok(m) => (m, None),
                    Err(e) => (None, Some(e.to_string())),
                };
                Ok(ScriptInfo {
                    name,
                    manifest,
                    manifest_error,
                })
            })
            .collect()
    }

    /// Read the full source of a script file.
    pub fn read_script(&self, profile: &str, name: &str) -> Result<String> {
        self.require_profile(profile)?;
        validate_script_name(name)?;
        let path = self.script_path(profile, name);
        if !path.is_file() {
            return Err(CoreError::ScriptNotFound(name.to_owned()));
        }
        fs::read_to_string(&path).map_err(|e| CoreError::io(&path, e))
    }

    /// Validate the name and (if present) the manifest block, then write.
    pub fn write_script(
        &self,
        profile: &str,
        name: &str,
        source: &str,
    ) -> Result<Option<Manifest>> {
        self.require_profile(profile)?;
        validate_script_name(name)?;
        let manifest = parse_manifest(source)?;
        fs_util::write_atomic(&self.script_path(profile, name), source.as_bytes(), false)?;
        Ok(manifest)
    }

    /// Delete a script file.
    pub fn delete_script(&self, profile: &str, name: &str) -> Result<()> {
        self.require_profile(profile)?;
        validate_script_name(name)?;
        let path = self.script_path(profile, name);
        if !path.is_file() {
            return Err(CoreError::ScriptNotFound(name.to_owned()));
        }
        fs::remove_file(&path).map_err(|e| CoreError::io(&path, e))
    }

    /// Parse the manifest and compare its requirements against the profile.
    pub fn check_script(&self, profile: &str, name: &str) -> Result<ScriptCheck> {
        let source = self.read_script(profile, name)?;
        let manifest = parse_manifest(&source)?;
        let issues = match &manifest {
            Some(m) => check_requirements(m, &self.load_profile(profile)?),
            None => Vec::new(),
        };
        Ok(ScriptCheck {
            name: name.to_owned(),
            manifest,
            issues,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variable::VarType;

    const FIXTURE: &str = include_str!(
        "../../../schema/fixtures/valid/basic/profiles/commercial-one-day/scripts/on_copy_complete.py"
    );

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        store.create_profile("p", "").unwrap();
        (dir, store)
    }

    #[test]
    fn script_names_are_single_py_files() {
        for ok in ["a.py", "on_copy_complete.py", "A-1.py"] {
            validate_script_name(ok).unwrap();
        }
        for bad in [
            "",
            ".py",
            "a.txt",
            "a",
            "dir/a.py",
            "dir\\a.py",
            "../a.py",
            "a.py/",
        ] {
            assert!(validate_script_name(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn write_list_read_delete_round_trip() {
        let (_d, store) = temp_store();
        let m = store
            .write_script("p", "on_copy_complete.py", FIXTURE)
            .unwrap()
            .unwrap();
        assert_eq!(m.app.as_deref(), Some("offshoot"));
        assert_eq!(
            store
                .write_script("p", "plain.py", "print('hi')\n")
                .unwrap(),
            None
        );

        let list = store.list_scripts("p").unwrap();
        assert_eq!(
            list.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(),
            vec!["on_copy_complete.py", "plain.py"]
        );
        assert!(list[0].manifest.is_some() && list[0].manifest_error.is_none());
        assert!(list[1].manifest.is_none() && list[1].manifest_error.is_none());

        assert_eq!(store.read_script("p", "plain.py").unwrap(), "print('hi')\n");
        store.delete_script("p", "plain.py").unwrap();
        assert!(matches!(
            store.read_script("p", "plain.py").unwrap_err(),
            CoreError::ScriptNotFound(_)
        ));
        assert!(matches!(
            store.delete_script("p", "plain.py").unwrap_err(),
            CoreError::ScriptNotFound(_)
        ));
    }

    #[test]
    fn write_rejects_invalid_manifest_without_touching_disk() {
        let (_d, store) = temp_store();
        let bad = "\"\"\"\n{\"hedgebuddy\": 2}\n---\n\"\"\"\n";
        assert!(matches!(
            store.write_script("p", "bad.py", bad).unwrap_err(),
            CoreError::Manifest(_)
        ));
        assert!(!store.script_path("p", "bad.py").exists());
        assert!(store.write_script("p", "../x.py", "").is_err());
        assert!(matches!(
            store.write_script("ghost", "a.py", "").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn list_reports_broken_manifests_instead_of_failing() {
        let (_d, store) = temp_store();
        fs::write(
            store.script_path("p", "broken.py"),
            "\"\"\"\n{\"hedgebuddy\": 1,\n---\n\"\"\"\n",
        )
        .unwrap();
        let list = store.list_scripts("p").unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].manifest.is_none());
        assert!(list[0]
            .manifest_error
            .as_deref()
            .unwrap()
            .contains("manifest"));
    }

    #[test]
    fn check_script_reports_unmet_requirements() {
        let (_d, store) = temp_store();
        store.write_script("p", "s.py", FIXTURE).unwrap();
        let check = store.check_script("p", "s.py").unwrap();
        assert_eq!(check.issues.len(), 1);
        assert!(
            matches!(&check.issues[0], RequirementIssue::Missing { name, ty: VarType::Secret } if name == "SLACK_WEBHOOK")
        );
        store
            .set_variable(
                "p",
                "SLACK_WEBHOOK",
                crate::secrets::VariableInput {
                    ty: VarType::Secret,
                    value: Some(serde_json::json!("https://h")),
                    description: String::new(),
                },
            )
            .unwrap();
        assert!(store.check_script("p", "s.py").unwrap().issues.is_empty());
    }

    #[test]
    fn fixture_scripts_list() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../schema/fixtures/valid/basic");
        let list = Store::open(root)
            .list_scripts("commercial-one-day")
            .unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "on_copy_complete.py");
    }
}
