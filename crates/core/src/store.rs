//! `Store`: the root of a HedgeBuddy data directory, and the index file.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::fs_util;

/// Contents of `hedgebuddy.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Index {
    /// Storage format version; always 1.
    pub version: u32,
    /// Name of the active profile, or `None` on a fresh install.
    pub active_profile: Option<String>,
}

impl Default for Index {
    fn default() -> Self {
        Index {
            version: 1,
            active_profile: None,
        }
    }
}

/// A HedgeBuddy data directory. Construction does no I/O.
#[derive(Debug, Clone)]
pub struct Store {
    root: PathBuf,
}

impl Store {
    /// Open the data directory at `root`. Nothing is read or created.
    pub fn open(root: impl Into<PathBuf>) -> Store {
        Store { root: root.into() }
    }

    /// Open the platform default data directory (see `data_dir`).
    pub fn at_default() -> Result<Store> {
        Ok(Store::open(crate::paths::data_dir()?))
    }

    /// Root path of the data directory.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Path to hedgebuddy.json.
    pub fn index_path(&self) -> PathBuf {
        self.root.join("hedgebuddy.json")
    }

    /// Path to the profiles directory.
    pub fn profiles_dir(&self) -> PathBuf {
        self.root.join("profiles")
    }

    /// Path to a specific profile directory.
    pub fn profile_dir(&self, name: &str) -> PathBuf {
        self.profiles_dir().join(name)
    }

    /// Path to a profile's scripts directory.
    pub fn scripts_dir(&self, name: &str) -> PathBuf {
        self.profile_dir(name).join("scripts")
    }

    /// Validate `name` as a profile slug, then return its directory.
    /// Every method that takes a profile name from a caller must route
    /// through this before touching the filesystem, so that an invalid
    /// name (for example `""` or `".."`) can never resolve outside
    /// `profiles/`.
    pub(crate) fn checked_profile_dir(&self, name: &str) -> Result<PathBuf> {
        crate::variable::validate_slug(name)?;
        Ok(self.profile_dir(name))
    }

    /// Path to the runs directory.
    pub fn runs_dir(&self) -> PathBuf {
        self.root.join("runs")
    }

    /// Read `hedgebuddy.json`. A missing file is the empty state.
    pub fn index(&self) -> Result<Index> {
        let idx: Index = fs_util::read_json_or(&self.index_path(), Index::default())?;
        if idx.version != 1 {
            return Err(CoreError::Validation(format!(
                "unsupported hedgebuddy.json version {} (expected 1)",
                idx.version
            )));
        }
        Ok(idx)
    }

    /// Write `hedgebuddy.json` atomically.
    pub fn write_index(&self, index: &Index) -> Result<()> {
        fs_util::write_json_atomic(&self.index_path(), index, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_index_is_the_empty_state() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        assert_eq!(store.index().unwrap(), Index::default());
        assert_eq!(store.index().unwrap().active_profile, None);
    }

    #[test]
    fn index_round_trips_and_is_pretty_json() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        let idx = Index {
            version: 1,
            active_profile: Some("commercial-one-day".into()),
        };
        store.write_index(&idx).unwrap();
        assert_eq!(store.index().unwrap(), idx);
        let text = std::fs::read_to_string(store.index_path()).unwrap();
        assert_eq!(
            text,
            "{\n  \"version\": 1,\n  \"active_profile\": \"commercial-one-day\"\n}\n"
        );
        let leaked: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "tmp").unwrap_or(false))
            .collect();
        assert!(leaked.is_empty(), "temp file(s) leaked: {leaked:?}");
    }

    #[test]
    fn malformed_index_is_a_json_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("hedgebuddy.json"), "{ nope").unwrap();
        let err = Store::open(dir.path()).index().unwrap_err();
        assert!(matches!(err, CoreError::Json { .. }), "{err}");
    }

    #[test]
    fn wrong_version_is_a_validation_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("hedgebuddy.json"),
            "{\"version\": 2, \"active_profile\": null}",
        )
        .unwrap();
        let err = Store::open(dir.path()).index().unwrap_err();
        assert!(matches!(err, CoreError::Validation(_)), "{err}");
    }
}
