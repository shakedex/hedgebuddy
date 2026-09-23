//! An in-memory [`Host`] for tests.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::{BundleInfo, CommandOutput, Host, Os, RegValue, VolumeInfo};
use crate::error::{CoreError, Result};

#[derive(Debug, Default)]
struct State {
    env: BTreeMap<String, String>,
    home: Option<PathBuf>,
    keys: BTreeSet<String>,
    registry: BTreeMap<(String, String), RegValue>,
    bundles: BTreeMap<PathBuf, BundleInfo>,
    opened: Vec<String>,
    runs: Vec<Vec<String>>,
    run_responses: BTreeMap<Vec<String>, CommandOutput>,
    volumes: Vec<VolumeInfo>,
}

/// A [`Host`] that keeps everything in memory. Registry keys and value names
/// are case-insensitive, as on Windows. Registry calls fail with
/// `Unsupported` when the fake is macOS; `app_bundle` returns `None` when it
/// is Windows. `run` answers only commands registered with
/// [`FakeHost::with_run_response`]; any other command is a `Host` error, like
/// a program that is not installed.
#[derive(Debug)]
pub struct FakeHost {
    os: Os,
    state: Mutex<State>,
}

fn norm(s: &str) -> String {
    s.to_ascii_lowercase()
}

impl FakeHost {
    /// A fake machine running `os`, with nothing installed.
    pub fn new(os: Os) -> FakeHost {
        FakeHost {
            os,
            state: Mutex::new(State::default()),
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().expect("FakeHost state poisoned")
    }

    /// Set an environment variable.
    pub fn with_env(self, name: &str, value: &str) -> Self {
        self.state().env.insert(name.to_owned(), value.to_owned());
        self
    }

    /// Set the home directory.
    pub fn with_home(self, path: impl Into<PathBuf>) -> Self {
        self.state().home = Some(path.into());
        self
    }

    /// Create an empty registry key.
    pub fn with_registry_key(self, key: &str) -> Self {
        self.state().keys.insert(norm(key));
        self
    }

    /// Set a registry value (the key is created too).
    pub fn with_registry_value(self, key: &str, value: &str, data: RegValue) -> Self {
        {
            let mut s = self.state();
            s.keys.insert(norm(key));
            s.registry.insert((norm(key), norm(value)), data);
        }
        self
    }

    /// Install an app bundle at `path` (meaningful when the fake is macOS).
    pub fn with_app_bundle(self, path: impl Into<PathBuf>, id: &str, version: &str) -> Self {
        self.state().bundles.insert(
            path.into(),
            BundleInfo {
                id: id.to_owned(),
                version: version.to_owned(),
            },
        );
        self
    }

    /// Add a mounted volume.
    pub fn with_volume(self, volume: VolumeInfo) -> Self {
        self.state().volumes.push(volume);
        self
    }

    /// Answer `program args...` with `output`.
    pub fn with_run_response(self, program: &str, args: &[&str], output: CommandOutput) -> Self {
        let mut key = vec![program.to_owned()];
        key.extend(args.iter().map(|a| a.to_string()));
        self.state().run_responses.insert(key, output);
        self
    }

    /// Every URL passed to `open_url`, in order.
    pub fn opened_urls(&self) -> Vec<String> {
        self.state().opened.clone()
    }

    /// The current value of a registry value.
    pub fn registry_value(&self, key: &str, value: &str) -> Option<RegValue> {
        self.state()
            .registry
            .get(&(norm(key), norm(value)))
            .cloned()
    }

    /// Every `run` call as `[program, args...]`, in order.
    pub fn runs(&self) -> Vec<Vec<String>> {
        self.state().runs.clone()
    }

    fn windows_only(&self) -> Result<()> {
        if self.os == Os::Windows {
            Ok(())
        } else {
            Err(CoreError::Unsupported(
                "the registry exists only on Windows".into(),
            ))
        }
    }
}

impl Host for FakeHost {
    fn os(&self) -> Os {
        self.os
    }

    fn env_var(&self, name: &str) -> Option<String> {
        self.state()
            .env
            .get(name)
            .filter(|v| !v.is_empty())
            .cloned()
    }

    fn home_dir(&self) -> Option<PathBuf> {
        self.state().home.clone()
    }

    fn registry_key_exists(&self, key: &str) -> Result<bool> {
        self.windows_only()?;
        Ok(self.state().keys.contains(&norm(key)))
    }

    fn registry_read(&self, key: &str, value: &str) -> Result<Option<RegValue>> {
        self.windows_only()?;
        Ok(self.registry_value(key, value))
    }

    fn registry_write(&self, key: &str, value: &str, data: &RegValue) -> Result<()> {
        self.windows_only()?;
        let mut s = self.state();
        s.keys.insert(norm(key));
        s.registry.insert((norm(key), norm(value)), data.clone());
        Ok(())
    }

    fn registry_delete(&self, key: &str, value: &str) -> Result<()> {
        self.windows_only()?;
        self.state().registry.remove(&(norm(key), norm(value)));
        Ok(())
    }

    fn app_bundle(&self, app_path: &Path) -> Result<Option<BundleInfo>> {
        if self.os == Os::Windows {
            return Ok(None);
        }
        Ok(self.state().bundles.get(app_path).cloned())
    }

    fn open_url(&self, url: &str) -> Result<()> {
        self.state().opened.push(url.to_owned());
        Ok(())
    }

    fn run(&self, program: &str, args: &[&str]) -> Result<CommandOutput> {
        let mut key = vec![program.to_owned()];
        key.extend(args.iter().map(|a| a.to_string()));
        let mut s = self.state();
        s.runs.push(key.clone());
        s.run_responses.get(&key).cloned().ok_or_else(|| {
            CoreError::Host(format!(
                "cannot run {program}: not installed on this fake host"
            ))
        })
    }

    fn volumes(&self) -> Result<Vec<VolumeInfo>> {
        Ok(self.state().volumes.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_round_trip_is_case_insensitive() {
        let host = FakeHost::new(Os::Windows).with_registry_key("HKCU\\Software\\Hedge");
        assert!(host.registry_key_exists("hkcu\\software\\hedge").unwrap());
        assert!(!host.registry_key_exists("HKCU\\Software\\FoolCat").unwrap());
        assert_eq!(
            host.registry_read("HKCU\\Software\\Hedge", "X").unwrap(),
            None
        );
        host.registry_write(
            "HKCU\\Software\\Hedge",
            "EventScriptDiskAdded",
            &RegValue::String("C:\\a.py".into()),
        )
        .unwrap();
        assert_eq!(
            host.registry_read("HKCU\\SOFTWARE\\HEDGE", "eventscriptdiskadded")
                .unwrap(),
            Some(RegValue::String("C:\\a.py".into()))
        );
        host.registry_delete("HKCU\\Software\\Hedge", "EventScriptDiskAdded")
            .unwrap();
        host.registry_delete("HKCU\\Software\\Hedge", "EventScriptDiskAdded")
            .unwrap(); // missing is fine
        assert_eq!(
            host.registry_value("HKCU\\Software\\Hedge", "EventScriptDiskAdded"),
            None
        );
    }

    #[test]
    fn registry_is_windows_only_and_bundles_are_macos_only() {
        let mac =
            FakeHost::new(Os::Macos).with_app_bundle("/Applications/OffShoot.app", "id", "26.1");
        assert!(matches!(
            mac.registry_read("HKCU\\X", "v").unwrap_err(),
            CoreError::Unsupported(_)
        ));
        assert_eq!(
            mac.app_bundle(Path::new("/Applications/OffShoot.app"))
                .unwrap(),
            Some(BundleInfo {
                id: "id".into(),
                version: "26.1".into()
            })
        );
        let win =
            FakeHost::new(Os::Windows).with_app_bundle("/Applications/OffShoot.app", "id", "26.1");
        assert_eq!(
            win.app_bundle(Path::new("/Applications/OffShoot.app"))
                .unwrap(),
            None
        );
    }

    #[test]
    fn urls_env_runs_and_volumes() {
        let out = CommandOutput {
            status: 0,
            stdout: "ok".into(),
            stderr: String::new(),
        };
        let host = FakeHost::new(Os::Windows)
            .with_env("APPDATA", "C:\\Users\\x\\AppData\\Roaming")
            .with_env("EMPTY", "")
            .with_run_response("py", &["-3", "-c", "x"], out.clone());
        host.open_url("offshoot://open").unwrap();
        host.open_url("offshoot://quit").unwrap();
        assert_eq!(
            host.opened_urls(),
            vec!["offshoot://open", "offshoot://quit"]
        );
        assert_eq!(
            host.env_var("APPDATA").as_deref(),
            Some("C:\\Users\\x\\AppData\\Roaming")
        );
        assert_eq!(host.env_var("EMPTY"), None);
        assert_eq!(host.run("py", &["-3", "-c", "x"]).unwrap(), out);
        assert!(matches!(
            host.run("python3", &[]).unwrap_err(),
            CoreError::Host(_)
        ));
        assert_eq!(host.runs().len(), 2);
        assert!(host.volumes().unwrap().is_empty());
    }
}
