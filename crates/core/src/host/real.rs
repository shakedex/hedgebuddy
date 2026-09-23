//! The real machine.

use std::path::{Path, PathBuf};

use super::{BundleInfo, CommandOutput, Host, Os, RegValue, VolumeInfo};
use crate::error::{CoreError, Result};

/// The machine HedgeBuddy is running on.
#[derive(Debug, Default, Clone, Copy)]
pub struct RealHost;

impl Host for RealHost {
    fn os(&self) -> Os {
        Os::current()
    }

    fn env_var(&self, name: &str) -> Option<String> {
        std::env::var(name).ok().filter(|v| !v.is_empty())
    }

    fn home_dir(&self) -> Option<PathBuf> {
        directories::BaseDirs::new().map(|b| b.home_dir().to_path_buf())
    }

    fn registry_key_exists(&self, key: &str) -> Result<bool> {
        registry::key_exists(key)
    }

    fn registry_read(&self, key: &str, value: &str) -> Result<Option<RegValue>> {
        registry::read(key, value)
    }

    fn registry_write(&self, key: &str, value: &str, data: &RegValue) -> Result<()> {
        registry::write(key, value, data)
    }

    fn registry_delete(&self, key: &str, value: &str) -> Result<()> {
        registry::delete(key, value)
    }

    fn app_bundle(&self, app_path: &Path) -> Result<Option<BundleInfo>> {
        if Os::current() != Os::Macos {
            return Ok(None);
        }
        let plist = app_path.join("Contents").join("Info.plist");
        if !plist.is_file() {
            return Ok(None);
        }
        let read = |key: &str| -> Result<Option<String>> {
            let plist = plist.to_string_lossy();
            let out = self.run("plutil", &["-extract", key, "raw", "-o", "-", &plist])?;
            Ok((out.status == 0).then(|| out.stdout.trim().to_owned()))
        };
        match (
            read("CFBundleIdentifier")?,
            read("CFBundleShortVersionString")?,
        ) {
            (Some(id), Some(version)) => Ok(Some(BundleInfo { id, version })),
            _ => Ok(None),
        }
    }

    fn open_url(&self, url: &str) -> Result<()> {
        open::that(url).map_err(|e| CoreError::Host(format!("cannot open {url}: {e}")))
    }

    fn run(&self, program: &str, args: &[&str]) -> Result<CommandOutput> {
        let mut command = std::process::Command::new(program);
        command.args(args);
        // The desktop app is a windowless GUI program, but a console
        // subsystem child (`py`, `python3`) otherwise flashes its own
        // console window; `home_summary` alone probes Python up to once a
        // minute. `.output()` already pipes stdout/stderr, so hiding the
        // window changes nothing about what is captured.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let out = command
            .output()
            .map_err(|e| CoreError::Host(format!("cannot run {program}: {e}")))?;
        Ok(CommandOutput {
            status: out.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        })
    }

    fn volumes(&self) -> Result<Vec<VolumeInfo>> {
        let disks = sysinfo::Disks::new_with_refreshed_list();
        Ok(disks
            .list()
            .iter()
            .map(|d| VolumeInfo {
                name: d.name().to_string_lossy().into_owned(),
                mount_point: d.mount_point().to_path_buf(),
                file_system: d.file_system().to_string_lossy().into_owned(),
                total_bytes: d.total_space(),
                available_bytes: d.available_space(),
                removable: d.is_removable(),
            })
            .collect())
    }
}

#[cfg(windows)]
mod registry {
    use std::io::ErrorKind;

    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_SET_VALUE};
    use winreg::RegKey;

    use crate::error::{CoreError, Result};
    use crate::host::{split_registry_key, RegValue};

    fn root(name: &str) -> RegKey {
        if name == "HKCU" {
            RegKey::predef(HKEY_CURRENT_USER)
        } else {
            RegKey::predef(HKEY_LOCAL_MACHINE)
        }
    }

    fn err(key: &str, e: std::io::Error) -> CoreError {
        CoreError::Host(format!("registry {key}: {e}"))
    }

    pub fn key_exists(key: &str) -> Result<bool> {
        let (r, sub) = split_registry_key(key)?;
        match root(r).open_subkey(sub) {
            Ok(_) => Ok(true),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(false),
            Err(e) => Err(err(key, e)),
        }
    }

    pub fn read(key: &str, value: &str) -> Result<Option<RegValue>> {
        let (r, sub) = split_registry_key(key)?;
        let k = match root(r).open_subkey(sub) {
            Ok(k) => k,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(err(key, e)),
        };
        if let Ok(s) = k.get_value::<String, _>(value) {
            return Ok(Some(RegValue::String(s)));
        }
        match k.get_value::<u32, _>(value) {
            Ok(d) => Ok(Some(RegValue::Dword(d))),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
            Err(e) => Err(err(key, e)),
        }
    }

    pub fn write(key: &str, value: &str, data: &RegValue) -> Result<()> {
        let (r, sub) = split_registry_key(key)?;
        let (k, _) = root(r).create_subkey(sub).map_err(|e| err(key, e))?;
        match data {
            RegValue::String(s) => k.set_value(value, s),
            RegValue::Dword(d) => k.set_value(value, d),
        }
        .map_err(|e| err(key, e))
    }

    pub fn delete(key: &str, value: &str) -> Result<()> {
        let (r, sub) = split_registry_key(key)?;
        let k = match root(r).open_subkey_with_flags(sub, KEY_SET_VALUE) {
            Ok(k) => k,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(err(key, e)),
        };
        match k.delete_value(value) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
            Err(e) => Err(err(key, e)),
        }
    }
}

#[cfg(not(windows))]
mod registry {
    use crate::error::{CoreError, Result};
    use crate::host::RegValue;

    fn unsupported<T>() -> Result<T> {
        Err(CoreError::Unsupported(
            "the registry exists only on Windows".into(),
        ))
    }

    pub fn key_exists(_key: &str) -> Result<bool> {
        unsupported()
    }

    pub fn read(_key: &str, _value: &str) -> Result<Option<RegValue>> {
        unsupported()
    }

    pub fn write(_key: &str, _value: &str, _data: &RegValue) -> Result<()> {
        unsupported()
    }

    pub fn delete(_key: &str, _value: &str) -> Result<()> {
        unsupported()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_host_reports_env_and_volumes() {
        let host = RealHost;
        assert_eq!(host.os(), Os::current());
        assert!(host.env_var("PATH").is_some());
        assert!(host.home_dir().is_some());
        assert!(!host.volumes().unwrap().is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn real_registry_reads_without_writing() {
        let host = RealHost;
        assert!(host
            .registry_key_exists("HKCU\\Software\\Microsoft")
            .unwrap());
        assert!(!host
            .registry_key_exists("HKCU\\Software\\HedgeBuddyTestKeyThatDoesNotExist")
            .unwrap());
        assert_eq!(
            host.registry_read("HKCU\\Software\\HedgeBuddyTestKeyThatDoesNotExist", "x")
                .unwrap(),
            None
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn real_registry_is_unsupported_off_windows() {
        assert!(matches!(
            RealHost.registry_key_exists("HKCU\\Software").unwrap_err(),
            CoreError::Unsupported(_)
        ));
    }
}
