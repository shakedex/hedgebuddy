//! `<data>/preferences.json`: the desktop app's own settings.

use std::path::PathBuf;

use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize};

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::store::Store;

/// Contents of `preferences.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Preferences {
    /// Storage format version; always 1.
    pub version: u32,
    /// When the app was last opened (UTC, RFC 3339), or null.
    pub last_opened: Option<String>,
    /// The command "Open in editor" runs, or null for the system default.
    pub editor_command: Option<String>,
}

impl Default for Preferences {
    fn default() -> Self {
        Preferences {
            version: 1,
            last_opened: None,
            editor_command: None,
        }
    }
}

/// A change to [`Preferences`]: a key that is absent leaves its field
/// alone, `null` clears it, a value sets it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PreferencesPatch {
    /// When the app was last opened (UTC, RFC 3339), or null to clear.
    #[serde(default, deserialize_with = "present")]
    #[schemars(with = "Option<String>")]
    pub last_opened: Option<Option<String>>,
    /// The editor command, or null for the system default.
    #[serde(default, deserialize_with = "present")]
    #[schemars(with = "Option<String>")]
    pub editor_command: Option<Option<String>>,
}

/// Deserialize a key that is present (possibly `null`) as `Some(..)`, so a
/// missing key (`#[serde(default)]`, `None`) differs from `null`.
fn present<'de, D, T>(d: D) -> std::result::Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(d).map(Some)
}

impl Store {
    /// `<root>/preferences.json`.
    pub fn preferences_path(&self) -> PathBuf {
        self.root().join("preferences.json")
    }

    /// Read the preferences; a missing file is the defaults.
    pub fn preferences(&self) -> Result<Preferences> {
        let prefs: Preferences =
            fs_util::read_json_or(&self.preferences_path(), Preferences::default())?;
        if prefs.version != 1 {
            return Err(CoreError::Validation(format!(
                "unsupported preferences.json version {} (expected 1)",
                prefs.version
            )));
        }
        Ok(prefs)
    }

    /// Apply `patch` and write the file atomically. A blank editor command
    /// is stored as null. The caller holds the data folder's write lock.
    pub fn update_preferences(&self, patch: &PreferencesPatch) -> Result<Preferences> {
        let mut prefs = self.preferences()?;
        if let Some(v) = &patch.last_opened {
            prefs.last_opened = v.clone();
        }
        if let Some(v) = &patch.editor_command {
            prefs.editor_command = v
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned);
        }
        fs_util::write_json_atomic(&self.preferences_path(), &prefs, false)?;
        Ok(prefs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CoreError;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        (dir, store)
    }

    #[test]
    fn a_missing_file_reads_as_the_defaults() {
        let (_d, store) = temp_store();
        assert_eq!(
            store.preferences().unwrap(),
            Preferences {
                version: 1,
                last_opened: None,
                editor_command: None
            }
        );
        assert!(!store.preferences_path().exists());
    }

    #[test]
    fn a_patch_changes_only_the_keys_it_names() {
        let (_d, store) = temp_store();
        let set: PreferencesPatch =
            serde_json::from_str(r#"{"editor_command": "code -n"}"#).unwrap();
        store.update_preferences(&set).unwrap();
        let opened: PreferencesPatch =
            serde_json::from_str(r#"{"last_opened": "2026-09-23T10:00:00.000Z"}"#).unwrap();
        let prefs = store.update_preferences(&opened).unwrap();
        assert_eq!(prefs.editor_command.as_deref(), Some("code -n"));
        assert_eq!(
            prefs.last_opened.as_deref(),
            Some("2026-09-23T10:00:00.000Z")
        );
        let clear: PreferencesPatch = serde_json::from_str(r#"{"editor_command": null}"#).unwrap();
        let prefs = store.update_preferences(&clear).unwrap();
        assert_eq!(prefs.editor_command, None);
        assert_eq!(
            prefs.last_opened.as_deref(),
            Some("2026-09-23T10:00:00.000Z")
        );
        assert_eq!(store.preferences().unwrap(), prefs);
        let text = std::fs::read_to_string(store.preferences_path()).unwrap();
        assert!(text.starts_with("{\n  \"version\": 1,"), "{text}");
    }

    #[test]
    fn a_blank_editor_command_is_stored_as_none() {
        let (_d, store) = temp_store();
        let blank: PreferencesPatch = serde_json::from_str(r#"{"editor_command": "   "}"#).unwrap();
        assert_eq!(
            store.update_preferences(&blank).unwrap().editor_command,
            None
        );
    }

    #[test]
    fn unknown_keys_and_other_versions_are_rejected() {
        assert!(serde_json::from_str::<PreferencesPatch>(r#"{"theme": "light"}"#).is_err());
        let (_d, store) = temp_store();
        std::fs::create_dir_all(store.root()).unwrap();
        std::fs::write(
            store.preferences_path(),
            r#"{"version": 2, "last_opened": null, "editor_command": null}"#,
        )
        .unwrap();
        assert!(matches!(store.preferences(), Err(CoreError::Validation(_))));
    }
}
