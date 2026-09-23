//! `secrets.json` and the variable operations that must keep `profile.json`
//! and `secrets.json` consistent.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::store::Store;
use crate::variable::{validate_var_name, VarType, Variable};

/// What a caller supplies to create or replace a variable.
#[derive(Debug, Clone, PartialEq)]
pub struct VariableInput {
    /// The variable's declared type.
    pub ty: VarType,
    /// For `Secret`, the secret string as a JSON string; for all other types
    /// the typed JSON value.
    pub value: Option<Value>,
    /// Free-text description shown to whoever edits the profile.
    pub description: String,
}

/// A variable with its value resolved from whichever file holds it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResolvedVariable {
    /// The variable's name.
    pub name: String,
    /// The variable's declared type.
    pub ty: VarType,
    /// The variable's resolved value: from `profile.json` for a plain
    /// variable, or from `secrets.json` for a secret.
    pub value: Option<Value>,
    /// Free-text description shown to whoever edits the profile.
    pub description: String,
}

impl Store {
    /// Secrets file path for a profile.
    pub fn secrets_path(&self, name: &str) -> PathBuf {
        self.profile_dir(name).join("secrets.json")
    }

    /// Load secrets from a profile. Missing file means no secrets.
    pub fn load_secrets(&self, profile: &str) -> Result<BTreeMap<String, String>> {
        self.checked_profile_dir(profile)?;
        fs_util::read_json_or(&self.secrets_path(profile), BTreeMap::new())
    }

    /// Save secrets to a profile file. Written with mode 0600 on Unix.
    pub fn save_secrets(&self, profile: &str, secrets: &BTreeMap<String, String>) -> Result<()> {
        self.checked_profile_dir(profile)?;
        fs_util::write_json_atomic(&self.secrets_path(profile), secrets, true)
    }

    /// Create or replace a variable in a profile.
    pub fn set_variable(&self, profile: &str, name: &str, input: VariableInput) -> Result<()> {
        validate_var_name(name)?;
        let mut prof = self.load_profile(profile)?;
        let mut secrets = self.load_secrets(profile)?;

        let variable = if input.ty == VarType::Secret {
            let secret = match input.value {
                Some(Value::String(s)) => s,
                _ => {
                    return Err(CoreError::Validation(format!(
                        "variable '{name}': secret variables require a string value"
                    )))
                }
            };
            secrets.insert(name.to_owned(), secret);
            Variable {
                ty: VarType::Secret,
                value: None,
                description: input.description,
            }
        } else {
            secrets.remove(name);
            Variable {
                ty: input.ty,
                value: input.value,
                description: input.description,
            }
        };
        variable.validate(name)?;

        prof.variables.insert(name.to_owned(), variable);
        if !secrets.is_empty() || self.secrets_path(profile).exists() {
            self.save_secrets(profile, &secrets)?;
        }
        self.save_profile(&prof)?;
        Ok(())
    }

    /// Get a variable value from a profile, resolving its value from the appropriate file.
    pub fn get_variable(&self, profile: &str, name: &str) -> Result<ResolvedVariable> {
        let prof = self.load_profile(profile)?;
        let var = prof
            .variables
            .get(name)
            .ok_or_else(|| CoreError::VariableNotFound(name.to_owned()))?;
        self.resolve(profile, name, var, None)
    }

    /// List all variables in a profile, sorted by name.
    pub fn list_variables(&self, profile: &str) -> Result<Vec<ResolvedVariable>> {
        let prof = self.load_profile(profile)?;
        let secrets = self.load_secrets(profile)?;
        prof.variables
            .iter()
            .map(|(name, var)| self.resolve(profile, name, var, Some(&secrets)))
            .collect()
    }

    /// Delete a variable from a profile.
    pub fn delete_variable(&self, profile: &str, name: &str) -> Result<()> {
        let mut prof = self.load_profile(profile)?;
        let mut secrets = self.load_secrets(profile)?;
        let in_profile = prof.variables.remove(name).is_some();
        let in_secrets = secrets.remove(name).is_some();
        if !in_profile && !in_secrets {
            return Err(CoreError::VariableNotFound(name.to_owned()));
        }
        if in_secrets {
            self.save_secrets(profile, &secrets)?;
        }
        if in_profile {
            self.save_profile(&prof)?;
        }
        Ok(())
    }

    fn resolve(
        &self,
        profile: &str,
        name: &str,
        var: &Variable,
        secrets: Option<&BTreeMap<String, String>>,
    ) -> Result<ResolvedVariable> {
        let value = if var.ty == VarType::Secret {
            let owned;
            let map = match secrets {
                Some(m) => m,
                None => {
                    owned = self.load_secrets(profile)?;
                    &owned
                }
            };
            map.get(name).map(|s| Value::String(s.clone()))
        } else {
            var.value.clone()
        };
        Ok(ResolvedVariable {
            name: name.to_owned(),
            ty: var.ty,
            value,
            description: var.description.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        store.create_profile("p", "").unwrap();
        (dir, store)
    }

    fn input(ty: VarType, value: Value) -> VariableInput {
        VariableInput {
            ty,
            value: Some(value),
            description: "d".into(),
        }
    }

    #[test]
    fn plain_variable_lives_in_profile_json_only() {
        let (_d, store) = temp_store();
        store
            .set_variable("p", "PROJECT_NAME", input(VarType::String, json!("X")))
            .unwrap();
        let got = store.get_variable("p", "PROJECT_NAME").unwrap();
        assert_eq!(got.value, Some(json!("X")));
        assert_eq!(got.ty, VarType::String);
        assert!(!store.secrets_path("p").exists());
    }

    #[test]
    fn secret_lives_in_secrets_json_only() {
        let (_d, store) = temp_store();
        store
            .set_variable("p", "HOOK", input(VarType::Secret, json!("https://h")))
            .unwrap();
        let profile = store.load_profile("p").unwrap();
        assert_eq!(profile.variables["HOOK"].value, None);
        assert_eq!(store.load_secrets("p").unwrap()["HOOK"], "https://h");
        assert_eq!(
            store.get_variable("p", "HOOK").unwrap().value,
            Some(json!("https://h"))
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(store.secrets_path("p"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }

    #[test]
    fn secret_requires_a_string_value() {
        let (_d, store) = temp_store();
        let no_value = VariableInput {
            ty: VarType::Secret,
            value: None,
            description: String::new(),
        };
        assert!(matches!(
            store.set_variable("p", "S", no_value).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            store
                .set_variable("p", "S", input(VarType::Secret, json!(5)))
                .unwrap_err(),
            CoreError::Validation(_)
        ));
    }

    #[test]
    fn changing_type_moves_the_value_between_files() {
        let (_d, store) = temp_store();
        store
            .set_variable("p", "V", input(VarType::Secret, json!("s")))
            .unwrap();
        store
            .set_variable("p", "V", input(VarType::String, json!("plain")))
            .unwrap();
        assert!(!store.load_secrets("p").unwrap().contains_key("V"));
        assert_eq!(
            store.get_variable("p", "V").unwrap().value,
            Some(json!("plain"))
        );
        store
            .set_variable("p", "V", input(VarType::Secret, json!("s2")))
            .unwrap();
        assert_eq!(store.load_profile("p").unwrap().variables["V"].value, None);
        assert_eq!(store.load_secrets("p").unwrap()["V"], "s2");
    }

    #[test]
    fn invalid_name_or_value_is_rejected_before_writing() {
        let (_d, store) = temp_store();
        assert!(store
            .set_variable("p", "bad", input(VarType::String, json!("x")))
            .is_err());
        assert!(store
            .set_variable("p", "N", input(VarType::Int, json!("x")))
            .is_err());
        assert!(store.load_profile("p").unwrap().variables.is_empty());
    }

    #[test]
    fn list_is_sorted_and_delete_cleans_both_files() {
        let (_d, store) = temp_store();
        store
            .set_variable("p", "B", input(VarType::Int, json!(2)))
            .unwrap();
        store
            .set_variable("p", "A", input(VarType::Secret, json!("s")))
            .unwrap();
        let names: Vec<String> = store
            .list_variables("p")
            .unwrap()
            .into_iter()
            .map(|v| v.name)
            .collect();
        assert_eq!(names, vec!["A", "B"]);
        store.delete_variable("p", "A").unwrap();
        assert!(store.load_secrets("p").unwrap().is_empty());
        assert!(matches!(
            store.get_variable("p", "A").unwrap_err(),
            CoreError::VariableNotFound(_)
        ));
        assert!(matches!(
            store.delete_variable("p", "A").unwrap_err(),
            CoreError::VariableNotFound(_)
        ));
    }

    #[test]
    fn missing_profile_is_reported() {
        let (_d, store) = temp_store();
        assert!(matches!(
            store.get_variable("ghost", "A").unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }

    #[test]
    fn fixture_secret_resolves() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../schema/fixtures/valid/basic");
        let store = Store::open(root);
        let v = store
            .get_variable("commercial-one-day", "SLACK_WEBHOOK")
            .unwrap();
        assert_eq!(v.ty, VarType::Secret);
        assert_eq!(
            v.value,
            Some(json!("https://hooks.slack.com/services/T000/B000/XXXX"))
        );
    }

    #[test]
    fn delete_variable_cleans_an_orphaned_secret() {
        let (_d, store) = temp_store();
        // Write an orphaned secret directly to secrets.json (not in profile.json)
        let mut map = BTreeMap::new();
        map.insert("ORPHAN".to_string(), "x".to_string());
        store.save_secrets("p", &map).unwrap();

        // Verify get_variable fails for the orphaned secret
        assert!(matches!(
            store.get_variable("p", "ORPHAN").unwrap_err(),
            CoreError::VariableNotFound(_)
        ));

        // delete_variable should successfully clean it up
        store.delete_variable("p", "ORPHAN").unwrap();
        assert!(store.load_secrets("p").unwrap().is_empty());

        // Subsequent delete should fail
        assert!(matches!(
            store.delete_variable("p", "ORPHAN").unwrap_err(),
            CoreError::VariableNotFound(_)
        ));
    }
}
