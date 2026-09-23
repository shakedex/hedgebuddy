//! The operating-system boundary.
//!
//! Everything HedgeBuddy does to the machine outside its own data directory —
//! the Windows registry, macOS app bundles, URL handlers, external programs,
//! and the list of mounted volumes — goes through [`Host`]. Production code
//! uses [`RealHost`]; tests use [`FakeHost`] and never touch the real machine.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};

mod fake;
mod real;

pub use fake::FakeHost;
pub use real::RealHost;

/// The two supported desktop platforms.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Windows,
    Macos,
}

impl Os {
    /// The platform this binary was built for.
    pub fn current() -> Os {
        if cfg!(windows) {
            Os::Windows
        } else {
            Os::Macos
        }
    }

    /// `"windows"` or `"macos"`, matching the catalog's section names.
    pub fn as_str(self) -> &'static str {
        match self {
            Os::Windows => "windows",
            Os::Macos => "macos",
        }
    }
}

/// A registry value HedgeBuddy reads or writes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "lowercase")]
pub enum RegValue {
    String(String),
    Dword(u32),
}

/// Identifier and short version of a macOS app bundle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BundleInfo {
    pub id: String,
    pub version: String,
}

/// Exit status and captured output of an external program.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandOutput {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

/// A mounted volume as the operating system reports it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VolumeInfo {
    pub name: String,
    pub mount_point: PathBuf,
    pub file_system: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub removable: bool,
}

/// Everything HedgeBuddy needs from the operating system.
pub trait Host: Send + Sync {
    /// The platform this host represents.
    fn os(&self) -> Os;
    /// An environment variable, or `None` when unset or empty.
    fn env_var(&self, name: &str) -> Option<String>;
    /// The user's home directory.
    fn home_dir(&self) -> Option<PathBuf>;
    /// Whether a registry key such as `HKCU\Software\Hedge` exists. Windows only.
    fn registry_key_exists(&self, key: &str) -> Result<bool>;
    /// A registry value, or `None` when the key or value does not exist. Windows only.
    fn registry_read(&self, key: &str, value: &str) -> Result<Option<RegValue>>;
    /// Write a registry value, creating the key if needed. Windows only.
    fn registry_write(&self, key: &str, value: &str, data: &RegValue) -> Result<()>;
    /// Delete a registry value; a missing key or value is not an error. Windows only.
    fn registry_delete(&self, key: &str, value: &str) -> Result<()>;
    /// Identifier and version of the app bundle at `app_path` (macOS), or
    /// `None` when it does not exist. Always `None` on Windows.
    fn app_bundle(&self, app_path: &Path) -> Result<Option<BundleInfo>>;
    /// Open a URL with its registered handler (for example `offshoot://open`).
    fn open_url(&self, url: &str) -> Result<()>;
    /// Run a program to completion and capture its output. A program that
    /// cannot be started is an error; a non-zero exit is not.
    fn run(&self, program: &str, args: &[&str]) -> Result<CommandOutput>;
    /// Mounted volumes.
    fn volumes(&self) -> Result<Vec<VolumeInfo>>;
}

/// Split `HKCU\Software\Hedge` into its root (`"HKCU"` or `"HKLM"`) and the
/// subkey path. `HKEY_CURRENT_USER` and `HKEY_LOCAL_MACHINE` are accepted too.
pub(crate) fn split_registry_key(key: &str) -> Result<(&'static str, &str)> {
    let invalid = || {
        CoreError::Validation(format!(
            "registry key '{key}' must look like HKCU\\Software\\Name"
        ))
    };
    let (root, sub) = key.split_once('\\').ok_or_else(invalid)?;
    if sub.is_empty() {
        return Err(invalid());
    }
    let root = match root.to_ascii_uppercase().as_str() {
        "HKCU" | "HKEY_CURRENT_USER" => "HKCU",
        "HKLM" | "HKEY_LOCAL_MACHINE" => "HKLM",
        _ => {
            return Err(CoreError::Validation(format!(
                "registry root '{root}' is not supported (use HKCU or HKLM)"
            )))
        }
    };
    Ok((root, sub))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_keys_split_into_root_and_subkey() {
        assert_eq!(
            split_registry_key("HKCU\\Software\\Hedge").unwrap(),
            ("HKCU", "Software\\Hedge")
        );
        assert_eq!(
            split_registry_key("hkey_current_user\\X").unwrap(),
            ("HKCU", "X")
        );
        assert_eq!(
            split_registry_key("HKLM\\Software").unwrap(),
            ("HKLM", "Software")
        );
        for bad in ["HKCU", "HKCU\\", "HKCR\\X", "Software\\Hedge", ""] {
            assert!(split_registry_key(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn os_names_match_catalog_sections() {
        assert_eq!(Os::Windows.as_str(), "windows");
        assert_eq!(Os::Macos.as_str(), "macos");
        assert_eq!(serde_json::to_string(&Os::Macos).unwrap(), "\"macos\"");
        assert_eq!(
            serde_json::to_value(RegValue::Dword(1)).unwrap(),
            serde_json::json!({"type": "dword", "data": 1})
        );
    }
}
