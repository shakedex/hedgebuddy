//! Profiles: `profiles/<name>/profile.json` and the active-profile pointer.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::store::Store;
use crate::variable::{validate_slug, validate_var_name, Variable};

/// Contents of `profile.json`. Variables are kept sorted by name.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Profile {
    pub version: u32,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub variables: BTreeMap<String, Variable>,
}

impl Profile {
    /// Create a new profile with empty variables.
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Profile {
        Profile {
            version: 1,
            name: name.into(),
            description: description.into(),
            variables: BTreeMap::new(),
        }
    }

    /// Slug, version, every variable name, and every variable value.
    pub fn validate(&self) -> Result<()> {
        if self.version != 1 {
            return Err(CoreError::Validation(format!(
                "unsupported profile.json version {} (expected 1)",
                self.version
            )));
        }
        validate_slug(&self.name)?;
        for (name, var) in &self.variables {
            validate_var_name(name)?;
            var.validate(name)?;
        }
        Ok(())
    }
}

impl Store {
    /// Path to a profile's JSON file.
    pub fn profile_path(&self, name: &str) -> PathBuf {
        self.profile_dir(name).join("profile.json")
    }

    /// Check if a profile exists.
    pub fn profile_exists(&self, name: &str) -> bool {
        self.profile_path(name).is_file()
    }

    /// Names of every directory under `profiles/` that holds a `profile.json`, sorted.
    pub fn list_profiles(&self) -> Result<Vec<String>> {
        let dir = self.profiles_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut names: Vec<String> = fs::read_dir(&dir)
            .map_err(|e| CoreError::io(&dir, e))?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().join("profile.json").is_file())
            .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
            .collect();
        names.sort();
        Ok(names)
    }

    /// Load and validate a profile by name.
    pub fn load_profile(&self, name: &str) -> Result<Profile> {
        let path = self.profile_path(name);
        if !path.is_file() {
            return Err(CoreError::ProfileNotFound(name.to_owned()));
        }
        let profile: Profile = fs_util::read_json(&path)?;
        if profile.name != name {
            return Err(CoreError::Validation(format!(
                "profile.json in '{name}' declares name '{}'",
                profile.name
            )));
        }
        profile.validate()?;
        Ok(profile)
    }

    /// Validate and write `profile.json` atomically. Does not touch secrets or scripts.
    pub fn save_profile(&self, profile: &Profile) -> Result<()> {
        profile.validate()?;
        fs_util::write_json_atomic(&self.profile_path(&profile.name), profile, false)
    }

    /// Create an empty profile (with its `scripts/` directory). Becomes active
    /// when nothing else is.
    pub fn create_profile(&self, name: &str, description: &str) -> Result<Profile> {
        validate_slug(name)?;
        if self.profile_dir(name).exists() {
            return Err(CoreError::ProfileExists(name.to_owned()));
        }
        let profile = Profile::new(name, description);
        self.save_profile(&profile)?;
        let scripts = self.scripts_dir(name);
        fs::create_dir_all(&scripts).map_err(|e| CoreError::io(&scripts, e))?;
        let mut index = self.index()?;
        if index.active_profile.is_none() {
            index.active_profile = Some(name.to_owned());
            self.write_index(&index)?;
        }
        Ok(profile)
    }

    /// Remove the whole profile directory. Clears `active_profile` if it pointed here.
    pub fn delete_profile(&self, name: &str) -> Result<()> {
        let dir = self.profile_dir(name);
        if !dir.is_dir() {
            return Err(CoreError::ProfileNotFound(name.to_owned()));
        }
        fs::remove_dir_all(&dir).map_err(|e| CoreError::io(&dir, e))?;
        let mut index = self.index()?;
        if index.active_profile.as_deref() == Some(name) {
            index.active_profile = None;
            self.write_index(&index)?;
        }
        Ok(())
    }

    /// Set the active profile by name.
    pub fn set_active_profile(&self, name: &str) -> Result<()> {
        if !self.profile_exists(name) {
            return Err(CoreError::ProfileNotFound(name.to_owned()));
        }
        let mut index = self.index()?;
        index.active_profile = Some(name.to_owned());
        self.write_index(&index)
    }

    /// Get the name of the active profile, if any.
    pub fn active_profile_name(&self) -> Result<Option<String>> {
        Ok(self.index()?.active_profile)
    }

    /// Load the active profile, if any.
    pub fn active_profile(&self) -> Result<Option<Profile>> {
        match self.active_profile_name()? {
            Some(name) => Ok(Some(self.load_profile(&name)?)),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variable::VarType;
    use serde_json::json;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        (dir, store)
    }

    #[test]
    fn empty_store_lists_nothing_and_has_no_active_profile() {
        let (_d, store) = temp_store();
        assert_eq!(store.list_profiles().unwrap(), Vec::<String>::new());
        assert_eq!(store.active_profile().unwrap(), None);
    }

    #[test]
    fn create_makes_first_profile_active_and_creates_scripts_dir() {
        let (_d, store) = temp_store();
        let p = store
            .create_profile("commercial-one-day", "Client X")
            .unwrap();
        assert_eq!(p, Profile::new("commercial-one-day", "Client X"));
        assert!(store.scripts_dir("commercial-one-day").is_dir());
        assert_eq!(
            store.active_profile_name().unwrap().as_deref(),
            Some("commercial-one-day")
        );

        store.create_profile("second", "").unwrap();
        assert_eq!(
            store.active_profile_name().unwrap().as_deref(),
            Some("commercial-one-day")
        );
        assert_eq!(
            store.list_profiles().unwrap(),
            vec!["commercial-one-day", "second"]
        );
    }

    #[test]
    fn create_rejects_bad_slug_and_duplicates() {
        let (_d, store) = temp_store();
        assert!(matches!(
            store.create_profile("Bad Name", "").unwrap_err(),
            CoreError::Validation(_)
        ));
        store.create_profile("dup", "").unwrap();
        assert!(matches!(
            store.create_profile("dup", "").unwrap_err(),
            CoreError::ProfileExists(_)
        ));
    }

    #[test]
    fn save_and_load_round_trip_with_sorted_variables() {
        let (_d, store) = temp_store();
        let mut p = store.create_profile("p", "").unwrap();
        p.variables.insert(
            "ZED".into(),
            Variable {
                ty: VarType::Int,
                value: Some(json!(1)),
                description: String::new(),
            },
        );
        p.variables.insert(
            "ALPHA".into(),
            Variable {
                ty: VarType::String,
                value: Some(json!("a")),
                description: "first".into(),
            },
        );
        store.save_profile(&p).unwrap();
        let loaded = store.load_profile("p").unwrap();
        assert_eq!(loaded, p);
        let text = fs::read_to_string(store.profile_path("p")).unwrap();
        assert!(text.find("ALPHA").unwrap() < text.find("ZED").unwrap());
        assert!(text.ends_with("}\n"));
    }

    #[test]
    fn save_rejects_invalid_variables() {
        let (_d, store) = temp_store();
        let mut p = store.create_profile("p", "").unwrap();
        p.variables.insert(
            "lower".into(),
            Variable {
                ty: VarType::String,
                value: Some(json!("x")),
                description: String::new(),
            },
        );
        assert!(matches!(
            store.save_profile(&p).unwrap_err(),
            CoreError::Validation(_)
        ));
        p.variables.clear();
        p.variables.insert(
            "URL".into(),
            Variable {
                ty: VarType::Url,
                value: Some(json!("ftp://x")),
                description: String::new(),
            },
        );
        assert!(matches!(
            store.save_profile(&p).unwrap_err(),
            CoreError::Validation(_)
        ));
    }

    #[test]
    fn load_rejects_name_mismatch_and_missing_profile() {
        let (_d, store) = temp_store();
        store.create_profile("real", "").unwrap();
        let text = fs::read_to_string(store.profile_path("real")).unwrap();
        fs::create_dir_all(store.profile_dir("other")).unwrap();
        fs::write(store.profile_path("other"), text).unwrap();
        assert!(matches!(
            store.load_profile("other").unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            store.load_profile("nope").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn delete_removes_dir_and_clears_active_pointer() {
        let (_d, store) = temp_store();
        store.create_profile("a", "").unwrap();
        store.create_profile("b", "").unwrap();
        store.set_active_profile("b").unwrap();
        store.delete_profile("b").unwrap();
        assert!(!store.profile_dir("b").exists());
        assert_eq!(store.active_profile_name().unwrap(), None);
        assert_eq!(store.list_profiles().unwrap(), vec!["a"]);
        assert!(matches!(
            store.delete_profile("b").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn set_active_requires_existing_profile() {
        let (_d, store) = temp_store();
        assert!(matches!(
            store.set_active_profile("ghost").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn fixture_profile_loads_and_validates() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../schema/fixtures/valid/basic");
        let store = Store::open(root);
        assert_eq!(store.list_profiles().unwrap(), vec!["commercial-one-day"]);
        let p = store.load_profile("commercial-one-day").unwrap();
        assert_eq!(p.variables.len(), 9);
        assert_eq!(p.variables["SLACK_WEBHOOK"].ty, VarType::Secret);
        assert_eq!(p.variables["SLACK_WEBHOOK"].value, None);
        assert_eq!(
            store.active_profile().unwrap().map(|p| p.name),
            Some("commercial-one-day".to_string())
        );
    }
}
