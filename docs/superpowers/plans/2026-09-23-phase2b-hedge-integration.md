# Phase 2B: Hedge App Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `hedgebuddy-core` everything it needs to work with Hedge's apps: an OS boundary (`Host`) with real and fake implementations, the data-driven app catalog, app detection, script attach/detach/state, profile-wide attachment sync, URL-scheme commands with callback-log responses, OffShoot presets and logs, camera-card inspection of volumes, and Python interpreter discovery.

**Architecture:** Every interaction with the machine outside the data directory goes through the `Host` trait (registry, app bundles, URL handlers, external programs, volume list); tests use `FakeHost`, production uses `RealHost`. Everything app-specific is data in `catalog/*.toml`, embedded in the binary and overridable from `<data>/catalog/`. `Hedge` (a `Host` plus a `Catalog`) plans changes as a list of `Action`s and executes them only through `Hedge::apply`, so every irreversible operation has a free dry run. Volume inspection and Python discovery are free functions over paths and `Host`.

**Tech Stack:** Rust stable (1.98), serde, serde_json, toml 1, winreg 0.56 (Windows only), sysinfo 0.39 (disk feature), open 5, thiserror 2; tempfile for tests.

**Spec:** `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md` (sections 3, 4, 7, 8, 12, 14). Phase 2A plan (storage layer this builds on): `docs/superpowers/plans/2026-09-15-phase2a-core-storage.md`.

## Global Constraints

- All access to the registry, app bundles, URL handlers, external programs, and the volume list goes through `crate::host::Host`. Unit tests use `FakeHost` only. The single exception is `crates/core/tests/real_host.rs` (Task 10), which is `#[ignore]`d and read-only.
- Nothing is written outside the HedgeBuddy data directory except by `Hedge::apply`. Every `plan_*` method is pure: it reads, never writes.
- Catalog facts (event ids, registry names, preference keys, payload keys, command syntax, file locations) are exactly those in the TOML files in Task 2. Anything not verified against docs.hedge.video or the Windows test machine carries a `# unverified` comment in the TOML.
- License commands (`activate`, `deactivate`) and `update` are not in the catalog: license keys are credentials and must never pass through an agent.
- This plan revises spec section 7's TOML shape (field names, scripting kinds `registry` / `helper_workspace` / `manual`, a `presets` section, command `form`). Task 10 updates the spec text to match; reviewers of Tasks 2–9 should treat the TOML shape in Task 2 as authoritative.
- macOS attachment writes an OffShoot Helper workspace file (`HedgeBuddy.json`) that the operator applies from OffShoot Helper; its state is reported as `staged`, never `attached`, because HedgeBuddy cannot read OffShoot's macOS preferences.
- New dependencies go in `crates/core/Cargo.toml` (same as `jiff`/`notify`): `toml = "1"`, `open = "5"`, `sysinfo = { version = "0.39", default-features = false, features = ["disk"] }`, and `[target.'cfg(windows)'.dependencies] winreg = "0.56"`.
- Every `pub` type, function, and method has a `///` doc comment (struct fields and enum variants may stay bare). Types returned to front ends derive `Serialize` (and `Deserialize` where noted).
- New public modules: `catalog`, `hedge`, `host`, `python_env`, `volumes`. Crate-root re-exports are added only where a task says so.
- `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings` stay clean; the existing 62 Rust tests and 12 Python tests stay green.
- Work happens on branch `feat/phase2b-hedge-integration`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Shell commands are for Git Bash on Windows; repo root is `E:/Coding/hedgebuddy`.

## File structure

| File | Responsibility |
|---|---|
| `crates/core/src/host/mod.rs` | `Host` trait, `Os`, `RegValue`, `BundleInfo`, `CommandOutput`, `VolumeInfo`, registry-key parsing |
| `crates/core/src/host/fake.rs` | `FakeHost`: in-memory registry, bundles, env, run responses, volumes; records opened URLs |
| `crates/core/src/host/real.rs` | `RealHost`: winreg on Windows, plutil on macOS, `open` crate, `std::process`, sysinfo |
| `catalog/{offshoot,foolcat,editready,canister}.toml`, `catalog/README.md` | the Hedge app catalog (data) |
| `crates/core/src/catalog.rs` | catalog model, parsing, validation, embedding, overrides, `%VAR%`/`~` path expansion |
| `crates/core/src/hedge/mod.rs` | `Hedge` (host + catalog) |
| `crates/core/src/hedge/apps.rs` | detection, versions, `tested_against` warnings, `describe_app` |
| `crates/core/src/hedge/attach.rs` | `Action`, `apply`, attachment state, attach/detach plans |
| `crates/core/src/hedge/sync.rs` | `attach_script`, `detach_event`, `sync_attachments`, `validate_manifest` |
| `crates/core/src/hedge/commands.rs` | URL-scheme commands: validation, URL building, batching, callback log |
| `crates/core/src/hedge/presets.rs` | OffShoot presets and app log files |
| `crates/core/src/volumes.rs` | `inspect_volume`: camera-card guess, clip count, media size |
| `crates/core/src/python_env.rs` | find the interpreter Hedge apps use; syntax-check scripts |
| `crates/core/tests/real_host.rs` | ignored, read-only smoke test against the real machine |

---

### Task 1: The `Host` boundary with `FakeHost` and `RealHost`

**Files:**
- Create: `crates/core/src/host/mod.rs`, `crates/core/src/host/fake.rs`, `crates/core/src/host/real.rs`
- Modify: `crates/core/Cargo.toml`, `crates/core/src/error.rs`, `crates/core/src/lib.rs`

**Interfaces:**
- Produces:
  - `Os { Windows, Macos }` (serde lowercase) with `Os::current()`, `Os::as_str()`.
  - `RegValue { String(String), Dword(u32) }` (serde `{"type": "string"|"dword", "data": ...}`), `BundleInfo { id, version }`, `CommandOutput { status: i32, stdout, stderr }`, `VolumeInfo { name, mount_point: PathBuf, file_system, total_bytes, available_bytes, removable }`.
  - `trait Host: Send + Sync` with `os`, `env_var`, `home_dir`, `registry_key_exists`, `registry_read`, `registry_write`, `registry_delete`, `app_bundle(&Path)`, `open_url`, `run(program, &[&str])`, `volumes`.
  - `FakeHost::new(Os)` with builders `with_env`, `with_home`, `with_registry_key`, `with_registry_value`, `with_app_bundle`, `with_volume`, `with_run_response`, and inspectors `opened_urls`, `registry_value`, `runs`.
  - `RealHost` (unit struct, `Default`, `Clone`, `Copy`).
  - `CoreError::Unsupported(String)`, `CoreError::Host(String)`.
  - `pub(crate) fn split_registry_key(&str) -> Result<(&'static str, &str)>`.
  - Crate-root re-exports: `FakeHost, Host, Os, RealHost`.

- [ ] **Step 1: Dependencies and error variants**

In `crates/core/Cargo.toml`, add to `[dependencies]` (keep alphabetical order):
```toml
open = "5"
sysinfo = { version = "0.39", default-features = false, features = ["disk"] }
```
and add a new section after `[dependencies]`:
```toml
[target.'cfg(windows)'.dependencies]
winreg = "0.56"
```

In `crates/core/src/error.rs`, add these variants after `Watch`:
```rust
    /// The operation is not available on this platform, or for this app.
    #[error("not supported: {0}")]
    Unsupported(String),
    /// An operating-system call (registry, app bundle, URL handler, external
    /// program, volume list) failed.
    #[error("host error: {0}")]
    Host(String),
```

- [ ] **Step 2: Write `host/mod.rs` with the trait, types, and a failing test**

`crates/core/src/host/mod.rs`:
```rust
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
        assert_eq!(split_registry_key("HKCU\\Software\\Hedge").unwrap(), ("HKCU", "Software\\Hedge"));
        assert_eq!(split_registry_key("hkey_current_user\\X").unwrap(), ("HKCU", "X"));
        assert_eq!(split_registry_key("HKLM\\Software").unwrap(), ("HKLM", "Software"));
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
```

Create `crates/core/src/host/fake.rs` and `crates/core/src/host/real.rs` each containing only a doc comment line for now (`//! placeholder`) plus the struct declarations with `todo!()` impls from Steps 3 and 5 — or simply write Steps 3 and 5 before running anything. Register the module in `lib.rs`: add `pub mod host;` (alphabetical, after `fs_util`) and `pub use host::{FakeHost, Host, Os, RealHost};`.

- [ ] **Step 3: Write `FakeHost` with its tests**

`crates/core/src/host/fake.rs`:
```rust
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
        self.state().registry.get(&(norm(key), norm(value))).cloned()
    }

    /// Every `run` call as `[program, args...]`, in order.
    pub fn runs(&self) -> Vec<Vec<String>> {
        self.state().runs.clone()
    }

    fn windows_only(&self) -> Result<()> {
        if self.os == Os::Windows {
            Ok(())
        } else {
            Err(CoreError::Unsupported("the registry exists only on Windows".into()))
        }
    }
}

impl Host for FakeHost {
    fn os(&self) -> Os {
        self.os
    }

    fn env_var(&self, name: &str) -> Option<String> {
        self.state().env.get(name).filter(|v| !v.is_empty()).cloned()
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
        s.run_responses
            .get(&key)
            .cloned()
            .ok_or_else(|| CoreError::Host(format!("cannot run {program}: not installed on this fake host")))
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
        assert_eq!(host.registry_read("HKCU\\Software\\Hedge", "X").unwrap(), None);
        host.registry_write("HKCU\\Software\\Hedge", "EventScriptDiskAdded", &RegValue::String("C:\\a.py".into()))
            .unwrap();
        assert_eq!(
            host.registry_read("HKCU\\SOFTWARE\\HEDGE", "eventscriptdiskadded").unwrap(),
            Some(RegValue::String("C:\\a.py".into()))
        );
        host.registry_delete("HKCU\\Software\\Hedge", "EventScriptDiskAdded").unwrap();
        host.registry_delete("HKCU\\Software\\Hedge", "EventScriptDiskAdded").unwrap(); // missing is fine
        assert_eq!(host.registry_value("HKCU\\Software\\Hedge", "EventScriptDiskAdded"), None);
    }

    #[test]
    fn registry_is_windows_only_and_bundles_are_macos_only() {
        let mac = FakeHost::new(Os::Macos).with_app_bundle("/Applications/OffShoot.app", "id", "26.1");
        assert!(matches!(mac.registry_read("HKCU\\X", "v").unwrap_err(), CoreError::Unsupported(_)));
        assert_eq!(
            mac.app_bundle(Path::new("/Applications/OffShoot.app")).unwrap(),
            Some(BundleInfo { id: "id".into(), version: "26.1".into() })
        );
        let win = FakeHost::new(Os::Windows).with_app_bundle("/Applications/OffShoot.app", "id", "26.1");
        assert_eq!(win.app_bundle(Path::new("/Applications/OffShoot.app")).unwrap(), None);
    }

    #[test]
    fn urls_env_runs_and_volumes() {
        let out = CommandOutput { status: 0, stdout: "ok".into(), stderr: String::new() };
        let host = FakeHost::new(Os::Windows)
            .with_env("APPDATA", "C:\\Users\\x\\AppData\\Roaming")
            .with_env("EMPTY", "")
            .with_run_response("py", &["-3", "-c", "x"], out.clone());
        host.open_url("offshoot://open").unwrap();
        host.open_url("offshoot://quit").unwrap();
        assert_eq!(host.opened_urls(), vec!["offshoot://open", "offshoot://quit"]);
        assert_eq!(host.env_var("APPDATA").as_deref(), Some("C:\\Users\\x\\AppData\\Roaming"));
        assert_eq!(host.env_var("EMPTY"), None);
        assert_eq!(host.run("py", &["-3", "-c", "x"]).unwrap(), out);
        assert!(matches!(host.run("python3", &[]).unwrap_err(), CoreError::Host(_)));
        assert_eq!(host.runs().len(), 2);
        assert!(host.volumes().unwrap().is_empty());
    }
}
```

- [ ] **Step 4: Write `RealHost`**

`crates/core/src/host/real.rs`:
```rust
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
        match (read("CFBundleIdentifier")?, read("CFBundleShortVersionString")?) {
            (Some(id), Some(version)) => Ok(Some(BundleInfo { id, version })),
            _ => Ok(None),
        }
    }

    fn open_url(&self, url: &str) -> Result<()> {
        open::that(url).map_err(|e| CoreError::Host(format!("cannot open {url}: {e}")))
    }

    fn run(&self, program: &str, args: &[&str]) -> Result<CommandOutput> {
        let out = std::process::Command::new(program)
            .args(args)
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
        Err(CoreError::Unsupported("the registry exists only on Windows".into()))
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
        assert!(host.registry_key_exists("HKCU\\Software\\Microsoft").unwrap());
        assert!(!host.registry_key_exists("HKCU\\Software\\HedgeBuddyTestKeyThatDoesNotExist").unwrap());
        assert_eq!(
            host.registry_read("HKCU\\Software\\HedgeBuddyTestKeyThatDoesNotExist", "x").unwrap(),
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
```

If the compiler disagrees with an API here, adapt minimally and record it in the report: `sysinfo::Disks::new_with_refreshed_list()` may return the list directly or a `Result` depending on the 0.39 release; `winreg`'s `get_value::<u32, _>` on a `REG_SZ` value returns an error of kind `InvalidData` (the String-first order above handles both types).

- [ ] **Step 5: Run the tests, fmt, clippy**

```bash
cd E:/Coding/hedgebuddy
cargo test -p hedgebuddy-core host::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 7 new tests pass (2 in `host`, 3 in `host::fake`, 2 in `host::real` on Windows), plus the existing suite. The registry test only reads.

- [ ] **Step 6: Commit**

```bash
git add crates/core Cargo.lock
git commit -m "feat(core): Host boundary with FakeHost and RealHost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Hedge app catalog

**Files:**
- Create: `catalog/offshoot.toml`, `catalog/foolcat.toml`, `catalog/editready.toml`, `catalog/canister.toml`, `catalog/README.md`, `crates/core/src/catalog.rs`
- Modify: `crates/core/Cargo.toml` (add `toml = "1"`), `crates/core/src/error.rs`, `crates/core/src/lib.rs`, `crates/core/src/store.rs` (add `catalog_dir`)

**Interfaces:**
- Consumes: `Host`, `Os` (Task 1); `validate_slug`.
- Produces:
  - Types (all `Serialize + Deserialize + Clone + Debug + PartialEq`): `AppManifest { catalog_version, tested_against, app: AppInfo, detect: PerOs<Detect>, scripting: PerOs<Scripting>, events: Vec<EventSpec>, commands: Vec<CommandSpec>, files: PerOs<Files>, presets: PerOs<PresetsSpec> }`, `AppInfo { id, name, scheme: Option<String>, requires_pro, docs }`, `PerOs<T> { windows: Option<T>, macos: Option<T> }` with `get(Os) -> Option<&T>`, `Detect { registry_key, version_value, app_path, bundle_id }` (all `Option<String>`), `Scripting::{Registry { key, enable_value, value_pattern }, HelperWorkspace { workspace_dir, workspace_file, enable_pref, pref_pattern }, Manual { note }}` (tag `kind`, snake_case), `EventSpec { id, description, registry_name: Option, pref_name: Option, payload: Vec<String>, json_fields: Vec<String> }`, `CommandForm::{Url, Action}`, `CommandSpec { id, description, form, params: BTreeMap<String,String>, platforms: Vec<Os>, confirm, list_separator: Option<String> }`, `Files { callback_log, event_log }`, `PresetsSpec { dir, registry_key, location_override_value, selected_value }`, `ParamType::{String, Path, PathList, Int, Bool, Json}`, `ParamSpec { ty, optional }`.
  - `ParamSpec::parse(&str)`, `CommandSpec::param_specs()`, `CommandSpec::available_on(Os)`, `AppManifest::event(id)`, `AppManifest::command(id)`, `AppManifest::validate()`, `parse_app_manifest(text, source)`.
  - `Catalog::embedded()`, `Catalog::load(Option<&Path>)`, `Catalog::apps()`, `Catalog::app(id)`, `Catalog::overridden()`.
  - `expand_path(&dyn Host, &str) -> Result<PathBuf>`.
  - `Store::catalog_dir()`.
  - `CoreError::{Catalog(String), AppNotFound(String), EventNotFound { app, event }, CommandNotFound { app, command }}`.
  - Crate-root re-export: `Catalog`.

- [ ] **Step 1: Write the four catalog files**

`catalog/offshoot.toml`:
```toml
# OffShoot (hedge.co). Verified against docs.hedge.video (September 2026) and a
# Windows machine running OffShoot 26.1 (1023). Lines marked "unverified" are
# inferred and need a real-machine check before being relied on.
catalog_version = 1
tested_against = "26.1"

[app]
id = "offshoot"
name = "OffShoot"
scheme = "offshoot"
requires_pro = true
docs = "https://docs.hedge.video/offshoot/features/automation"

[detect.windows]
registry_key = 'HKCU\Software\Hedge'
version_value = "BuildVersion"

[detect.macos]
app_path = "/Applications/OffShoot.app"
bundle_id = "nl.syncfactory.Hedge.Mac" # unverified

[scripting.windows]
kind = "registry"
key = 'HKCU\Software\Hedge'
enable_value = "EventScriptAllowScripting"
value_pattern = "EventScript{registry_name}"

# macOS: OffShoot Helper applies workspace JSON files; setPreferences keys are
# documented on the Helper page. HedgeBuddy writes HedgeBuddy.json and the
# operator applies it from the Helper menu.
[scripting.macos]
kind = "helper_workspace"
workspace_dir = "~/Library/Preferences/Hedge/Workspaces"
workspace_file = "HedgeBuddy.json"
enable_pref = "scripting_opt_in"
pref_pattern = "scripting_events_{pref_name}"

[[events]]
id = "OffShootStarted"
description = "OffShoot launched. Empty payload."
registry_name = "AppStarted"
payload = []

[[events]]
id = "DiskAdded"
description = "A disk was mounted."
registry_name = "DiskAdded"
pref_name = "disk_added"
payload = [
  "DiskAdded_allowed", "DiskAdded_availableDiskSpace", "DiskAdded_deviceName",
  "DiskAdded_diskSize", "DiskAdded_hidden", "DiskAdded_modelName",
  "DiskAdded_mountedAt", "DiskAdded_protocolName", "DiskAdded_rootFilePath",
  "DiskAdded_title", "DiskAdded_volumeKind",
]

[[events]]
id = "DiskRemoved"
description = "A disk was unmounted."
registry_name = "DiskRemoved"
pref_name = "disk_removed"
payload = ["DiskRemoved_rootFilePath", "DiskRemoved_title", "DiskRemoved_unmountedAt"]

[[events]]
id = "DiskBusy"
description = "A disk started transferring."
registry_name = "DiskBusy"
pref_name = "disk_busy"
payload = ["DiskBusy_rootFilePath", "DiskBusy_title"]

[[events]]
id = "DiskIdle"
description = "A disk finished all its transfers."
registry_name = "DiskIdle"
pref_name = "disk_idle"
payload = ["DiskIdle_diskType", "DiskIdle_hasFailedTransfers", "DiskIdle_rootFilePath", "DiskIdle_title"]

[[events]]
id = "DisksIdle"
description = "All disks finished their transfers. Empty payload."
registry_name = "AllDisksIdle"
pref_name = "disks_idle"
payload = []

[[events]]
id = "TransfersAdded"
description = "Transfers were queued. These keys are not prefixed with the event name."
registry_name = "TransfersAdded"
payload = ["transferType", "addedAt", "transferGroups"]

[[events]]
id = "SourceAdded"
description = "A source was added (new in 26.1). Attachment location unverified on both platforms."
payload = ["SourceAdded_name", "SourceAdded_paths"]

[[events]]
id = "FileCopyCompleted"
description = "A transfer finished (state is Success, Failed, Warnings, Canceled or Stopped)."
registry_name = "FileCopyCompleted"
pref_name = "file_copy_completed"
payload = [
  "FileCopyCompleted_sourcePaths", "FileCopyCompleted_presetName", "FileCopyCompleted_state",
  "FileCopyCompleted_sourceInfo", "FileCopyCompleted_startedAt", "FileCopyCompleted_destinationPath",
  "FileCopyCompleted_verification_mode", "FileCopyCompleted_duration", "FileCopyCompleted_bytesCopied",
  "FileCopyCompleted_id", "FileCopyCompleted_transferLogJSONPath",
]
json_fields = ["FileCopyCompleted_sourceInfo"]

[[events]]
id = "VerificationIssue"
description = "Verification found a problem with a file."
registry_name = "CheckpointIssue"
pref_name = "checkpoint_issue"
payload = ["VerificationIssue_description", "VerificationIssue_filePath"]

[[commands]]
id = "open"
description = "Launch or focus OffShoot."
form = "url"

[[commands]]
id = "quit"
description = "Quit OffShoot."
form = "url"
confirm = true

[[commands]]
id = "restart"
description = "Restart OffShoot."
form = "url"
confirm = true

[[commands]]
id = "reloadPresets"
description = "Reload presets from disk after writing one."
form = "url"

[[commands]]
id = "reset"
description = "Clear sources or destinations. type is 'sources' or 'destinations'."
form = "url"
params = { type = "string" }
confirm = true

[[commands]]
id = "setSource"
description = "Add a source with an optional label."
form = "action"
params = { paths = "path[]", label = "string?" }

[[commands]]
id = "setDestination"
description = "Add a destination."
form = "action"
params = { path = "path" }

[[commands]]
id = "addTransfers"
description = "Start transfers for the current sources and destinations."
form = "url"
confirm = true

[[commands]]
id = "restartTransfer"
description = "Restart a transfer by its id (FileCopyCompleted_id)."
form = "action"
params = { id = "string" }
confirm = true

[files.windows]
callback_log = '%APPDATA%\Hedge\HedgeCallback.log'
event_log = '%APPDATA%\Hedge\Hedge.log'

[files.macos]
callback_log = "~/Library/Logs/Hedge/urlSchemeResponseLog.txt"

# Presets: Windows location observed on the test machine. PresetsLocation is a
# documented override; SessionVariableSelectedPreset holds the selected preset
# (observed, undocumented). The macOS location is not documented.
[presets.windows]
dir = '%APPDATA%\Hedge\Presets'
registry_key = 'HKCU\Software\Hedge'
location_override_value = "PresetsLocation"
selected_value = "SessionVariableSelectedPreset"
```

`catalog/foolcat.toml`:
```toml
# FoolCat (hedge.co). Verified against docs.hedge.video (September 2026) and a
# Windows machine running FoolCat 26.1.1 (121).
catalog_version = 1
tested_against = "26.1.1"

[app]
id = "foolcat"
name = "FoolCat"
scheme = "foolcat"
requires_pro = true
docs = "https://docs.hedge.video/foolcat/automation"

[detect.windows]
registry_key = 'HKCU\Software\FoolCat'
version_value = "BuildVersion"

[detect.macos]
app_path = "/Applications/FoolCat.app"

[scripting.windows]
kind = "registry"
key = 'HKCU\Software\FoolCat'
enable_value = "EventScriptAllowScripting"
value_pattern = "EventScript{registry_name}"

[scripting.macos]
kind = "manual"
note = "Attach the script in FoolCat > Settings > Scripting"

[[events]]
id = "FoolCatStarted"
description = "FoolCat launched. Empty payload."
registry_name = "AppStarted"
payload = []

[[events]]
id = "ReportCreated"
description = "A report finished rendering."
registry_name = "ReportCreated"
payload = ["ReportCreated_status", "ReportCreated_error", "ReportCreated_pdfPath", "ReportCreated_htmlPath"]

[[commands]]
id = "open"
description = "Launch or focus FoolCat."
form = "url"

[[commands]]
id = "create"
description = "Create a report from a source folder into a destination folder."
form = "url"
params = { source = "path", destination = "path", name = "string?", description = "string?" }
confirm = true

[files.macos]
event_log = "~/Library/Application Support/FoolCat/Event Log/FoolCatEvents.log"
```

`catalog/editready.toml`:
```toml
# EditReady (hedge.co). Verified against docs.hedge.video (September 2026).
# Not installed on the test machine; Windows detection is unverified.
catalog_version = 1
tested_against = "25.4"

[app]
id = "editready"
name = "EditReady"
scheme = "editready"
requires_pro = true
docs = "https://docs.hedge.video/editready/automation"

[detect.windows]
registry_key = 'HKCU\Software\EditReady' # unverified
version_value = "BuildVersion" # unverified

[detect.macos]
app_path = "/Applications/EditReady.app"

[scripting.windows]
kind = "manual"
note = "Attach the script in EditReady's Scripting settings (Windows scripting is not documented)"

[scripting.macos]
kind = "manual"
note = "Attach the script in EditReady > Settings > Scripting"

[[events]]
id = "EditReadyStarted"
description = "EditReady launched. Empty payload."
payload = []

[[events]]
id = "FileConversionCompleted"
description = "A conversion finished."
payload = [
  "FileConversionCompleted_sourcePath", "FileConversionCompleted_destinationPath",
  "FileConversionCompleted_status", "FileConversionCompleted_error",
]

[[commands]]
id = "open"
description = "Launch or focus EditReady."
form = "url"

[[commands]]
id = "add"
description = "Add a source file."
form = "url"
params = { sourcePath = "path" }

[[commands]]
id = "transcode"
description = "Transcode a file with a named preset."
form = "url"
params = { sourcePath = "path", preset = "string", destinationPath = "path" }
confirm = true

[files.macos]
event_log = "~/Library/Application Support/EditReady/Event Log/EditReadyEvents.log"
```

`catalog/canister.toml`:
```toml
# Canister (hedge.co). Verified against docs.hedge.video (September 2026).
# Not installed on the test machine; Windows detection is unverified.
# Canister has an automation API but no script events.
catalog_version = 1
tested_against = "26.1"

[app]
id = "canister"
name = "Canister"
scheme = "canister"
requires_pro = false
docs = "https://docs.hedge.video/canister/features/automation"

[detect.windows]
registry_key = 'HKCU\Software\Canister' # unverified
version_value = "BuildVersion" # unverified

[detect.macos]
app_path = "/Applications/Canister.app"

[[commands]]
id = "open"
description = "Launch or focus Canister."
form = "url"

[[commands]]
id = "addarchive"
description = "Archive sources to tape."
form = "url"
params = { sources = "path[]", destinationtape = "string?", destinationfolder = "string?" }
list_separator = "|"
confirm = true

[[commands]]
id = "addretrieve"
description = "Retrieve sources from a tape."
form = "url"
params = { sources = "path[]", sourcetape = "string", destinationpath = "path" }
list_separator = "|"
confirm = true

[[commands]]
id = "gettapes"
description = "Write the tape list as JSON to a file. The path is required on macOS."
form = "url"
params = { path = "path?" }
```

`catalog/README.md`:
```markdown
# Hedge app catalog

One TOML file per Hedge app. HedgeBuddy embeds these files; a file with the
same name in `<data dir>/catalog/` replaces the embedded one, and a new file
adds an app. When Hedge changes an app, edit the data here, not the code.

| Section | Meaning |
|---|---|
| `catalog_version` | Always `1`. |
| `tested_against` | App version these facts were checked against. HedgeBuddy warns when the installed app is newer. |
| `[app]` | `id` (the file name), display `name`, URL `scheme`, `requires_pro`, `docs` link. |
| `[detect.windows]` | `registry_key` that exists when installed, `version_value` read from it. |
| `[detect.macos]` | `app_path` of the bundle, optional `bundle_id` to confirm it. |
| `[scripting.<os>]` | How scripts are attached: `registry` (`key`, `enable_value`, `value_pattern` with `{registry_name}`), `helper_workspace` (`workspace_dir`, `workspace_file`, `enable_pref`, `pref_pattern` with `{pref_name}`), or `manual` (`note`). Missing = not possible. |
| `[[events]]` | `id`, `description`, `registry_name` / `pref_name` (missing = cannot be attached on that platform), `payload` (exact keys the script receives in `sys.argv[1]`), `json_fields` (keys whose value is JSON inside a string). |
| `[[commands]]` | `id`, `description`, `form` (`url` = `scheme://id?k=v`, `action` = batched into `scheme://actions?json=[...]`), `params` (`string`, `path`, `path[]`, `int`, `bool`, `json`; `?` = optional), `platforms`, `confirm` (ask the operator first), `list_separator` for `path[]` in URLs (default: JSON array). |
| `[files.<os>]` | `callback_log` (URL-scheme responses) and `event_log`. `%VAR%` and `~` are expanded. |
| `[presets.<os>]` | Preset folder `dir`, and the registry `location_override_value` / `selected_value` under `registry_key`. |

Lines marked `# unverified` are inferred; confirm them on a real machine and remove the marker.
```

- [ ] **Step 2: Error variants and `Store::catalog_dir`**

In `crates/core/src/error.rs`, after `Host`:
```rust
    /// A catalog file failed to parse or broke one of the catalog's rules.
    #[error("catalog: {0}")]
    Catalog(String),
    /// No app with this id is in the catalog.
    #[error("app '{0}' is not in the catalog")]
    AppNotFound(String),
    /// The app has no event with this id.
    #[error("{app} has no event '{event}'")]
    EventNotFound { app: String, event: String },
    /// The app has no command with this id.
    #[error("{app} has no command '{command}'")]
    CommandNotFound { app: String, command: String },
```

In `crates/core/src/store.rs`, after `runs_dir`:
```rust
    /// Folder of catalog overrides: `<root>/catalog`.
    pub fn catalog_dir(&self) -> PathBuf {
        self.root.join("catalog")
    }
```

Add `toml = "1"` to `[dependencies]` in `crates/core/Cargo.toml`.

- [ ] **Step 3: Write `catalog.rs` with failing tests**

`crates/core/src/catalog.rs`:
```rust
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
pub struct PerOs<T> {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub windows: Option<T>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub macos: Option<T>,
}

impl<T> Default for PerOs<T> {
    fn default() -> Self {
        PerOs { windows: None, macos: None }
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
        todo!()
    }
}

impl CommandSpec {
    /// Every parameter's parsed declaration.
    pub fn param_specs(&self) -> Result<BTreeMap<String, ParamSpec>> {
        todo!()
    }

    /// Whether the command can run on `os` (an empty `platforms` means all).
    pub fn available_on(&self, os: Os) -> bool {
        self.platforms.is_empty() || self.platforms.contains(&os)
    }
}

impl AppManifest {
    /// The event with this id.
    pub fn event(&self, id: &str) -> Result<&EventSpec> {
        self.events.iter().find(|e| e.id == id).ok_or_else(|| CoreError::EventNotFound {
            app: self.app.id.clone(),
            event: id.to_owned(),
        })
    }

    /// The command with this id.
    pub fn command(&self, id: &str) -> Result<&CommandSpec> {
        self.commands.iter().find(|c| c.id == id).ok_or_else(|| CoreError::CommandNotFound {
            app: self.app.id.clone(),
            command: id.to_owned(),
        })
    }

    /// Check the catalog's own rules (see `catalog/README.md`).
    pub fn validate(&self) -> Result<()> {
        todo!()
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
        todo!()
    }

    /// The embedded manifests, with every `<id>.toml` in `overrides_dir`
    /// replacing or adding the app of the same id. A missing folder is fine.
    pub fn load(overrides_dir: Option<&Path>) -> Result<Catalog> {
        todo!()
    }

    /// All apps, sorted by id.
    pub fn apps(&self) -> impl Iterator<Item = &AppManifest> {
        self.apps.values()
    }

    /// The app with this id.
    pub fn app(&self, id: &str) -> Result<&AppManifest> {
        self.apps.get(id).ok_or_else(|| CoreError::AppNotFound(id.to_owned()))
    }

    /// Ids of apps whose manifest came from the overrides folder, sorted.
    pub fn overridden(&self) -> &[String] {
        &self.overridden
    }
}

/// Expand a leading `~` (home directory) and `%NAME%` environment variables.
pub fn expand_path(host: &dyn Host, template: &str) -> Result<PathBuf> {
    todo!()
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
        assert!(matches!(c.app("postlab").unwrap_err(), CoreError::AppNotFound(_)));
    }

    #[test]
    fn offshoot_facts_are_encoded() {
        let c = Catalog::embedded().unwrap();
        let o = c.app("offshoot").unwrap();
        assert_eq!(o.events.len(), 10);
        assert_eq!(o.event("VerificationIssue").unwrap().registry_name.as_deref(), Some("CheckpointIssue"));
        assert_eq!(o.event("OffShootStarted").unwrap().registry_name.as_deref(), Some("AppStarted"));
        assert_eq!(o.event("DisksIdle").unwrap().registry_name.as_deref(), Some("AllDisksIdle"));
        assert_eq!(o.event("SourceAdded").unwrap().registry_name, None);
        assert_eq!(o.event("FileCopyCompleted").unwrap().json_fields, vec!["FileCopyCompleted_sourceInfo"]);
        assert!(matches!(o.event("Nope").unwrap_err(), CoreError::EventNotFound { .. }));
        let set_source = o.command("setSource").unwrap();
        assert_eq!(set_source.form, CommandForm::Action);
        let specs = set_source.param_specs().unwrap();
        assert_eq!(specs["paths"], ParamSpec { ty: ParamType::PathList, optional: false });
        assert_eq!(specs["label"], ParamSpec { ty: ParamType::String, optional: true });
        for banned in ["activate", "deactivate", "update"] {
            assert!(o.command(banned).is_err(), "{banned} must not be in the catalog");
        }
        assert!(matches!(o.scripting.get(Os::Windows), Some(Scripting::Registry { .. })));
        assert!(matches!(o.scripting.get(Os::Macos), Some(Scripting::HelperWorkspace { .. })));
        let canister = c.app("canister").unwrap();
        assert!(canister.events.is_empty());
        assert_eq!(canister.command("addarchive").unwrap().list_separator.as_deref(), Some("|"));
    }

    #[test]
    fn param_specs_parse() {
        assert_eq!(ParamSpec::parse("path[]?").unwrap(), ParamSpec { ty: ParamType::PathList, optional: true });
        assert_eq!(ParamSpec::parse("int").unwrap(), ParamSpec { ty: ParamType::Int, optional: false });
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
        assert_eq!(c.overridden(), ["newapp".to_string(), "offshoot".to_string()]);
        assert_eq!(Catalog::load(Some(&dir.path().join("missing"))).unwrap().apps().count(), 4);
        assert_eq!(Catalog::load(None).unwrap(), Catalog::embedded().unwrap());
    }

    #[test]
    fn invalid_overrides_are_reported_with_the_file_name() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("broken.toml"), "catalog_version = [").unwrap();
        let err = Catalog::load(Some(dir.path())).unwrap_err();
        assert!(matches!(&err, CoreError::Catalog(m) if m.contains("broken.toml")), "{err}");

        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("other.toml"), MINIMAL).unwrap();
        let err = Catalog::load(Some(dir.path())).unwrap_err();
        assert!(matches!(&err, CoreError::Catalog(m) if m.contains("other.toml")), "{err}");
    }

    #[test]
    fn validation_rules() {
        let bad = |extra: &str| parse_app_manifest(&format!("{MINIMAL}{extra}"), "t").unwrap_err();
        assert!(matches!(
            parse_app_manifest(&MINIMAL.replace("catalog_version = 1", "catalog_version = 2"), "t").unwrap_err(),
            CoreError::Catalog(_)
        ));
        bad("\n[[events]]\nid = \"A\"\n[[events]]\nid = \"A\"\n");
        bad("\n[[events]]\nid = \"has space\"\n");
        bad("\n[[events]]\nid = \"A\"\npayload = [\"x\"]\njson_fields = [\"y\"]\n");
        bad("\n[[commands]]\nid = \"open\"\nform = \"url\"\n"); // no scheme
        bad("\n[scripting.windows]\nkind = \"registry\"\nkey = 'HKCU\\X'\nenable_value = \"E\"\nvalue_pattern = \"Fixed\"\n");
        bad("\n[unknown]\nx = 1\n");
        let with_scheme = MINIMAL.replace("name = \"New App\"", "name = \"New App\"\nscheme = \"newapp\"");
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
        parse_app_manifest(&format!("{with_scheme}\n[[commands]]\nid = \"a\"\nform = \"url\"\n"), "t").unwrap();
    }

    #[test]
    fn paths_expand_env_and_home() {
        let host = FakeHost::new(Os::Windows)
            .with_env("APPDATA", "C:\\Users\\x\\AppData\\Roaming")
            .with_home("/Users/x");
        assert_eq!(
            expand_path(&host, "%APPDATA%\\Hedge\\Presets").unwrap(),
            PathBuf::from("C:\\Users\\x\\AppData\\Roaming\\Hedge\\Presets")
        );
        assert_eq!(
            expand_path(&host, "~/Library/Logs/x.txt").unwrap(),
            PathBuf::from("/Users/x/Library/Logs/x.txt")
        );
        assert_eq!(expand_path(&host, "/abs/~x").unwrap(), PathBuf::from("/abs/~x"));
        assert!(matches!(expand_path(&host, "%MISSING%\\x").unwrap_err(), CoreError::Host(_)));
        assert!(matches!(expand_path(&host, "%APPDATA\\x").unwrap_err(), CoreError::Catalog(_)));
    }
}
```

Register in `lib.rs`: `pub mod catalog;` (alphabetical, first) and `pub use catalog::Catalog;`.

- [ ] **Step 4: Run to see the failures**

Run: `cargo test -p hedgebuddy-core catalog::`
Expected: all 7 catalog tests FAIL with `not yet implemented` (the `param_specs_parse` test included).

- [ ] **Step 5: Implement**

Replace the `todo!()` bodies:
```rust
impl ParamSpec {
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
                return Err(CoreError::Catalog(format!("unknown parameter type '{other}'")));
            }
        };
        Ok(ParamSpec { ty, optional })
    }
}

impl CommandSpec {
    pub fn param_specs(&self) -> Result<BTreeMap<String, ParamSpec>> {
        self.params
            .iter()
            .map(|(name, spec)| {
                ParamSpec::parse(spec)
                    .map(|p| (name.clone(), p))
                    .map_err(|e| CoreError::Catalog(format!("command {} parameter {name}: {e}", self.id)))
            })
            .collect()
    }
}
```

`AppManifest::validate`:
```rust
    pub fn validate(&self) -> Result<()> {
        let fail = |msg: String| -> Result<()> { Err(CoreError::Catalog(msg)) };
        if self.catalog_version != 1 {
            return fail(format!("unsupported catalog_version {} (expected 1)", self.catalog_version));
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
                return fail(format!("event {}: json field '{f}' is not in its payload", e.id));
            }
        }
        let mut seen = BTreeSet::new();
        for c in &self.commands {
            if !seen.insert(c.id.as_str()) {
                return fail(format!("duplicate command '{}'", c.id));
            }
            let specs = c.param_specs()?;
            if c.list_separator.is_some() && !specs.values().any(|s| s.ty == ParamType::PathList) {
                return fail(format!("command {}: list_separator needs a path[] parameter", c.id));
            }
        }
        if !self.commands.is_empty() && self.app.scheme.as_deref().is_none_or(str::is_empty) {
            return fail("commands need [app] scheme".into());
        }
        for s in [self.scripting.windows.as_ref(), self.scripting.macos.as_ref()].into_iter().flatten() {
            match s {
                Scripting::Registry { value_pattern, .. } if !value_pattern.contains("{registry_name}") => {
                    return fail("registry value_pattern must contain {registry_name}".into());
                }
                Scripting::HelperWorkspace { pref_pattern, .. } if !pref_pattern.contains("{pref_name}") => {
                    return fail("helper_workspace pref_pattern must contain {pref_name}".into());
                }
                _ => {}
            }
        }
        Ok(())
    }
```

`Catalog::embedded` and `Catalog::load`:
```rust
    pub fn embedded() -> Result<Catalog> {
        let mut apps = BTreeMap::new();
        for (id, text) in EMBEDDED {
            let m = parse_app_manifest(text, &format!("embedded {id}.toml"))?;
            apps.insert(m.app.id.clone(), m);
        }
        Ok(Catalog { apps, overridden: Vec::new() })
    }

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
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
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
```

`expand_path`:
```rust
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
    Ok(PathBuf::from(out))
}
```

Note: `serde(tag = "kind", deny_unknown_fields)` on `Scripting` is supported by serde for internally tagged enums; if it fails to compile or rejects the `kind` field at runtime, drop `deny_unknown_fields` from `Scripting` only and say so in the report.

- [ ] **Step 6: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core catalog::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 7 new tests pass; everything else green.

- [ ] **Step 7: Commit**

```bash
git add catalog crates/core Cargo.lock
git commit -m "feat(core): Hedge app catalog (OffShoot, FoolCat, EditReady, Canister) with overrides

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `Hedge` and app detection

**Files:**
- Create: `crates/core/src/hedge/mod.rs`, `crates/core/src/hedge/apps.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `Host`, `Os`, `RegValue`, `BundleInfo` (Task 1); `Catalog`, `AppManifest`, `Scripting`, `expand_path` (Task 2).
- Produces:
  - `Hedge::new(Arc<dyn Host>, Catalog)`, `Hedge::catalog()`, `Hedge::host()`, `pub(crate) Hedge::expand(&str) -> Result<PathBuf>`.
  - `ScriptingSupport::{Registry, HelperWorkspace, Manual, None}` (serde snake_case).
  - `AppStatus { id, name, installed, version: Option<String>, tested_against, newer_than_tested, requires_pro, scripting: ScriptingSupport, scripting_enabled: Option<bool>, warnings: Vec<String> }` (Serialize).
  - `ResolvedFiles { callback_log, event_log, presets_dir }` (all `Option<PathBuf>`), `AppDescription { status, manifest: AppManifest, files: ResolvedFiles }` (Serialize).
  - `Hedge::apps() -> Result<Vec<AppStatus>>` (sorted by id), `Hedge::app_status(id)`, `Hedge::describe_app(id)`.
  - `compare_versions(&str, &str) -> Ordering` (leading dotted numbers; `"26.1 (1023)"` compares as `26.1`).
  - Crate-root re-export: `Hedge`.
- Behaviour: host errors during detection become entries in `warnings`, never a failed call; `newer_than_tested` adds a warning; `scripting_enabled` is only reported for installed apps with `registry` scripting.

- [ ] **Step 1: Write the module and failing tests**

`crates/core/src/hedge/mod.rs`:
```rust
//! Hedge app integration: detection, script attachment, commands, presets and
//! logs. Everything is driven by the [`Catalog`] and executed through a
//! [`Host`].

use std::path::PathBuf;
use std::sync::Arc;

use crate::catalog::{expand_path, Catalog};
use crate::error::Result;
use crate::host::Host;

mod apps;

pub use apps::{compare_versions, AppDescription, AppStatus, ResolvedFiles, ScriptingSupport};

/// Hedge app operations on one machine.
pub struct Hedge {
    host: Arc<dyn Host>,
    catalog: Catalog,
}

impl Hedge {
    /// Combine a host and a catalog.
    pub fn new(host: Arc<dyn Host>, catalog: Catalog) -> Hedge {
        Hedge { host, catalog }
    }

    /// The catalog in use.
    pub fn catalog(&self) -> &Catalog {
        &self.catalog
    }

    /// The host in use.
    pub fn host(&self) -> &dyn Host {
        self.host.as_ref()
    }

    pub(crate) fn expand(&self, template: &str) -> Result<PathBuf> {
        expand_path(self.host.as_ref(), template)
    }
}
```

`crates/core/src/hedge/apps.rs`:
```rust
//! Which Hedge apps are installed, their versions, and their scripting support.

use std::cmp::Ordering;
use std::path::PathBuf;

use serde::Serialize;

use super::Hedge;
use crate::catalog::{AppManifest, Scripting};
use crate::error::Result;
use crate::host::{Os, RegValue};

/// How scripts are attached for an app on this platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScriptingSupport {
    Registry,
    HelperWorkspace,
    Manual,
    None,
}

/// What HedgeBuddy knows about one Hedge app on this machine.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AppStatus {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub tested_against: String,
    pub newer_than_tested: bool,
    pub requires_pro: bool,
    pub scripting: ScriptingSupport,
    pub scripting_enabled: Option<bool>,
    pub warnings: Vec<String>,
}

/// An app's file locations with `%VAR%` and `~` expanded for this machine.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResolvedFiles {
    pub callback_log: Option<PathBuf>,
    pub event_log: Option<PathBuf>,
    pub presets_dir: Option<PathBuf>,
}

/// Everything an agent needs about one app: its status, its full catalog
/// entry, and its resolved files.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AppDescription {
    pub status: AppStatus,
    pub manifest: AppManifest,
    pub files: ResolvedFiles,
}

/// Compare the leading dotted numbers of two version strings
/// (`"26.1 (1023)"` compares as `26.1`; missing parts count as 0).
pub fn compare_versions(a: &str, b: &str) -> Ordering {
    todo!()
}

impl Hedge {
    /// Status of every catalog app, sorted by id.
    pub fn apps(&self) -> Result<Vec<AppStatus>> {
        todo!()
    }

    /// Status of one app.
    pub fn app_status(&self, id: &str) -> Result<AppStatus> {
        todo!()
    }

    /// Status, catalog entry, and resolved files of one app.
    pub fn describe_app(&self, id: &str) -> Result<AppDescription> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::catalog::Catalog;
    use crate::host::FakeHost;

    fn hedge(host: FakeHost) -> Hedge {
        Hedge::new(Arc::new(host), Catalog::embedded().unwrap())
    }

    #[test]
    fn versions_compare_numerically() {
        assert_eq!(compare_versions("26.1 (1023)", "26.1"), Ordering::Equal);
        assert_eq!(compare_versions("26.1.1", "26.1"), Ordering::Greater);
        assert_eq!(compare_versions("26.10", "26.9"), Ordering::Greater);
        assert_eq!(compare_versions("25.4", "26.1"), Ordering::Less);
        assert_eq!(compare_versions("", "0"), Ordering::Equal);
    }

    #[test]
    fn windows_detection_version_and_scripting_flag() {
        let h = hedge(
            FakeHost::new(Os::Windows)
                .with_registry_value("HKCU\\Software\\Hedge", "BuildVersion", RegValue::String("26.1 (1023)".into()))
                .with_registry_value("HKCU\\Software\\Hedge", "EventScriptAllowScripting", RegValue::Dword(1)),
        );
        let s = h.app_status("offshoot").unwrap();
        assert!(s.installed);
        assert_eq!(s.version.as_deref(), Some("26.1 (1023)"));
        assert!(!s.newer_than_tested);
        assert_eq!(s.scripting, ScriptingSupport::Registry);
        assert_eq!(s.scripting_enabled, Some(true));
        assert!(s.warnings.is_empty(), "{:?}", s.warnings);

        let f = h.app_status("foolcat").unwrap();
        assert!(!f.installed);
        assert_eq!(f.version, None);
        assert_eq!(f.scripting_enabled, None);

        let ids: Vec<String> = h.apps().unwrap().into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec!["canister", "editready", "foolcat", "offshoot"]);
    }

    #[test]
    fn newer_app_version_warns() {
        let h = hedge(
            FakeHost::new(Os::Windows)
                .with_registry_value("HKCU\\Software\\Hedge", "BuildVersion", RegValue::String("26.2 (1100)".into())),
        );
        let s = h.app_status("offshoot").unwrap();
        assert!(s.newer_than_tested);
        assert_eq!(s.scripting_enabled, Some(false));
        assert!(s.warnings.iter().any(|w| w.contains("26.2") && w.contains("26.1")), "{:?}", s.warnings);
    }

    #[test]
    fn macos_detection_uses_the_app_bundle() {
        let h = hedge(
            FakeHost::new(Os::Macos)
                .with_home("/Users/x")
                .with_app_bundle("/Applications/OffShoot.app", "nl.syncfactory.Hedge.Mac", "26.1")
                .with_app_bundle("/Applications/FoolCat.app", "anything", "26.1.1"),
        );
        let o = h.app_status("offshoot").unwrap();
        assert!(o.installed);
        assert_eq!(o.scripting, ScriptingSupport::HelperWorkspace);
        assert_eq!(o.scripting_enabled, None);
        let f = h.app_status("foolcat").unwrap();
        assert!(f.installed, "no bundle_id in the catalog means any bundle counts");
        assert_eq!(f.scripting, ScriptingSupport::Manual);

        let wrong = hedge(FakeHost::new(Os::Macos).with_app_bundle("/Applications/OffShoot.app", "com.other", "1.0"));
        let s = wrong.app_status("offshoot").unwrap();
        assert!(!s.installed);
        assert!(s.warnings.iter().any(|w| w.contains("com.other")), "{:?}", s.warnings);
    }

    #[test]
    fn describe_resolves_files() {
        let h = hedge(FakeHost::new(Os::Windows).with_env("APPDATA", "C:\\Users\\x\\AppData\\Roaming"));
        let d = h.describe_app("offshoot").unwrap();
        assert_eq!(d.manifest.app.id, "offshoot");
        assert_eq!(
            d.files.callback_log,
            Some(PathBuf::from("C:\\Users\\x\\AppData\\Roaming\\Hedge\\HedgeCallback.log"))
        );
        assert_eq!(d.files.presets_dir, Some(PathBuf::from("C:\\Users\\x\\AppData\\Roaming\\Hedge\\Presets")));
        assert!(matches!(h.describe_app("nope").unwrap_err(), crate::error::CoreError::AppNotFound(_)));
        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["status"]["scripting"], "registry");
    }
}
```

In `lib.rs`: add `pub mod hedge;` (alphabetical) and `pub use hedge::Hedge;`.

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core hedge::apps`
Expected: 5 tests FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

```rust
pub fn compare_versions(a: &str, b: &str) -> Ordering {
    fn parts(v: &str) -> Vec<u64> {
        v.trim()
            .split(|c: char| !(c.is_ascii_digit() || c == '.'))
            .next()
            .unwrap_or("")
            .split('.')
            .filter(|p| !p.is_empty())
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    }
    let (pa, pb) = (parts(a), parts(b));
    for i in 0..pa.len().max(pb.len()) {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        match x.cmp(&y) {
            Ordering::Equal => continue,
            other => return other,
        }
    }
    Ordering::Equal
}

impl Hedge {
    pub fn apps(&self) -> Result<Vec<AppStatus>> {
        Ok(self.catalog.apps().map(|m| self.status_of(m)).collect())
    }

    pub fn app_status(&self, id: &str) -> Result<AppStatus> {
        Ok(self.status_of(self.catalog.app(id)?))
    }

    pub fn describe_app(&self, id: &str) -> Result<AppDescription> {
        let manifest = self.catalog.app(id)?;
        let os = self.host.os();
        let files = manifest.files.get(os);
        let resolve = |t: Option<&String>| t.and_then(|t| self.expand(t).ok());
        Ok(AppDescription {
            status: self.status_of(manifest),
            manifest: manifest.clone(),
            files: ResolvedFiles {
                callback_log: resolve(files.and_then(|f| f.callback_log.as_ref())),
                event_log: resolve(files.and_then(|f| f.event_log.as_ref())),
                presets_dir: resolve(manifest.presets.get(os).map(|p| &p.dir)),
            },
        })
    }

    fn status_of(&self, m: &AppManifest) -> AppStatus {
        let os = self.host.os();
        let mut warnings = Vec::new();
        let (installed, version) = self.detect(m, os, &mut warnings);
        let scripting = match m.scripting.get(os) {
            Some(Scripting::Registry { .. }) => ScriptingSupport::Registry,
            Some(Scripting::HelperWorkspace { .. }) => ScriptingSupport::HelperWorkspace,
            Some(Scripting::Manual { .. }) => ScriptingSupport::Manual,
            None => ScriptingSupport::None,
        };
        let scripting_enabled = match (installed, m.scripting.get(os)) {
            (true, Some(Scripting::Registry { key, enable_value, .. })) => {
                match self.host.registry_read(key, enable_value) {
                    Ok(Some(RegValue::Dword(v))) => Some(v == 1),
                    Ok(_) => Some(false),
                    Err(e) => {
                        warnings.push(format!("cannot read {key}\\{enable_value}: {e}"));
                        None
                    }
                }
            }
            _ => None,
        };
        let newer_than_tested = version
            .as_deref()
            .is_some_and(|v| compare_versions(v, &m.tested_against) == Ordering::Greater);
        if newer_than_tested {
            warnings.push(format!(
                "{} {} is newer than the catalog was tested against ({}); attachment and command details may have changed",
                m.app.name,
                version.as_deref().unwrap_or_default(),
                m.tested_against
            ));
        }
        AppStatus {
            id: m.app.id.clone(),
            name: m.app.name.clone(),
            installed,
            version,
            tested_against: m.tested_against.clone(),
            newer_than_tested,
            requires_pro: m.app.requires_pro,
            scripting,
            scripting_enabled,
            warnings,
        }
    }

    fn detect(&self, m: &AppManifest, os: Os, warnings: &mut Vec<String>) -> (bool, Option<String>) {
        let Some(d) = m.detect.get(os) else {
            return (false, None);
        };
        match os {
            Os::Windows => {
                let Some(key) = &d.registry_key else {
                    return (false, None);
                };
                match self.host.registry_key_exists(key) {
                    Ok(true) => {}
                    Ok(false) => return (false, None),
                    Err(e) => {
                        warnings.push(format!("cannot read {key}: {e}"));
                        return (false, None);
                    }
                }
                let version = d.version_value.as_ref().and_then(|v| match self.host.registry_read(key, v) {
                    Ok(Some(RegValue::String(s))) => Some(s.trim().to_owned()),
                    _ => None,
                });
                (true, version)
            }
            Os::Macos => {
                let Some(app_path) = &d.app_path else {
                    return (false, None);
                };
                let path = match self.expand(app_path) {
                    Ok(p) => p,
                    Err(e) => {
                        warnings.push(e.to_string());
                        return (false, None);
                    }
                };
                match self.host.app_bundle(&path) {
                    Ok(Some(bundle)) => {
                        if let Some(expected) = &d.bundle_id {
                            if &bundle.id != expected {
                                warnings.push(format!(
                                    "{} has bundle id {} (expected {expected})",
                                    path.display(),
                                    bundle.id
                                ));
                                return (false, None);
                            }
                        }
                        (true, Some(bundle.version))
                    }
                    Ok(None) => (false, None),
                    Err(e) => {
                        warnings.push(e.to_string());
                        (false, None)
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core hedge::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): Hedge app detection, versions, and tested_against warnings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Attachment state, attach and detach plans, and `apply`

**Files:**
- Create: `crates/core/src/hedge/attach.rs`
- Modify: `crates/core/src/hedge/mod.rs`

**Interfaces:**
- Consumes: `Hedge` (Task 3), `Scripting`, `EventSpec`, `AppManifest` (Task 2), `RegValue` (Task 1), `Store::profiles_dir`, `fs_util::write_atomic`.
- Produces:
  - `Action` (serde tag `action`, snake_case, `Serialize + Deserialize`): `RegistrySet { key, value, data: RegValue }`, `RegistryDelete { key, value }`, `WorkspacePrefs { path: PathBuf, set: serde_json::Map<String, Value> }`, `WriteFile { path: PathBuf, contents: String }`, `OpenUrl { url }`.
  - `AttachState` (serde tag `state`, snake_case): `Attached { path, profile, script }`, `External { path }`, `Stale { path }`, `Staged { path, workspace }`, `Detached`, `Manual { note }`, `Unsupported`.
  - `EventAttachment { app, event, state }`.
  - `managed_script(&Store, &Path) -> Option<(String, String)>`.
  - `Hedge::attachments(app, &Store) -> Result<Vec<EventAttachment>>` (catalog event order), `Hedge::attachment(app, event, &Store)`, `Hedge::plan_attach(app, event, &Path) -> Result<Vec<Action>>`, `Hedge::plan_detach(app, event) -> Result<Vec<Action>>`, `Hedge::apply(&[Action]) -> Result<()>`.
- Behaviour: `registry` attach = `[RegistrySet enable_value = Dword(1), RegistrySet EventScript<registry_name> = String(path)]`; detach = `[RegistryDelete EventScript<registry_name>]`. `helper_workspace` attach = `[WorkspacePrefs { set: { enable_pref: true, pref_key: path } }]`; detach = `[WorkspacePrefs { set: { pref_key: "" } }]`; `apply` merges `set` into the first `setPreferences` object of the workspace file (creating `[{"setPreferences": {}}]` if missing) and preserves every other key. `manual` and missing scripting return `Unsupported` from plans, with the note and the script path in the message. An event without `registry_name` (Windows) or `pref_name` (macOS) is `Unsupported`.

- [ ] **Step 1: Write the module with failing tests**

`crates/core/src/hedge/attach.rs`:
```rust
//! Attaching scripts to Hedge app events, and reading what is attached now.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use super::Hedge;
use crate::catalog::{AppManifest, EventSpec, Scripting};
use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::host::RegValue;
use crate::store::Store;

/// One change HedgeBuddy would make outside its data directory. Plans return
/// lists of these; nothing happens until [`Hedge::apply`] runs them, so every
/// plan doubles as a dry run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    RegistrySet { key: String, value: String, data: RegValue },
    RegistryDelete { key: String, value: String },
    WorkspacePrefs { path: PathBuf, set: Map<String, Value> },
    WriteFile { path: PathBuf, contents: String },
    OpenUrl { url: String },
}

/// What an app event is attached to right now.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AttachState {
    /// A script in this HedgeBuddy data directory.
    Attached { path: PathBuf, profile: String, script: String },
    /// An existing file outside HedgeBuddy.
    External { path: PathBuf },
    /// A file that no longer exists.
    Stale { path: PathBuf },
    /// Written to the OffShoot Helper workspace; takes effect when the
    /// operator applies that workspace in OffShoot Helper (macOS).
    Staged { path: PathBuf, workspace: PathBuf },
    Detached,
    /// The operator attaches scripts in the app's own settings.
    Manual { note: String },
    /// No known attachment location for this event on this platform.
    Unsupported,
}

/// One event's attachment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventAttachment {
    pub app: String,
    pub event: String,
    pub state: AttachState,
}

/// `Some((profile, script))` when `path` is `<store>/profiles/<profile>/scripts/<script>`.
pub fn managed_script(store: &Store, path: &Path) -> Option<(String, String)> {
    let rel = path.strip_prefix(store.profiles_dir()).ok()?;
    let parts: Vec<&str> = rel
        .components()
        .map(|c| c.as_os_str().to_str())
        .collect::<Option<Vec<&str>>>()?;
    match parts.as_slice() {
        [profile, "scripts", script] => Some((profile.to_string(), script.to_string())),
        _ => None,
    }
}

fn classify(store: &Store, path: PathBuf) -> AttachState {
    if !path.is_file() {
        return AttachState::Stale { path };
    }
    match managed_script(store, &path) {
        Some((profile, script)) => AttachState::Attached { path, profile, script },
        None => AttachState::External { path },
    }
}

fn read_workspace(path: &Path) -> Result<Vec<Value>> {
    if !path.exists() {
        return Ok(vec![json!({ "setPreferences": {} })]);
    }
    let text = fs::read_to_string(path).map_err(|e| CoreError::io(path, e))?;
    match serde_json::from_str::<Value>(&text).map_err(|e| CoreError::Json { path: path.to_path_buf(), source: e })? {
        Value::Array(items) => Ok(items),
        _ => Err(CoreError::Validation(format!("{} is not a workspace (expected a JSON array)", path.display()))),
    }
}

fn workspace_prefs(doc: &[Value]) -> Option<&Map<String, Value>> {
    doc.iter().find_map(|v| v.get("setPreferences").and_then(Value::as_object))
}

fn merge_workspace(path: &Path, set: &Map<String, Value>) -> Result<()> {
    let mut doc = read_workspace(path)?;
    let index = match doc.iter().position(|v| v.get("setPreferences").is_some_and(Value::is_object)) {
        Some(i) => i,
        None => {
            doc.push(json!({ "setPreferences": {} }));
            doc.len() - 1
        }
    };
    let prefs = doc[index]
        .get_mut("setPreferences")
        .and_then(Value::as_object_mut)
        .expect("setPreferences is an object");
    for (k, v) in set {
        prefs.insert(k.clone(), v.clone());
    }
    let mut text = serde_json::to_string_pretty(&doc).expect("JSON values serialize");
    text.push('\n');
    fs_util::write_atomic(path, text.as_bytes(), false)
}

fn no_location(m: &AppManifest, e: &EventSpec) -> CoreError {
    CoreError::Unsupported(format!(
        "{} event {} has no known attachment location on this platform",
        m.app.name, e.id
    ))
}

impl Hedge {
    /// Attachment state of every event of `app`, in catalog order.
    pub fn attachments(&self, app: &str, store: &Store) -> Result<Vec<EventAttachment>> {
        todo!()
    }

    /// Attachment state of one event.
    pub fn attachment(&self, app: &str, event: &str, store: &Store) -> Result<EventAttachment> {
        todo!()
    }

    /// The actions that attach `script_path` to `app`'s `event`. Reads only.
    pub fn plan_attach(&self, app: &str, event: &str, script_path: &Path) -> Result<Vec<Action>> {
        todo!()
    }

    /// The actions that detach whatever is attached to `app`'s `event`. Reads only.
    pub fn plan_detach(&self, app: &str, event: &str) -> Result<Vec<Action>> {
        todo!()
    }

    /// Execute actions in order, stopping at the first failure.
    pub fn apply(&self, actions: &[Action]) -> Result<()> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::catalog::Catalog;
    use crate::host::{FakeHost, Os};

    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\"}\n---\n\"\"\"\n";
    const KEY: &str = "HKCU\\Software\\Hedge";

    fn setup(host: FakeHost) -> (tempfile::TempDir, Store, Arc<FakeHost>, Hedge) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        store.create_profile("p", "").unwrap();
        store.write_script("p", "copy.py", COPY).unwrap();
        let fake = Arc::new(host);
        let hedge = Hedge::new(fake.clone(), Catalog::embedded().unwrap());
        (dir, store, fake, hedge)
    }

    #[test]
    fn registry_attach_state_and_detach() {
        let (_d, store, fake, hedge) = setup(FakeHost::new(Os::Windows).with_registry_key(KEY));
        let path = store.script_path("p", "copy.py");
        let plan = hedge.plan_attach("offshoot", "FileCopyCompleted", &path).unwrap();
        assert_eq!(
            plan,
            vec![
                Action::RegistrySet { key: KEY.into(), value: "EventScriptAllowScripting".into(), data: RegValue::Dword(1) },
                Action::RegistrySet {
                    key: KEY.into(),
                    value: "EventScriptFileCopyCompleted".into(),
                    data: RegValue::String(path.display().to_string()),
                },
            ]
        );
        assert_eq!(fake.registry_value(KEY, "EventScriptFileCopyCompleted"), None, "planning must not write");
        hedge.apply(&plan).unwrap();
        assert_eq!(fake.registry_value(KEY, "EventScriptAllowScripting"), Some(RegValue::Dword(1)));
        assert_eq!(
            hedge.attachment("offshoot", "FileCopyCompleted", &store).unwrap().state,
            AttachState::Attached { path: path.clone(), profile: "p".into(), script: "copy.py".into() }
        );
        let detach = hedge.plan_detach("offshoot", "FileCopyCompleted").unwrap();
        assert_eq!(
            detach,
            vec![Action::RegistryDelete { key: KEY.into(), value: "EventScriptFileCopyCompleted".into() }]
        );
        hedge.apply(&detach).unwrap();
        assert_eq!(hedge.attachment("offshoot", "FileCopyCompleted", &store).unwrap().state, AttachState::Detached);
    }

    #[test]
    fn registry_states_stale_external_and_internal_names() {
        let outside = tempfile::tempdir().unwrap();
        let external = outside.path().join("mine.py");
        fs::write(&external, "print(1)\n").unwrap();
        let (_d, store, _fake, hedge) = setup(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "EventScriptDiskAdded", RegValue::String("E:\\gone\\x.py".into()))
                .with_registry_value(KEY, "EventScriptDiskIdle", RegValue::String(external.display().to_string()))
                .with_registry_value(KEY, "EventScriptDiskBusy", RegValue::String("  ".into())),
        );
        let managed = store.script_path("p", "copy.py");
        hedge
            .apply(&[Action::RegistrySet {
                key: KEY.into(),
                value: "EventScriptCheckpointIssue".into(),
                data: RegValue::String(managed.display().to_string()),
            }])
            .unwrap();
        let all = hedge.attachments("offshoot", &store).unwrap();
        assert_eq!(all.len(), 10);
        let state = |event: &str| all.iter().find(|a| a.event == event).unwrap().state.clone();
        assert_eq!(state("DiskAdded"), AttachState::Stale { path: PathBuf::from("E:\\gone\\x.py") });
        assert_eq!(state("DiskIdle"), AttachState::External { path: external.clone() });
        assert_eq!(state("DiskBusy"), AttachState::Detached);
        assert!(matches!(state("VerificationIssue"), AttachState::Attached { .. }));
        assert_eq!(state("SourceAdded"), AttachState::Unsupported);
        assert_eq!(state("OffShootStarted"), AttachState::Detached);
    }

    #[test]
    fn unsupported_manual_and_missing_script() {
        let (_d, store, _fake, hedge) = setup(FakeHost::new(Os::Windows));
        let path = store.script_path("p", "copy.py");
        assert!(matches!(
            hedge.plan_attach("offshoot", "SourceAdded", &path).unwrap_err(),
            CoreError::Unsupported(_)
        ));
        assert!(matches!(
            hedge.plan_attach("offshoot", "DiskAdded", &store.script_path("p", "missing.py")).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(hedge.plan_attach("offshoot", "Nope", &path).unwrap_err(), CoreError::EventNotFound { .. }));
        let manual = hedge.plan_attach("editready", "FileConversionCompleted", &path).unwrap_err();
        assert!(
            matches!(&manual, CoreError::Unsupported(m) if m.contains("Scripting settings") && m.contains("copy.py")),
            "{manual}"
        );
        assert!(matches!(
            hedge.attachment("editready", "FileConversionCompleted", &store).unwrap().state,
            AttachState::Manual { .. }
        ));
        assert!(hedge.attachments("canister", &store).unwrap().is_empty());
    }

    #[test]
    fn macos_helper_workspace_is_merged_and_staged() {
        let home = tempfile::tempdir().unwrap();
        let (_d, store, _fake, hedge) = setup(FakeHost::new(Os::Macos).with_home(home.path()));
        let workspace = home.path().join("Library/Preferences/Hedge/Workspaces/HedgeBuddy.json");
        fs::create_dir_all(workspace.parent().unwrap()).unwrap();
        fs::write(
            &workspace,
            r#"[{"setSources": ["/Volumes/X"], "setPreferences": {"transfers_verification_mode": "source"}}]"#,
        )
        .unwrap();
        let path = store.script_path("p", "copy.py");
        let plan = hedge.plan_attach("offshoot", "FileCopyCompleted", &path).unwrap();
        let mut set = Map::new();
        set.insert("scripting_opt_in".into(), Value::Bool(true));
        set.insert("scripting_events_file_copy_completed".into(), Value::String(path.display().to_string()));
        assert_eq!(plan, vec![Action::WorkspacePrefs { path: workspace.clone(), set }]);
        hedge.apply(&plan).unwrap();
        let doc: Value = serde_json::from_str(&fs::read_to_string(&workspace).unwrap()).unwrap();
        assert_eq!(doc[0]["setSources"], json!(["/Volumes/X"]));
        assert_eq!(doc[0]["setPreferences"]["transfers_verification_mode"], "source");
        assert_eq!(doc[0]["setPreferences"]["scripting_opt_in"], true);
        assert_eq!(
            hedge.attachment("offshoot", "FileCopyCompleted", &store).unwrap().state,
            AttachState::Staged { path: path.clone(), workspace: workspace.clone() }
        );
        assert_eq!(hedge.attachment("offshoot", "TransfersAdded", &store).unwrap().state, AttachState::Unsupported);
        hedge.apply(&hedge.plan_detach("offshoot", "FileCopyCompleted").unwrap()).unwrap();
        assert_eq!(hedge.attachment("offshoot", "FileCopyCompleted", &store).unwrap().state, AttachState::Detached);
        assert!(matches!(
            hedge.attachment("foolcat", "ReportCreated", &store).unwrap().state,
            AttachState::Manual { .. }
        ));
    }

    #[test]
    fn workspace_is_created_when_missing() {
        let home = tempfile::tempdir().unwrap();
        let (_d, store, _fake, hedge) = setup(FakeHost::new(Os::Macos).with_home(home.path()));
        hedge
            .apply(&hedge.plan_attach("offshoot", "DiskAdded", &store.script_path("p", "copy.py")).unwrap())
            .unwrap();
        let workspace = home.path().join("Library/Preferences/Hedge/Workspaces/HedgeBuddy.json");
        let doc: Value = serde_json::from_str(&fs::read_to_string(workspace).unwrap()).unwrap();
        assert_eq!(doc.as_array().unwrap().len(), 1);
        assert!(doc[0]["setPreferences"]["scripting_events_disk_added"].is_string());
    }

    #[test]
    fn managed_script_paths() {
        let store = Store::open("/data/HedgeBuddy");
        assert_eq!(
            managed_script(&store, &store.script_path("p", "a.py")),
            Some(("p".to_string(), "a.py".to_string()))
        );
        assert_eq!(managed_script(&store, Path::new("/elsewhere/a.py")), None);
        assert_eq!(managed_script(&store, &store.profile_dir("p").join("profile.json")), None);
    }

    #[test]
    fn actions_serialize_with_a_tag() {
        let a = Action::OpenUrl { url: "offshoot://open".into() };
        assert_eq!(serde_json::to_value(&a).unwrap(), json!({"action": "open_url", "url": "offshoot://open"}));
        let s = AttachState::Stale { path: PathBuf::from("x") };
        assert_eq!(serde_json::to_value(&s).unwrap(), json!({"state": "stale", "path": "x"}));
    }
}
```

In `hedge/mod.rs`, add `mod attach;` and `pub use attach::{managed_script, Action, AttachState, EventAttachment};`.

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core hedge::attach`
Expected: `managed_script_paths` and `actions_serialize_with_a_tag` pass; the other 5 FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

```rust
impl Hedge {
    pub fn attachments(&self, app: &str, store: &Store) -> Result<Vec<EventAttachment>> {
        let m = self.catalog.app(app)?;
        m.events
            .iter()
            .map(|e| {
                Ok(EventAttachment {
                    app: m.app.id.clone(),
                    event: e.id.clone(),
                    state: self.state_of(m, e, store)?,
                })
            })
            .collect()
    }

    pub fn attachment(&self, app: &str, event: &str, store: &Store) -> Result<EventAttachment> {
        let m = self.catalog.app(app)?;
        let e = m.event(event)?;
        Ok(EventAttachment {
            app: m.app.id.clone(),
            event: e.id.clone(),
            state: self.state_of(m, e, store)?,
        })
    }

    fn state_of(&self, m: &AppManifest, e: &EventSpec, store: &Store) -> Result<AttachState> {
        match m.scripting.get(self.host.os()) {
            None => Ok(AttachState::Unsupported),
            Some(Scripting::Manual { note }) => Ok(AttachState::Manual { note: note.clone() }),
            Some(Scripting::Registry { key, value_pattern, .. }) => {
                let Some(name) = &e.registry_name else {
                    return Ok(AttachState::Unsupported);
                };
                let value = value_pattern.replace("{registry_name}", name);
                match self.host.registry_read(key, &value)? {
                    Some(RegValue::String(s)) if !s.trim().is_empty() => Ok(classify(store, PathBuf::from(s.trim()))),
                    _ => Ok(AttachState::Detached),
                }
            }
            Some(Scripting::HelperWorkspace { workspace_dir, workspace_file, pref_pattern, .. }) => {
                let Some(name) = &e.pref_name else {
                    return Ok(AttachState::Unsupported);
                };
                let workspace = self.expand(workspace_dir)?.join(workspace_file);
                let key = pref_pattern.replace("{pref_name}", name);
                let doc = read_workspace(&workspace)?;
                match workspace_prefs(&doc).and_then(|p| p.get(&key)).and_then(Value::as_str) {
                    Some(s) if !s.is_empty() => Ok(AttachState::Staged { path: PathBuf::from(s), workspace }),
                    _ => Ok(AttachState::Detached),
                }
            }
        }
    }

    pub fn plan_attach(&self, app: &str, event: &str, script_path: &Path) -> Result<Vec<Action>> {
        let m = self.catalog.app(app)?;
        let e = m.event(event)?;
        let target = script_path.display().to_string();
        match m.scripting.get(self.host.os()) {
            None => {
                return Err(CoreError::Unsupported(format!(
                    "{} has no script attachment on this platform",
                    m.app.name
                )))
            }
            Some(Scripting::Manual { note }) => {
                return Err(CoreError::Unsupported(format!(
                    "{} scripts are attached by hand on this platform: {note}. Script to attach: {target}",
                    m.app.name
                )))
            }
            _ => {}
        }
        if !script_path.is_file() {
            return Err(CoreError::Validation(format!("script {target} does not exist")));
        }
        match m.scripting.get(self.host.os()) {
            Some(Scripting::Registry { key, enable_value, value_pattern }) => {
                let name = e.registry_name.as_ref().ok_or_else(|| no_location(m, e))?;
                Ok(vec![
                    Action::RegistrySet { key: key.clone(), value: enable_value.clone(), data: RegValue::Dword(1) },
                    Action::RegistrySet {
                        key: key.clone(),
                        value: value_pattern.replace("{registry_name}", name),
                        data: RegValue::String(target),
                    },
                ])
            }
            Some(Scripting::HelperWorkspace { workspace_dir, workspace_file, enable_pref, pref_pattern }) => {
                let name = e.pref_name.as_ref().ok_or_else(|| no_location(m, e))?;
                let mut set = Map::new();
                set.insert(enable_pref.clone(), Value::Bool(true));
                set.insert(pref_pattern.replace("{pref_name}", name), Value::String(target));
                Ok(vec![Action::WorkspacePrefs { path: self.expand(workspace_dir)?.join(workspace_file), set }])
            }
            _ => unreachable!("manual and missing scripting returned above"),
        }
    }

    pub fn plan_detach(&self, app: &str, event: &str) -> Result<Vec<Action>> {
        let m = self.catalog.app(app)?;
        let e = m.event(event)?;
        match m.scripting.get(self.host.os()) {
            Some(Scripting::Registry { key, value_pattern, .. }) => {
                let name = e.registry_name.as_ref().ok_or_else(|| no_location(m, e))?;
                Ok(vec![Action::RegistryDelete {
                    key: key.clone(),
                    value: value_pattern.replace("{registry_name}", name),
                }])
            }
            Some(Scripting::HelperWorkspace { workspace_dir, workspace_file, pref_pattern, .. }) => {
                let name = e.pref_name.as_ref().ok_or_else(|| no_location(m, e))?;
                let mut set = Map::new();
                set.insert(pref_pattern.replace("{pref_name}", name), Value::String(String::new()));
                Ok(vec![Action::WorkspacePrefs { path: self.expand(workspace_dir)?.join(workspace_file), set }])
            }
            Some(Scripting::Manual { note }) => Err(CoreError::Unsupported(format!(
                "{} scripts are detached by hand on this platform: {note}",
                m.app.name
            ))),
            None => Err(CoreError::Unsupported(format!(
                "{} has no script attachment on this platform",
                m.app.name
            ))),
        }
    }

    pub fn apply(&self, actions: &[Action]) -> Result<()> {
        for action in actions {
            match action {
                Action::RegistrySet { key, value, data } => self.host.registry_write(key, value, data)?,
                Action::RegistryDelete { key, value } => self.host.registry_delete(key, value)?,
                Action::WorkspacePrefs { path, set } => merge_workspace(path, set)?,
                Action::WriteFile { path, contents } => fs_util::write_atomic(path, contents.as_bytes(), false)?,
                Action::OpenUrl { url } => self.host.open_url(url)?,
            }
        }
        Ok(())
    }
}
```

`fs_util` is `pub(crate)`; `crate::fs_util::write_atomic` is reachable from `hedge`.

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core hedge::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 7 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): script attachment state, attach/detach plans, and apply

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Attaching a profile's scripts: `attach_script`, `detach_event`, `sync_attachments`

**Files:**
- Create: `crates/core/src/hedge/sync.rs`
- Modify: `crates/core/src/hedge/mod.rs`

**Interfaces:**
- Consumes: `Hedge::{attachment, plan_attach, plan_detach, apply}`, `managed_script`, `Action`, `AttachState` (Task 4); `Store::{check_script, list_scripts, load_profile, script_path}`; `check_requirements`, `RequirementIssue`, `Manifest`.
- Produces:
  - `validate_manifest(&Catalog, &Manifest) -> Result<()>` (`AppNotFound` / `EventNotFound`).
  - `SyncItem { app, event, script }`, `SyncConflict { app, event, scripts: Vec<String> }`, `SyncSkip { script, reason }`, `SyncReport { profile, attach: Vec<SyncItem>, detach: Vec<SyncItem>, conflicts: Vec<SyncConflict>, skipped: Vec<SyncSkip>, actions: Vec<Action>, applied: bool }` (all Serialize).
  - `Hedge::attach_script(&Store, profile, script, dry_run) -> Result<Vec<Action>>`, `Hedge::detach_event(app, event, dry_run) -> Result<Vec<Action>>`, `Hedge::sync_attachments(&Store, profile, dry_run) -> Result<SyncReport>`.
- Rules for `sync_attachments(profile)`:
  1. Every script of the profile whose manifest names an app and event is a candidate. A manifest error, an app/event not in the catalog, or unmet requirements puts the script in `skipped` with the reason. Scripts without an app/event are ignored.
  2. Two or more candidates for the same app+event are a `conflict`: none of them is attached.
  3. A single candidate is attached unless the event is already `Attached`/`Staged` to that same profile and script. An `Unsupported` plan puts it in `skipped`.
  4. Every catalog event not claimed by rule 1–2 (a pair is claimed when at least one candidate targets it, including conflicts) whose current `Attached`, `Staged`, or `Stale` path is a HedgeBuddy-managed script (any profile) is detached. `detach` items name the script as `<profile>/<script>`. External attachments are never touched.
  5. Actions are the attach actions (in app, event order) then the detach actions, with exact duplicates removed. `dry_run = false` applies them and sets `applied`.

- [ ] **Step 1: Write the module with failing tests**

`crates/core/src/hedge/sync.rs`:
```rust
//! Attaching a profile's scripts to Hedge app events.

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

use super::{managed_script, Action, AttachState, Hedge};
use crate::catalog::Catalog;
use crate::error::{CoreError, Result};
use crate::manifest::{check_requirements, Manifest, RequirementIssue};
use crate::store::Store;

/// Check that a script manifest's `app` and `event` exist in the catalog.
pub fn validate_manifest(catalog: &Catalog, manifest: &Manifest) -> Result<()> {
    if let Some(app) = &manifest.app {
        let m = catalog.app(app)?;
        if let Some(event) = &manifest.event {
            m.event(event)?;
        }
    }
    Ok(())
}

/// A script attached to (or detached from) an app event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyncItem {
    pub app: String,
    pub event: String,
    pub script: String,
}

/// Several scripts of one profile target the same app event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyncConflict {
    pub app: String,
    pub event: String,
    pub scripts: Vec<String>,
}

/// A script that could not be attached, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyncSkip {
    pub script: String,
    pub reason: String,
}

/// Result of [`Hedge::sync_attachments`].
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SyncReport {
    pub profile: String,
    pub attach: Vec<SyncItem>,
    pub detach: Vec<SyncItem>,
    pub conflicts: Vec<SyncConflict>,
    pub skipped: Vec<SyncSkip>,
    pub actions: Vec<Action>,
    pub applied: bool,
}

fn describe_issues(issues: &[RequirementIssue]) -> String {
    issues
        .iter()
        .map(|i| match i {
            RequirementIssue::Missing { name, ty } => format!("{name} ({} missing)", ty.as_str()),
            RequirementIssue::TypeMismatch { name, expected, actual } => {
                format!("{name} (is {}, needs {})", actual.as_str(), expected.as_str())
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

impl Hedge {
    /// Attach one script to the app event its manifest names. Refuses scripts
    /// without an app/event, unknown to the catalog, or with unmet
    /// requirements. With `dry_run` the actions are returned but not applied.
    pub fn attach_script(&self, store: &Store, profile: &str, script: &str, dry_run: bool) -> Result<Vec<Action>> {
        todo!()
    }

    /// Detach whatever is attached to an app event.
    pub fn detach_event(&self, app: &str, event: &str, dry_run: bool) -> Result<Vec<Action>> {
        todo!()
    }

    /// Make Hedge app attachments reflect `profile` (rules in the plan and
    /// the module docs of [`SyncReport`]).
    pub fn sync_attachments(&self, store: &Store, profile: &str, dry_run: bool) -> Result<SyncReport> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;

    use super::*;
    use crate::host::{FakeHost, Os, RegValue};
    use crate::secrets::VariableInput;
    use crate::variable::VarType;

    const KEY: &str = "HKCU\\Software\\Hedge";

    fn script(event: &str, requires: &str) -> String {
        format!(
            "\"\"\"\n{{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"{event}\", \"requires\": {{{requires}}}}}\n---\n\"\"\"\n"
        )
    }

    fn setup() -> (tempfile::TempDir, Store, Arc<FakeHost>, Hedge) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        let fake = Arc::new(FakeHost::new(Os::Windows).with_registry_key(KEY));
        let hedge = Hedge::new(fake.clone(), Catalog::embedded().unwrap());
        (dir, store, fake, hedge)
    }

    fn reg(fake: &FakeHost, value: &str) -> Option<String> {
        match fake.registry_value(KEY, value) {
            Some(RegValue::String(s)) => Some(s),
            _ => None,
        }
    }

    #[test]
    fn validate_manifest_checks_the_catalog() {
        let catalog = Catalog::embedded().unwrap();
        let m = |app: Option<&str>, event: Option<&str>| Manifest {
            hedgebuddy: 1,
            app: app.map(str::to_owned),
            event: event.map(str::to_owned),
            requires: Default::default(),
        };
        validate_manifest(&catalog, &m(None, None)).unwrap();
        validate_manifest(&catalog, &m(Some("offshoot"), Some("DiskAdded"))).unwrap();
        assert!(matches!(validate_manifest(&catalog, &m(Some("postlab"), None)).unwrap_err(), CoreError::AppNotFound(_)));
        assert!(matches!(
            validate_manifest(&catalog, &m(Some("offshoot"), Some("Nope"))).unwrap_err(),
            CoreError::EventNotFound { .. }
        ));
    }

    #[test]
    fn attach_script_enforces_manifest_and_requirements() {
        let (_d, store, fake, hedge) = setup();
        store.create_profile("p", "").unwrap();
        store
            .write_script("p", "copy.py", &script("FileCopyCompleted", "\"SLACK_WEBHOOK\": {\"type\": \"secret\"}"))
            .unwrap();
        store.write_script("p", "plain.py", "print('x')\n").unwrap();
        store
            .write_script("p", "noevent.py", "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\"}\n---\n\"\"\"\n")
            .unwrap();

        let unmet = hedge.attach_script(&store, "p", "copy.py", false).unwrap_err();
        assert!(matches!(&unmet, CoreError::Validation(m) if m.contains("SLACK_WEBHOOK")), "{unmet}");
        assert!(matches!(hedge.attach_script(&store, "p", "plain.py", false).unwrap_err(), CoreError::Validation(_)));
        assert!(matches!(hedge.attach_script(&store, "p", "noevent.py", false).unwrap_err(), CoreError::Validation(_)));

        store
            .set_variable(
                "p",
                "SLACK_WEBHOOK",
                VariableInput { ty: VarType::Secret, value: Some(json!("https://h")), description: String::new() },
            )
            .unwrap();
        let actions = hedge.attach_script(&store, "p", "copy.py", true).unwrap();
        assert_eq!(actions.len(), 2);
        assert_eq!(reg(&fake, "EventScriptFileCopyCompleted"), None, "dry run must not write");
        hedge.attach_script(&store, "p", "copy.py", false).unwrap();
        assert_eq!(
            reg(&fake, "EventScriptFileCopyCompleted"),
            Some(store.script_path("p", "copy.py").display().to_string())
        );
        hedge.detach_event("offshoot", "FileCopyCompleted", true).unwrap();
        assert!(reg(&fake, "EventScriptFileCopyCompleted").is_some(), "dry run must not delete");
        hedge.detach_event("offshoot", "FileCopyCompleted", false).unwrap();
        assert_eq!(reg(&fake, "EventScriptFileCopyCompleted"), None);
    }

    #[test]
    fn sync_attaches_this_profile_and_detaches_others() {
        let (_d, store, fake, hedge) = setup();
        store.create_profile("q", "").unwrap();
        store.write_script("q", "q_copy.py", &script("FileCopyCompleted", "")).unwrap();
        store.write_script("q", "q_busy.py", &script("DiskBusy", "")).unwrap();
        hedge.attach_script(&store, "q", "q_copy.py", false).unwrap();
        hedge.attach_script(&store, "q", "q_busy.py", false).unwrap();

        store.create_profile("p", "").unwrap();
        store.write_script("p", "copy.py", &script("FileCopyCompleted", "")).unwrap();
        store
            .write_script("p", "disk.py", &script("DiskAdded", "\"NOTIFY\": {\"type\": \"bool\", \"default\": true}"))
            .unwrap();
        store.write_script("p", "dup1.py", &script("DiskIdle", "")).unwrap();
        store.write_script("p", "dup2.py", &script("DiskIdle", "")).unwrap();
        store.write_script("p", "bad.py", &script("Nope", "")).unwrap();
        store.write_script("p", "plain.py", "print('x')\n").unwrap();

        let before_busy = reg(&fake, "EventScriptDiskBusy");
        let dry = hedge.sync_attachments(&store, "p", true).unwrap();
        let item = |event: &str, script: &str| SyncItem { app: "offshoot".into(), event: event.into(), script: script.into() };
        assert_eq!(dry.profile, "p");
        assert_eq!(dry.attach, vec![item("DiskAdded", "disk.py"), item("FileCopyCompleted", "copy.py")]);
        assert_eq!(dry.detach, vec![item("DiskBusy", "q/q_busy.py")]);
        assert_eq!(
            dry.conflicts,
            vec![SyncConflict {
                app: "offshoot".into(),
                event: "DiskIdle".into(),
                scripts: vec!["dup1.py".into(), "dup2.py".into()]
            }]
        );
        assert_eq!(dry.skipped.len(), 1);
        assert_eq!(dry.skipped[0].script, "bad.py");
        assert!(dry.skipped[0].reason.contains("Nope"));
        assert_eq!(dry.actions.len(), 4, "{:#?}", dry.actions);
        assert!(!dry.applied);
        assert_eq!(reg(&fake, "EventScriptDiskBusy"), before_busy, "dry run must not write");

        let real = hedge.sync_attachments(&store, "p", false).unwrap();
        assert!(real.applied);
        assert_eq!(
            reg(&fake, "EventScriptFileCopyCompleted"),
            Some(store.script_path("p", "copy.py").display().to_string())
        );
        assert_eq!(reg(&fake, "EventScriptDiskAdded"), Some(store.script_path("p", "disk.py").display().to_string()));
        assert_eq!(reg(&fake, "EventScriptDiskBusy"), None);
        assert_eq!(reg(&fake, "EventScriptDiskIdle"), None);

        let again = hedge.sync_attachments(&store, "p", false).unwrap();
        assert!(again.attach.is_empty() && again.detach.is_empty() && again.actions.is_empty(), "{again:#?}");
    }

    #[test]
    fn sync_skips_unmet_requirements_and_leaves_external_alone() {
        let (_d, store, fake, hedge) = setup();
        let outside = tempfile::tempdir().unwrap();
        let external = outside.path().join("mine.py");
        std::fs::write(&external, "print(1)\n").unwrap();
        hedge
            .apply(&[Action::RegistrySet {
                key: KEY.into(),
                value: "EventScriptDiskRemoved".into(),
                data: RegValue::String(external.display().to_string()),
            }])
            .unwrap();
        store.create_profile("p", "").unwrap();
        store
            .write_script("p", "needs.py", &script("DiskAdded", "\"TOKEN\": {\"type\": \"secret\"}"))
            .unwrap();
        let report = hedge.sync_attachments(&store, "p", false).unwrap();
        assert!(report.attach.is_empty());
        assert_eq!(report.skipped.len(), 1);
        assert!(report.skipped[0].reason.contains("TOKEN"));
        assert!(report.detach.is_empty());
        assert_eq!(reg(&fake, "EventScriptDiskRemoved"), Some(external.display().to_string()));
        assert!(matches!(hedge.sync_attachments(&store, "ghost", true).unwrap_err(), CoreError::ProfileNotFound(_)));
    }
}
```

In `hedge/mod.rs`, add `mod sync;` and `pub use sync::{validate_manifest, SyncConflict, SyncItem, SyncReport, SyncSkip};`.

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core hedge::sync`
Expected: `validate_manifest_checks_the_catalog` passes; the other 3 FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

```rust
impl Hedge {
    pub fn attach_script(&self, store: &Store, profile: &str, script: &str, dry_run: bool) -> Result<Vec<Action>> {
        let check = store.check_script(profile, script)?;
        let manifest = check.manifest.ok_or_else(|| {
            CoreError::Validation(format!("{script} has no manifest; add one naming the app and event"))
        })?;
        let (Some(app), Some(event)) = (manifest.app.as_deref(), manifest.event.as_deref()) else {
            return Err(CoreError::Validation(format!("{script}'s manifest does not name an app and an event")));
        };
        validate_manifest(&self.catalog, &manifest)?;
        if !check.issues.is_empty() {
            return Err(CoreError::Validation(format!(
                "{script} has unmet requirements: {}",
                describe_issues(&check.issues)
            )));
        }
        let actions = self.plan_attach(app, event, &store.script_path(profile, script))?;
        if !dry_run {
            self.apply(&actions)?;
        }
        Ok(actions)
    }

    pub fn detach_event(&self, app: &str, event: &str, dry_run: bool) -> Result<Vec<Action>> {
        let actions = self.plan_detach(app, event)?;
        if !dry_run {
            self.apply(&actions)?;
        }
        Ok(actions)
    }

    pub fn sync_attachments(&self, store: &Store, profile: &str, dry_run: bool) -> Result<SyncReport> {
        let scripts = store.list_scripts(profile)?;
        let profile_data = store.load_profile(profile)?;
        let mut report = SyncReport {
            profile: profile.to_owned(),
            attach: Vec::new(),
            detach: Vec::new(),
            conflicts: Vec::new(),
            skipped: Vec::new(),
            actions: Vec::new(),
            applied: false,
        };
        let mut push = |actions: &mut Vec<Action>, new: Vec<Action>| {
            for a in new {
                if !actions.contains(&a) {
                    actions.push(a);
                }
            }
        };

        let mut targets: BTreeMap<(String, String), Vec<String>> = BTreeMap::new();
        for info in scripts {
            if let Some(reason) = info.manifest_error {
                report.skipped.push(SyncSkip { script: info.name, reason });
                continue;
            }
            let Some(manifest) = info.manifest else { continue };
            let (Some(app), Some(event)) = (manifest.app.clone(), manifest.event.clone()) else {
                continue;
            };
            if let Err(e) = validate_manifest(&self.catalog, &manifest) {
                report.skipped.push(SyncSkip { script: info.name, reason: e.to_string() });
                continue;
            }
            let issues = check_requirements(&manifest, &profile_data);
            if !issues.is_empty() {
                report.skipped.push(SyncSkip {
                    script: info.name,
                    reason: format!("unmet requirements: {}", describe_issues(&issues)),
                });
                continue;
            }
            targets.entry((app, event)).or_default().push(info.name);
        }

        for ((app, event), names) in &targets {
            if names.len() > 1 {
                report.conflicts.push(SyncConflict { app: app.clone(), event: event.clone(), scripts: names.clone() });
                continue;
            }
            let script = &names[0];
            let current = self.attachment(app, event, store)?.state;
            let already = match &current {
                AttachState::Attached { path, .. } | AttachState::Staged { path, .. } => {
                    managed_script(store, path) == Some((profile.to_owned(), script.clone()))
                }
                _ => false,
            };
            if already {
                continue;
            }
            match self.plan_attach(app, event, &store.script_path(profile, script)) {
                Ok(actions) => {
                    push(&mut report.actions, actions);
                    report.attach.push(SyncItem { app: app.clone(), event: event.clone(), script: script.clone() });
                }
                Err(CoreError::Unsupported(reason)) => {
                    report.skipped.push(SyncSkip { script: script.clone(), reason });
                }
                Err(e) => return Err(e),
            }
        }

        let claimed: BTreeSet<&(String, String)> = targets.keys().collect();
        for m in self.catalog.apps() {
            for e in &m.events {
                if claimed.contains(&(m.app.id.clone(), e.id.clone())) {
                    continue;
                }
                let path = match self.attachment(&m.app.id, &e.id, store)?.state {
                    AttachState::Attached { path, .. } | AttachState::Staged { path, .. } | AttachState::Stale { path } => {
                        path
                    }
                    _ => continue,
                };
                let Some((other_profile, other_script)) = managed_script(store, &path) else {
                    continue;
                };
                push(&mut report.actions, self.plan_detach(&m.app.id, &e.id)?);
                report.detach.push(SyncItem {
                    app: m.app.id.clone(),
                    event: e.id.clone(),
                    script: format!("{other_profile}/{other_script}"),
                });
            }
        }

        if !dry_run {
            self.apply(&report.actions)?;
            report.applied = true;
        }
        Ok(report)
    }
}
```

A `Stale` path points at a file that no longer exists; `managed_script` still recognises it by its location, so a deleted HedgeBuddy script is detached by the next sync.

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core hedge::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 4 new tests pass. If clippy flags the `push` closure (`needless_pass_by_ref_mut` or similar), turn it into a private free function `fn push_unique(actions: &mut Vec<Action>, new: Vec<Action>)`.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): attach_script, detach_event, and profile-wide sync_attachments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: URL-scheme commands

**Files:**
- Create: `crates/core/src/hedge/commands.rs`
- Modify: `crates/core/src/hedge/mod.rs`

**Interfaces:**
- Consumes: `Hedge`, `CommandSpec`, `CommandForm`, `ParamSpec`, `ParamType` (Task 2), `Host::open_url` (Task 1).
- Produces:
  - `CommandCall { command: String, params: serde_json::Map<String, Value> }` (Serialize + Deserialize, `params` defaults to empty).
  - `CommandPlan { app, urls: Vec<String>, confirm: Vec<String> }` (Serialize).
  - `CommandOutcome { plan: CommandPlan, responses: Vec<String> }` (Serialize).
  - `percent_encode(&str) -> String` (RFC 3986 unreserved characters kept, everything else `%XX` of its UTF-8 bytes).
  - `Hedge::plan_commands(app, &[CommandCall]) -> Result<CommandPlan>`, `Hedge::run_commands(app, &[CommandCall], Duration) -> Result<CommandOutcome>`.
- Behaviour: `url` form → `scheme://id` plus `?k=v&...` for the given params in parameter-name order; string/path values raw, `path[]` joined with `list_separator` if set else compact JSON, int/bool/json as compact JSON; every value percent-encoded. Consecutive `action` form calls are batched into one `scheme://actions?json=<percent-encoded compact JSON array of {id: params}>`; a `url` call flushes the batch first, so order is preserved. Validation: unknown command → `CommandNotFound`; command not available on this OS → `Unsupported`; empty call list, unknown param, missing required param, or wrong type → `Validation`. `confirm` lists the ids of calls whose command has `confirm = true`, in call order. `run_commands` records the callback log's length, opens every URL in order, and, if `wait` is non-zero and the app has a callback log on this OS, polls every 100 ms until the file changes or `wait` elapses, then returns the new non-empty lines.

- [ ] **Step 1: Write the module with failing tests**

`crates/core/src/hedge/commands.rs`:
```rust
//! Hedge app URL-scheme commands (`offshoot://...`).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::Hedge;
use crate::catalog::{CommandForm, ParamSpec, ParamType};
use crate::error::{CoreError, Result};

/// One command to run, with its parameters as JSON values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandCall {
    pub command: String,
    #[serde(default)]
    pub params: Map<String, Value>,
}

/// The URLs a list of commands turns into, and which commands the operator
/// should confirm first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandPlan {
    pub app: String,
    pub urls: Vec<String>,
    pub confirm: Vec<String>,
}

/// What happened when the URLs were opened.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandOutcome {
    pub plan: CommandPlan,
    pub responses: Vec<String>,
}

/// Percent-encode everything except RFC 3986 unreserved characters.
pub fn percent_encode(s: &str) -> String {
    todo!()
}

impl Hedge {
    /// Validate `calls` against the catalog and build their URLs. Reads only.
    pub fn plan_commands(&self, app: &str, calls: &[CommandCall]) -> Result<CommandPlan> {
        todo!()
    }

    /// Open the URLs of `calls` in order, then wait up to `wait` for the
    /// app's callback log to record a response.
    pub fn run_commands(&self, app: &str, calls: &[CommandCall], wait: Duration) -> Result<CommandOutcome> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;

    use super::*;
    use crate::catalog::Catalog;
    use crate::host::{FakeHost, Os};

    fn call(command: &str, params: Value) -> CommandCall {
        CommandCall { command: command.into(), params: params.as_object().cloned().unwrap_or_default() }
    }

    fn decode(s: &str) -> String {
        let bytes = s.as_bytes();
        let mut out = Vec::new();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' {
                out.push(u8::from_str_radix(&s[i + 1..i + 3], 16).unwrap());
                i += 3;
            } else {
                out.push(bytes[i]);
                i += 1;
            }
        }
        String::from_utf8(out).unwrap()
    }

    fn hedge(host: FakeHost) -> (Arc<FakeHost>, Hedge) {
        let fake = Arc::new(host);
        (fake.clone(), Hedge::new(fake, Catalog::embedded().unwrap()))
    }

    #[test]
    fn percent_encoding() {
        assert_eq!(percent_encode("aZ09-_.~"), "aZ09-_.~");
        assert_eq!(percent_encode("a b/ü|"), "a%20b%2F%C3%BC%7C");
    }

    #[test]
    fn action_commands_are_batched() {
        let (_f, h) = hedge(FakeHost::new(Os::Windows));
        let plan = h
            .plan_commands(
                "offshoot",
                &[
                    call("setSource", json!({"paths": ["/Volumes/A003"], "label": "A003"})),
                    call("setDestination", json!({"path": "/Volumes/RAID1"})),
                    call("setDestination", json!({"path": "/Volumes/RAID2"})),
                ],
            )
            .unwrap();
        assert_eq!(plan.urls.len(), 1);
        let prefix = "offshoot://actions?json=";
        assert!(plan.urls[0].starts_with(prefix), "{}", plan.urls[0]);
        let decoded: Value = serde_json::from_str(&decode(&plan.urls[0][prefix.len()..])).unwrap();
        assert_eq!(
            decoded,
            json!([
                {"setSource": {"label": "A003", "paths": ["/Volumes/A003"]}},
                {"setDestination": {"path": "/Volumes/RAID1"}},
                {"setDestination": {"path": "/Volumes/RAID2"}}
            ])
        );
        assert!(plan.confirm.is_empty());
    }

    #[test]
    fn url_commands_flush_batches_and_keep_order() {
        let (_f, h) = hedge(FakeHost::new(Os::Windows));
        let plan = h
            .plan_commands(
                "offshoot",
                &[
                    call("reset", json!({"type": "destinations"})),
                    call("setSource", json!({"paths": ["/Volumes/A003"]})),
                    call("addTransfers", json!({})),
                ],
            )
            .unwrap();
        assert_eq!(plan.urls.len(), 3);
        assert_eq!(plan.urls[0], "offshoot://reset?type=destinations");
        assert!(plan.urls[1].starts_with("offshoot://actions?json="));
        assert_eq!(plan.urls[2], "offshoot://addTransfers");
        assert_eq!(plan.confirm, vec!["reset", "addTransfers"]);
    }

    #[test]
    fn list_separator_and_query_encoding() {
        let (_f, h) = hedge(FakeHost::new(Os::Macos));
        let plan = h
            .plan_commands("canister", &[call("addarchive", json!({"sources": ["/A", "/B"], "destinationtape": "T 1"}))])
            .unwrap();
        assert_eq!(plan.urls, vec!["canister://addarchive?destinationtape=T%201&sources=%2FA%7C%2FB"]);
        let plan = h.plan_commands("foolcat", &[call("create", json!({"source": "/S", "destination": "/D"}))]).unwrap();
        assert_eq!(plan.urls, vec!["foolcat://create?destination=%2FD&source=%2FS"]);
    }

    #[test]
    fn validation_errors() {
        let (_f, h) = hedge(FakeHost::new(Os::Windows));
        assert!(matches!(h.plan_commands("offshoot", &[]).unwrap_err(), CoreError::Validation(_)));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("activate", json!({"key": "x"}))]).unwrap_err(),
            CoreError::CommandNotFound { .. }
        ));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("setDestination", json!({}))]).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("setSource", json!({"paths": "/Volumes/A"}))]).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("setSource", json!({"paths": []}))]).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("open", json!({"extra": 1}))]).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(h.plan_commands("postlab", &[call("open", json!({}))]).unwrap_err(), CoreError::AppNotFound(_)));
    }

    #[test]
    fn run_opens_urls_in_order_without_waiting() {
        let (fake, h) = hedge(FakeHost::new(Os::Windows));
        let out = h
            .run_commands("offshoot", &[call("open", json!({})), call("reloadPresets", json!({}))], Duration::ZERO)
            .unwrap();
        assert_eq!(fake.opened_urls(), vec!["offshoot://open", "offshoot://reloadPresets"]);
        assert_eq!(out.plan.urls, fake.opened_urls());
        assert!(out.responses.is_empty());
    }

    #[test]
    fn run_waits_for_the_callback_log() {
        let appdata = tempfile::tempdir().unwrap();
        let log = appdata.path().join("Hedge").join("HedgeCallback.log");
        fs::create_dir_all(log.parent().unwrap()).unwrap();
        fs::write(&log, "old line\n").unwrap();
        let (_fake, h) = hedge(FakeHost::new(Os::Windows).with_env("APPDATA", &appdata.path().display().to_string()));
        let writer_log = log.clone();
        let writer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            use std::io::Write;
            let mut f = fs::OpenOptions::new().append(true).open(writer_log).unwrap();
            f.write_all(b"2026-09-23 10:00:00 | 1 | open\n").unwrap();
        });
        let out = h.run_commands("offshoot", &[call("open", json!({}))], Duration::from_secs(5)).unwrap();
        writer.join().unwrap();
        assert_eq!(out.responses, vec!["2026-09-23 10:00:00 | 1 | open"]);
    }
}
```

In `hedge/mod.rs`, add `mod commands;` and `pub use commands::{percent_encode, CommandCall, CommandOutcome, CommandPlan};`.

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core hedge::commands`
Expected: 7 tests FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

```rust
pub fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn type_name(ty: ParamType) -> &'static str {
    match ty {
        ParamType::String => "a string",
        ParamType::Path => "a non-empty path string",
        ParamType::PathList => "a non-empty array of non-empty path strings",
        ParamType::Int => "an integer",
        ParamType::Bool => "true or false",
        ParamType::Json => "any JSON value",
    }
}

fn check_value(command: &str, name: &str, spec: &ParamSpec, v: &Value) -> Result<()> {
    let ok = match spec.ty {
        ParamType::String => v.is_string(),
        ParamType::Path => v.as_str().is_some_and(|s| !s.is_empty()),
        ParamType::PathList => v
            .as_array()
            .is_some_and(|a| !a.is_empty() && a.iter().all(|i| i.as_str().is_some_and(|s| !s.is_empty()))),
        ParamType::Int => v.is_i64() || v.is_u64(),
        ParamType::Bool => v.is_boolean(),
        ParamType::Json => true,
    };
    if ok {
        Ok(())
    } else {
        Err(CoreError::Validation(format!("{command}: parameter '{name}' must be {}", type_name(spec.ty))))
    }
}

fn query_value(spec: &ParamSpec, v: &Value, separator: Option<&str>) -> String {
    match (spec.ty, v, separator) {
        (ParamType::PathList, Value::Array(items), Some(sep)) => {
            items.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(sep)
        }
        (_, Value::String(s), _) => s.clone(),
        (_, other, _) => other.to_string(),
    }
}

fn flush(pending: &mut Vec<Value>, urls: &mut Vec<String>, scheme: &str) {
    if pending.is_empty() {
        return;
    }
    let json = Value::Array(std::mem::take(pending)).to_string();
    urls.push(format!("{scheme}://actions?json={}", percent_encode(&json)));
}

fn read_new_lines(path: &Path, from: u64) -> Vec<String> {
    let bytes = fs::read(path).unwrap_or_default();
    let start = usize::try_from(from).unwrap_or(usize::MAX);
    let slice = bytes.get(start..).unwrap_or(&[]);
    String::from_utf8_lossy(slice)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect()
}

fn wait_for_growth(path: &Path, before: u64, wait: Duration) -> Vec<String> {
    let deadline = Instant::now() + wait;
    loop {
        let len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if len != before {
            // Give the writer a moment to finish its line.
            std::thread::sleep(Duration::from_millis(100));
            return read_new_lines(path, if len < before { 0 } else { before });
        }
        if Instant::now() >= deadline {
            return Vec::new();
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

impl Hedge {
    pub fn plan_commands(&self, app: &str, calls: &[CommandCall]) -> Result<CommandPlan> {
        let m = self.catalog.app(app)?;
        let scheme = m
            .app
            .scheme
            .as_deref()
            .ok_or_else(|| CoreError::Unsupported(format!("{} has no URL scheme", m.app.name)))?;
        if calls.is_empty() {
            return Err(CoreError::Validation("no commands given".into()));
        }
        let os = self.host.os();
        let (mut urls, mut pending, mut confirm) = (Vec::new(), Vec::new(), Vec::new());
        for call in calls {
            let spec = m.command(&call.command)?;
            if !spec.available_on(os) {
                return Err(CoreError::Unsupported(format!(
                    "{} command {} is not available on {}",
                    m.app.name,
                    spec.id,
                    os.as_str()
                )));
            }
            let specs = spec.param_specs()?;
            if let Some(unknown) = call.params.keys().find(|k| !specs.contains_key(*k)) {
                return Err(CoreError::Validation(format!("{}: unknown parameter '{unknown}'", spec.id)));
            }
            for (name, ps) in &specs {
                match call.params.get(name) {
                    Some(v) => check_value(&spec.id, name, ps, v)?,
                    None if !ps.optional => {
                        return Err(CoreError::Validation(format!("{}: missing parameter '{name}'", spec.id)));
                    }
                    None => {}
                }
            }
            if spec.confirm {
                confirm.push(spec.id.clone());
            }
            match spec.form {
                CommandForm::Action => {
                    let mut obj = Map::new();
                    obj.insert(spec.id.clone(), Value::Object(call.params.clone()));
                    pending.push(Value::Object(obj));
                }
                CommandForm::Url => {
                    flush(&mut pending, &mut urls, scheme);
                    let query: Vec<String> = specs
                        .iter()
                        .filter_map(|(name, ps)| {
                            call.params.get(name).map(|v| {
                                format!(
                                    "{name}={}",
                                    percent_encode(&query_value(ps, v, spec.list_separator.as_deref()))
                                )
                            })
                        })
                        .collect();
                    let mut url = format!("{scheme}://{}", spec.id);
                    if !query.is_empty() {
                        url.push('?');
                        url.push_str(&query.join("&"));
                    }
                    urls.push(url);
                }
            }
        }
        flush(&mut pending, &mut urls, scheme);
        Ok(CommandPlan { app: m.app.id.clone(), urls, confirm })
    }

    pub fn run_commands(&self, app: &str, calls: &[CommandCall], wait: Duration) -> Result<CommandOutcome> {
        let plan = self.plan_commands(app, calls)?;
        let log = self.callback_log(app)?;
        let before = log.as_ref().and_then(|p| fs::metadata(p).ok()).map_or(0, |m| m.len());
        for url in &plan.urls {
            self.host.open_url(url)?;
        }
        let responses = match &log {
            Some(path) if !wait.is_zero() => wait_for_growth(path, before, wait),
            _ => Vec::new(),
        };
        Ok(CommandOutcome { plan, responses })
    }

    fn callback_log(&self, app: &str) -> Result<Option<PathBuf>> {
        let m = self.catalog.app(app)?;
        match m.files.get(self.host.os()).and_then(|f| f.callback_log.as_ref()) {
            Some(template) => Ok(Some(self.expand(template)?)),
            None => Ok(None),
        }
    }
}
```

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core hedge::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 7 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): URL-scheme commands with batching and callback-log responses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: OffShoot presets and app logs

**Files:**
- Create: `crates/core/src/hedge/presets.rs`
- Modify: `crates/core/src/hedge/mod.rs`, `crates/core/src/hedge/apps.rs` (`describe_app` uses `presets_dir`)

**Interfaces:**
- Consumes: `Hedge`, `Action` (Task 4), `PresetsSpec`, `Files` (Task 2), `RegValue`.
- Produces:
  - `Preset { name, folder_pattern, label_pattern, rename_pattern, counter, flatten_folders, ignore_empty_folders }` (Serialize + Deserialize).
  - `LogKind::{Callback, Event}` (serde snake_case).
  - `validate_preset_name(&str) -> Result<()>`.
  - `Hedge::presets_dir(app)`, `Hedge::list_presets(app)`, `Hedge::plan_write_preset(app, &Preset)`, `Hedge::plan_select_preset(app, name)`, `Hedge::selected_preset(app)`, `Hedge::read_app_log(app, LogKind, tail: usize)`.
- Behaviour: presets live in `<dir>/<name>.hedge` as a JSON array holding one object (`version`, `doNotCopyFiles`, `renamePattern`, `folderPattern`, `labelPattern`, `dontAllowRepetitionAndTrim`, `counter`, `flattenFolders`, `ignoreEmptyFolders`). The registry `PresetsLocation` override wins over `dir` when set. Writing overlays the seven HedgeBuddy fields on the existing object (unknown keys preserved) or on defaults. Selecting writes the preset name to `SessionVariableSelectedPreset` and requires the file to exist. No presets section for the OS → `Unsupported`. Logs: last `tail` lines; missing file → empty list; no log path for this OS → `Unsupported`. After writing a preset, callers run the `reloadPresets` command (documented on `plan_write_preset`).

- [ ] **Step 1: Write the module with failing tests**

`crates/core/src/hedge/presets.rs`:
```rust
//! OffShoot presets and Hedge app log files.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use super::{Action, Hedge};
use crate::catalog::PresetsSpec;
use crate::error::{CoreError, Result};
use crate::host::RegValue;

/// The fields of an OffShoot preset (`<name>.hedge`) that HedgeBuddy reads and writes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Preset {
    pub name: String,
    pub folder_pattern: String,
    pub label_pattern: String,
    pub rename_pattern: String,
    pub counter: String,
    pub flatten_folders: bool,
    pub ignore_empty_folders: bool,
}

/// Which app log to read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogKind {
    Callback,
    Event,
}

/// A preset name must be usable as a file name on both platforms.
pub fn validate_preset_name(name: &str) -> Result<()> {
    let bad = name.trim().is_empty()
        || name.len() > 100
        || name.starts_with('.')
        || name
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'));
    if bad {
        Err(CoreError::Validation(format!("preset name '{name}' is not a valid file name")))
    } else {
        Ok(())
    }
}

fn default_object() -> Map<String, Value> {
    json!({
        "version": "1.0",
        "doNotCopyFiles": [],
        "renamePattern": "",
        "folderPattern": "",
        "labelPattern": "",
        "dontAllowRepetitionAndTrim": [],
        "counter": "001",
        "flattenFolders": false,
        "ignoreEmptyFolders": false
    })
    .as_object()
    .cloned()
    .expect("a JSON object")
}

fn preset_object(path: &Path) -> Option<Map<String, Value>> {
    let value: Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    value.as_array()?.first()?.as_object().cloned()
}

fn read_preset(path: &Path) -> Option<Preset> {
    let obj = preset_object(path)?;
    let s = |k: &str| obj.get(k).and_then(Value::as_str).unwrap_or_default().to_owned();
    let b = |k: &str| obj.get(k).and_then(Value::as_bool).unwrap_or(false);
    Some(Preset {
        name: path.file_stem()?.to_string_lossy().into_owned(),
        folder_pattern: s("folderPattern"),
        label_pattern: s("labelPattern"),
        rename_pattern: s("renamePattern"),
        counter: s("counter"),
        flatten_folders: b("flattenFolders"),
        ignore_empty_folders: b("ignoreEmptyFolders"),
    })
}

impl Hedge {
    fn presets_spec(&self, app: &str) -> Result<&PresetsSpec> {
        let m = self.catalog.app(app)?;
        m.presets
            .get(self.host.os())
            .ok_or_else(|| CoreError::Unsupported(format!("{} presets are not supported on this platform", m.app.name)))
    }

    /// The preset folder: the registry override when set, else the catalog's `dir`.
    pub fn presets_dir(&self, app: &str) -> Result<PathBuf> {
        todo!()
    }

    /// Every readable preset, sorted by name. Unreadable files are skipped.
    pub fn list_presets(&self, app: &str) -> Result<Vec<Preset>> {
        todo!()
    }

    /// Write (create or update) a preset. Unknown keys in an existing file are
    /// kept. Run the app's `reloadPresets` command afterwards.
    pub fn plan_write_preset(&self, app: &str, preset: &Preset) -> Result<Vec<Action>> {
        todo!()
    }

    /// Make an existing preset the selected one.
    pub fn plan_select_preset(&self, app: &str, name: &str) -> Result<Vec<Action>> {
        todo!()
    }

    /// The selected preset's name, when the app records one.
    pub fn selected_preset(&self, app: &str) -> Result<Option<String>> {
        todo!()
    }

    /// The last `tail` lines of an app log (empty when the file does not exist yet).
    pub fn read_app_log(&self, app: &str, kind: LogKind, tail: usize) -> Result<Vec<String>> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::catalog::Catalog;
    use crate::host::{FakeHost, Os};

    const KEY: &str = "HKCU\\Software\\Hedge";
    const A_CAM: &str = r#"[
  {
    "version": "1.0",
    "doNotCopyFiles":[],
    "renamePattern": "",
    "folderPattern": "project/CAMERA/A{Source Counter}",
    "labelPattern": "A{Source Counter}",
    "dontAllowRepetitionAndTrim":[],
    "counter": "015",
    "flattenFolders": false,
    "ignoreEmptyFolders": false,
    "extraKey": 7
  }
]"#;

    fn setup(host: FakeHost) -> (tempfile::TempDir, PathBuf, Arc<FakeHost>, Hedge) {
        let appdata = tempfile::tempdir().unwrap();
        let presets = appdata.path().join("Hedge").join("Presets");
        fs::create_dir_all(&presets).unwrap();
        fs::write(presets.join("A cam preset.hedge"), A_CAM).unwrap();
        fs::write(presets.join("broken.hedge"), "not json").unwrap();
        let fake = Arc::new(host.with_env("APPDATA", &appdata.path().display().to_string()));
        let hedge = Hedge::new(fake.clone(), Catalog::embedded().unwrap());
        (appdata, presets, fake, hedge)
    }

    fn b_cam() -> Preset {
        Preset {
            name: "B cam".into(),
            folder_pattern: "project/CAMERA/B{Source Counter}".into(),
            label_pattern: "B{Source Counter}".into(),
            rename_pattern: String::new(),
            counter: "003".into(),
            flatten_folders: false,
            ignore_empty_folders: true,
        }
    }

    #[test]
    fn list_reads_existing_presets() {
        let (_a, presets, _f, h) = setup(FakeHost::new(Os::Windows));
        assert_eq!(h.presets_dir("offshoot").unwrap(), presets);
        let list = h.list_presets("offshoot").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "A cam preset");
        assert_eq!(list[0].folder_pattern, "project/CAMERA/A{Source Counter}");
        assert_eq!(list[0].counter, "015");
    }

    #[test]
    fn write_creates_and_updates_preserving_unknown_keys() {
        let (_a, presets, _f, h) = setup(FakeHost::new(Os::Windows));
        let plan = h.plan_write_preset("offshoot", &b_cam()).unwrap();
        assert!(!presets.join("B cam.hedge").exists(), "planning must not write");
        h.apply(&plan).unwrap();
        let written: Value = serde_json::from_str(&fs::read_to_string(presets.join("B cam.hedge")).unwrap()).unwrap();
        assert_eq!(written[0]["version"], "1.0");
        assert_eq!(written[0]["counter"], "003");
        assert_eq!(written[0]["ignoreEmptyFolders"], true);

        let mut a = h.list_presets("offshoot").unwrap().into_iter().find(|p| p.name == "A cam preset").unwrap();
        a.counter = "016".into();
        h.apply(&h.plan_write_preset("offshoot", &a).unwrap()).unwrap();
        let updated: Value =
            serde_json::from_str(&fs::read_to_string(presets.join("A cam preset.hedge")).unwrap()).unwrap();
        assert_eq!(updated[0]["counter"], "016");
        assert_eq!(updated[0]["extraKey"], 7);

        let mut bad = b_cam();
        bad.name = "../escape".into();
        assert!(matches!(h.plan_write_preset("offshoot", &bad).unwrap_err(), CoreError::Validation(_)));
    }

    #[test]
    fn select_writes_the_registry_and_requires_the_file() {
        let (_a, _p, fake, h) = setup(FakeHost::new(Os::Windows));
        assert_eq!(h.selected_preset("offshoot").unwrap(), None);
        h.apply(&h.plan_select_preset("offshoot", "A cam preset").unwrap()).unwrap();
        assert_eq!(
            fake.registry_value(KEY, "SessionVariableSelectedPreset"),
            Some(RegValue::String("A cam preset".into()))
        );
        assert_eq!(h.selected_preset("offshoot").unwrap().as_deref(), Some("A cam preset"));
        assert!(matches!(h.plan_select_preset("offshoot", "Missing").unwrap_err(), CoreError::Validation(_)));
    }

    #[test]
    fn registry_override_moves_the_folder() {
        let shared = tempfile::tempdir().unwrap();
        let (_a, _p, _f, h) = setup(FakeHost::new(Os::Windows).with_registry_value(
            KEY,
            "PresetsLocation",
            RegValue::String(shared.path().display().to_string()),
        ));
        assert_eq!(h.presets_dir("offshoot").unwrap(), shared.path());
        assert!(h.list_presets("offshoot").unwrap().is_empty());
    }

    #[test]
    fn presets_are_unsupported_where_undocumented() {
        let (_a, _p, _f, h) = setup(FakeHost::new(Os::Macos));
        assert!(matches!(h.list_presets("offshoot").unwrap_err(), CoreError::Unsupported(_)));
        assert!(matches!(h.list_presets("foolcat").unwrap_err(), CoreError::Unsupported(_)));
    }

    #[test]
    fn app_logs_tail() {
        let (appdata, _p, _f, h) = setup(FakeHost::new(Os::Windows));
        assert!(h.read_app_log("offshoot", LogKind::Callback, 10).unwrap().is_empty());
        fs::write(appdata.path().join("Hedge").join("Hedge.log"), "1\n2\n3\n4\n5\n").unwrap();
        assert_eq!(h.read_app_log("offshoot", LogKind::Event, 2).unwrap(), vec!["4", "5"]);
        assert_eq!(h.read_app_log("offshoot", LogKind::Event, 99).unwrap().len(), 5);
        assert!(matches!(h.read_app_log("canister", LogKind::Event, 5).unwrap_err(), CoreError::Unsupported(_)));
    }

    #[test]
    fn describe_app_reports_the_effective_presets_dir() {
        let shared = tempfile::tempdir().unwrap();
        let (_a, _p, _f, h) = setup(FakeHost::new(Os::Windows).with_registry_value(
            KEY,
            "PresetsLocation",
            RegValue::String(shared.path().display().to_string()),
        ));
        assert_eq!(h.describe_app("offshoot").unwrap().files.presets_dir, Some(shared.path().to_path_buf()));
    }
}
```

In `hedge/mod.rs`, add `mod presets;` and `pub use presets::{validate_preset_name, LogKind, Preset};`.

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core hedge::presets`
Expected: all 7 FAIL with `not yet implemented` (the last one fails its assertion until Step 3's `describe_app` change).

- [ ] **Step 3: Implement**

```rust
    pub fn presets_dir(&self, app: &str) -> Result<PathBuf> {
        let spec = self.presets_spec(app)?;
        if let (Some(key), Some(value)) = (&spec.registry_key, &spec.location_override_value) {
            if let Ok(Some(RegValue::String(s))) = self.host.registry_read(key, value) {
                if !s.trim().is_empty() {
                    return Ok(PathBuf::from(s.trim()));
                }
            }
        }
        self.expand(&spec.dir)
    }

    pub fn list_presets(&self, app: &str) -> Result<Vec<Preset>> {
        let dir = self.presets_dir(app)?;
        let Ok(entries) = fs::read_dir(&dir) else {
            return Ok(Vec::new());
        };
        let mut presets: Vec<Preset> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("hedge")))
            .filter_map(|p| read_preset(&p))
            .collect();
        presets.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(presets)
    }

    pub fn plan_write_preset(&self, app: &str, preset: &Preset) -> Result<Vec<Action>> {
        validate_preset_name(&preset.name)?;
        let path = self.presets_dir(app)?.join(format!("{}.hedge", preset.name));
        let mut obj = preset_object(&path).unwrap_or_else(default_object);
        obj.insert("folderPattern".into(), Value::String(preset.folder_pattern.clone()));
        obj.insert("labelPattern".into(), Value::String(preset.label_pattern.clone()));
        obj.insert("renamePattern".into(), Value::String(preset.rename_pattern.clone()));
        obj.insert("counter".into(), Value::String(preset.counter.clone()));
        obj.insert("flattenFolders".into(), Value::Bool(preset.flatten_folders));
        obj.insert("ignoreEmptyFolders".into(), Value::Bool(preset.ignore_empty_folders));
        let mut contents =
            serde_json::to_string_pretty(&Value::Array(vec![Value::Object(obj)])).expect("JSON values serialize");
        contents.push('\n');
        Ok(vec![Action::WriteFile { path, contents }])
    }

    pub fn plan_select_preset(&self, app: &str, name: &str) -> Result<Vec<Action>> {
        validate_preset_name(name)?;
        let spec = self.presets_spec(app)?;
        let (Some(key), Some(value)) = (&spec.registry_key, &spec.selected_value) else {
            return Err(CoreError::Unsupported(format!("selecting a preset is not supported for {app} here")));
        };
        let file = self.presets_dir(app)?.join(format!("{name}.hedge"));
        if !file.is_file() {
            return Err(CoreError::Validation(format!("preset '{name}' does not exist ({})", file.display())));
        }
        Ok(vec![Action::RegistrySet { key: key.clone(), value: value.clone(), data: RegValue::String(name.to_owned()) }])
    }

    pub fn selected_preset(&self, app: &str) -> Result<Option<String>> {
        let spec = self.presets_spec(app)?;
        let (Some(key), Some(value)) = (&spec.registry_key, &spec.selected_value) else {
            return Ok(None);
        };
        Ok(match self.host.registry_read(key, value)? {
            Some(RegValue::String(s)) if !s.trim().is_empty() => Some(s.trim().to_owned()),
            _ => None,
        })
    }

    pub fn read_app_log(&self, app: &str, kind: LogKind, tail: usize) -> Result<Vec<String>> {
        let m = self.catalog.app(app)?;
        let files = m.files.get(self.host.os());
        let template = match kind {
            LogKind::Callback => files.and_then(|f| f.callback_log.as_ref()),
            LogKind::Event => files.and_then(|f| f.event_log.as_ref()),
        }
        .ok_or_else(|| {
            let which = match kind {
                LogKind::Callback => "callback",
                LogKind::Event => "event",
            };
            CoreError::Unsupported(format!("{} has no {which} log on this platform", m.app.name))
        })?;
        let path = self.expand(template)?;
        let bytes = match fs::read(&path) {
            Ok(b) => b,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(CoreError::io(&path, e)),
        };
        let text = String::from_utf8_lossy(&bytes);
        let lines: Vec<&str> = text.lines().collect();
        Ok(lines[lines.len().saturating_sub(tail)..].iter().map(|s| s.to_string()).collect())
    }
```

In `hedge/apps.rs` `describe_app`, replace the `presets_dir:` field initialiser with:
```rust
                presets_dir: self.presets_dir(id).ok(),
```

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core hedge::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 7 new tests pass; Task 3's `describe_resolves_files` still passes.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): OffShoot presets (list, write, select) and app log tails

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Volume inspection

**Files:**
- Create: `crates/core/src/volumes.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Produces: `CardGuess { kind, evidence }`, `VolumeReport { root, card: Option<CardGuess>, clip_count, media_bytes, top_level: Vec<String>, truncated }` (Serialize), `inspect_volume(&Path) -> Result<VolumeReport>`. Mounted-volume listing is `Host::volumes()` (Task 1).
- Behaviour: walks up to 6 directory levels and 200 000 entries (`truncated` when either limit is hit), skipping names that start with `.` or `$` and `System Volume Information`. Video files (`mov mp4 mxf braw r3d crm mts m4v avi`) count one clip each; frame files (`ari arx dng`) count one clip per containing folder; audio (`wav bwf`) adds bytes only. Card rules, first match wins, folder names compared case-insensitively: `sony` (`PRIVATE/M4ROOT`, `PRIVATE/XDROOT`, `XDROOT`), `canon` (`CONTENTS/CLIPS001` or `.crm`), `panasonic` (`PRIVATE/PANA_GRP`, `CONTENTS/VIDEO`), `red` (`.r3d` or a folder ending `.rdm`/`.rdc`), `arri` (`.ari`/`.arx`), `blackmagic` (`.braw`), `avchd` (`PRIVATE/AVCHD`), `dcim` (`DCIM`), `audio` (`.wav`/`.bwf` and no video). Otherwise `None`.

- [ ] **Step 1: Write the module with failing tests**

`crates/core/src/volumes.rs`:
```rust
//! Inspecting a mounted volume: does it look like a camera card, how many
//! clips does it hold, and how much media.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{CoreError, Result};

const MAX_DEPTH: usize = 6;
const MAX_ENTRIES: usize = 200_000;
const VIDEO: &[&str] = &["mov", "mp4", "mxf", "braw", "r3d", "crm", "mts", "m4v", "avi"];
const FRAMES: &[&str] = &["ari", "arx", "dng"];
const AUDIO: &[&str] = &["wav", "bwf"];

/// Which kind of card a volume looks like, and the evidence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CardGuess {
    pub kind: String,
    pub evidence: String,
}

/// What is on a volume.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VolumeReport {
    pub root: PathBuf,
    pub card: Option<CardGuess>,
    pub clip_count: u64,
    pub media_bytes: u64,
    pub top_level: Vec<String>,
    pub truncated: bool,
}

fn skip(name: &str) -> bool {
    name.starts_with('.') || name.starts_with('$') || name.eq_ignore_ascii_case("System Volume Information")
}

fn rel_key(rel: &Path) -> String {
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy().to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join("/")
}

fn guess_card(dirs: &BTreeSet<String>, exts: &BTreeSet<String>) -> Option<CardGuess> {
    todo!()
}

/// Inspect the volume (or any folder) at `root`.
pub fn inspect_volume(root: &Path) -> Result<VolumeReport> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(root: &Path, rel: &str, bytes: usize) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![0u8; bytes]).unwrap();
    }

    fn card(root: &Path) -> Option<String> {
        inspect_volume(root).unwrap().card.map(|c| c.kind)
    }

    #[test]
    fn sony_card() {
        let d = tempfile::tempdir().unwrap();
        touch(d.path(), "PRIVATE/M4ROOT/CLIP/C0001.MP4", 10);
        touch(d.path(), "PRIVATE/M4ROOT/CLIP/C0002.MP4", 20);
        let r = inspect_volume(d.path()).unwrap();
        assert_eq!(r.card, Some(CardGuess { kind: "sony".into(), evidence: "PRIVATE/M4ROOT".into() }));
        assert_eq!((r.clip_count, r.media_bytes), (2, 30));
        assert_eq!(r.top_level, vec!["PRIVATE"]);
        assert!(!r.truncated);
    }

    #[test]
    fn arri_frames_count_per_folder() {
        let d = tempfile::tempdir().unwrap();
        touch(d.path(), "A001C001_250923_R1AB/A001C001_250923_R1AB.0000001.ari", 5);
        touch(d.path(), "A001C001_250923_R1AB/A001C001_250923_R1AB.0000002.ari", 5);
        touch(d.path(), "A001C002_250923_R1AB/A001C002_250923_R1AB.0000001.ari", 5);
        let r = inspect_volume(d.path()).unwrap();
        assert_eq!(r.card.map(|c| c.kind).as_deref(), Some("arri"));
        assert_eq!((r.clip_count, r.media_bytes), (2, 15));
    }

    #[test]
    fn other_card_kinds() {
        let red = tempfile::tempdir().unwrap();
        touch(red.path(), "A001_0923XY.RDM/A001_C001_0923XY.RDC/A001_C001_0923XY_001.R3D", 4);
        assert_eq!(card(red.path()).as_deref(), Some("red"));
        assert_eq!(inspect_volume(red.path()).unwrap().clip_count, 1);

        let bm = tempfile::tempdir().unwrap();
        touch(bm.path(), "A001_09231200_C001.braw", 4);
        assert_eq!(card(bm.path()).as_deref(), Some("blackmagic"));

        let canon = tempfile::tempdir().unwrap();
        touch(canon.path(), "contents/clips001/A001C001.CRM", 4);
        assert_eq!(card(canon.path()).as_deref(), Some("canon"));

        let dcim = tempfile::tempdir().unwrap();
        touch(dcim.path(), "DCIM/100MEDIA/IMG_0001.JPG", 4);
        let r = inspect_volume(dcim.path()).unwrap();
        assert_eq!(r.card.map(|c| c.kind).as_deref(), Some("dcim"));
        assert_eq!(r.clip_count, 0);

        let audio = tempfile::tempdir().unwrap();
        touch(audio.path(), "ZOOM0001/ZOOM0001_LR.WAV", 8);
        let r = inspect_volume(audio.path()).unwrap();
        assert_eq!(r.card.map(|c| c.kind).as_deref(), Some("audio"));
        assert_eq!((r.clip_count, r.media_bytes), (0, 8));

        let lower = tempfile::tempdir().unwrap();
        touch(lower.path(), "private/m4root/clip/c0001.mp4", 1);
        assert_eq!(card(lower.path()).as_deref(), Some("sony"));
    }

    #[test]
    fn empty_hidden_and_invalid() {
        let d = tempfile::tempdir().unwrap();
        let r = inspect_volume(d.path()).unwrap();
        assert_eq!((r.card, r.clip_count, r.media_bytes), (None, 0, 0));
        touch(d.path(), ".Spotlight-V100/x.mov", 9);
        touch(d.path(), "System Volume Information/y.mov", 9);
        touch(d.path(), "$RECYCLE.BIN/z.mov", 9);
        let r = inspect_volume(d.path()).unwrap();
        assert_eq!(r.clip_count, 0);
        assert!(r.top_level.is_empty(), "{:?}", r.top_level);
        assert!(matches!(inspect_volume(&d.path().join("missing")).unwrap_err(), CoreError::Validation(_)));
    }

    #[test]
    fn depth_limit_marks_truncated() {
        let d = tempfile::tempdir().unwrap();
        touch(d.path(), "1/2/3/4/5/6/7/deep.mov", 1);
        let r = inspect_volume(d.path()).unwrap();
        assert!(r.truncated);
        assert_eq!(r.clip_count, 0);
    }
}
```

In `lib.rs`: add `pub mod volumes;` (alphabetical).

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core volumes::`
Expected: 5 tests FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

```rust
fn guess_card(dirs: &BTreeSet<String>, exts: &BTreeSet<String>) -> Option<CardGuess> {
    let dir = |p: &str| dirs.contains(p);
    let ext = |e: &str| exts.contains(e);
    let found = |kind: &str, evidence: &str| Some(CardGuess { kind: kind.into(), evidence: evidence.into() });
    if dir("private/m4root") {
        return found("sony", "PRIVATE/M4ROOT");
    }
    if dir("private/xdroot") || dir("xdroot") {
        return found("sony", "XDROOT");
    }
    if dir("contents/clips001") {
        return found("canon", "CONTENTS/CLIPS001");
    }
    if ext("crm") {
        return found("canon", ".CRM files");
    }
    if dir("private/pana_grp") || dir("contents/video") {
        return found("panasonic", "PRIVATE/PANA_GRP or CONTENTS/VIDEO");
    }
    if ext("r3d") || dirs.iter().any(|d| d.ends_with(".rdm") || d.ends_with(".rdc")) {
        return found("red", ".R3D / .RDM");
    }
    if ext("ari") || ext("arx") {
        return found("arri", "ARRIRAW frames");
    }
    if ext("braw") {
        return found("blackmagic", ".braw files");
    }
    if dir("private/avchd") {
        return found("avchd", "PRIVATE/AVCHD");
    }
    if dir("dcim") {
        return found("dcim", "DCIM");
    }
    if (ext("wav") || ext("bwf")) && !VIDEO.iter().any(|v| ext(v)) {
        return found("audio", "WAV files");
    }
    None
}

pub fn inspect_volume(root: &Path) -> Result<VolumeReport> {
    if !root.is_dir() {
        return Err(CoreError::Validation(format!("{} is not a folder", root.display())));
    }
    let mut top_level: Vec<String> = fs::read_dir(root)
        .map_err(|e| CoreError::io(root, e))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !skip(n))
        .collect();
    top_level.sort();

    let mut dirs = BTreeSet::new();
    let mut exts = BTreeSet::new();
    let mut frame_dirs = BTreeSet::new();
    let (mut clips, mut bytes, mut seen, mut truncated) = (0u64, 0u64, 0usize, false);
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    'walk: while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.filter_map(|e| e.ok()) {
            seen += 1;
            if seen > MAX_ENTRIES {
                truncated = true;
                break 'walk;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if skip(&name) {
                continue;
            }
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else { continue };
            if file_type.is_dir() {
                if let Ok(rel) = path.strip_prefix(root) {
                    dirs.insert(rel_key(rel));
                }
                if depth + 1 < MAX_DEPTH {
                    stack.push((path, depth + 1));
                } else {
                    truncated = true;
                }
            } else if file_type.is_file() {
                let ext = path
                    .extension()
                    .map(|e| e.to_string_lossy().to_ascii_lowercase())
                    .unwrap_or_default();
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                if VIDEO.contains(&ext.as_str()) {
                    clips += 1;
                    bytes += size;
                } else if FRAMES.contains(&ext.as_str()) {
                    frame_dirs.insert(dir.clone());
                    bytes += size;
                } else if AUDIO.contains(&ext.as_str()) {
                    bytes += size;
                }
                if !ext.is_empty() {
                    exts.insert(ext);
                }
            }
        }
    }
    clips += frame_dirs.len() as u64;
    Ok(VolumeReport {
        root: root.to_path_buf(),
        card: guess_card(&dirs, &exts),
        clip_count: clips,
        media_bytes: bytes,
        top_level,
        truncated,
    })
}
```

The depth test: the root is depth 0 and folders `1` … `6` are depths 1–6; folder `6` sits at the limit, so it is recorded but not entered, `truncated` becomes true, and `deep.mov` is never counted.

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core volumes::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): volume inspection with camera-card guess, clip count, and media size

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Python environment

**Files:**
- Create: `crates/core/src/python_env.rs`
- Modify: `crates/core/src/lib.rs`

**Interfaces:**
- Consumes: `Host::run`, `Os` (Task 1).
- Produces: `PythonInfo { launcher: Vec<String>, executable: PathBuf, version: String, hedgebuddy: Option<String> }` (Serialize + Deserialize), `launcher(Os) -> Vec<&'static str>` (`["py", "-3"]` on Windows, `["python3"]` on macOS), `find_python(&dyn Host) -> Result<Option<PythonInfo>>`, `syntax_check(&dyn Host, python: &Path, script: &Path) -> Result<Option<String>>` (`None` = valid; `Some(last stderr line)` = invalid), `pub(crate) const PROBE`, `pub(crate) const SYNTAX_CHECK`.
- Behaviour: a missing launcher, non-zero exit, or unparseable output means `Ok(None)` from `find_python`. `syntax_check` uses `ast.parse` so it never writes `__pycache__` next to the script. Which `python3` OffShoot uses on macOS is unverified; note it in the doc comment.

- [ ] **Step 1: Write the module with failing tests**

`crates/core/src/python_env.rs`:
```rust
//! The Python interpreter Hedge apps run scripts with: finding it, checking
//! whether the `hedgebuddy` package is installed in it, and syntax-checking
//! scripts without running them.
//!
//! Hedge apps start scripts with the `py` launcher on Windows and `python3`
//! on macOS (the exact macOS interpreter OffShoot resolves is unverified).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::host::{Host, Os};

pub(crate) const PROBE: &str = "import json, sys\ntry:\n    from importlib import metadata\n    v = metadata.version('hedgebuddy')\nexcept Exception:\n    v = None\nprint(json.dumps({'executable': sys.executable, 'version': '%d.%d.%d' % tuple(sys.version_info[:3]), 'hedgebuddy': v}))\n";

pub(crate) const SYNTAX_CHECK: &str =
    "import ast, sys\nsrc = open(sys.argv[1], encoding='utf-8').read()\nast.parse(src, sys.argv[1])\n";

/// The interpreter Hedge apps use.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PythonInfo {
    pub launcher: Vec<String>,
    pub executable: PathBuf,
    pub version: String,
    pub hedgebuddy: Option<String>,
}

/// The command Hedge apps use to start Python on `os`.
pub fn launcher(os: Os) -> Vec<&'static str> {
    match os {
        Os::Windows => vec!["py", "-3"],
        Os::Macos => vec!["python3"],
    }
}

/// Find the interpreter and the installed `hedgebuddy` version, if any.
pub fn find_python(host: &dyn Host) -> Result<Option<PythonInfo>> {
    todo!()
}

/// Parse `script` with `python` without running it. `None` means valid.
pub fn syntax_check(host: &dyn Host, python: &Path, script: &Path) -> Result<Option<String>> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::{CommandOutput, FakeHost};

    fn ok(stdout: &str) -> CommandOutput {
        CommandOutput { status: 0, stdout: stdout.into(), stderr: String::new() }
    }

    #[test]
    fn finds_python_through_the_platform_launcher() {
        let win = FakeHost::new(Os::Windows).with_run_response(
            "py",
            &["-3", "-c", PROBE],
            ok("{\"executable\": \"C:\\\\Python313\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": \"0.11.0\"}\n"),
        );
        let info = find_python(&win).unwrap().unwrap();
        assert_eq!(info.launcher, vec!["py", "-3"]);
        assert_eq!(info.executable, PathBuf::from("C:\\Python313\\python.exe"));
        assert_eq!(info.version, "3.13.5");
        assert_eq!(info.hedgebuddy.as_deref(), Some("0.11.0"));

        let mac = FakeHost::new(Os::Macos).with_run_response(
            "python3",
            &["-c", PROBE],
            ok("noise\n{\"executable\": \"/usr/bin/python3\", \"version\": \"3.9.6\", \"hedgebuddy\": null}\n"),
        );
        let info = find_python(&mac).unwrap().unwrap();
        assert_eq!(info.launcher, vec!["python3"]);
        assert_eq!(info.hedgebuddy, None);
    }

    #[test]
    fn missing_failing_or_garbled_python_is_none() {
        assert_eq!(find_python(&FakeHost::new(Os::Windows)).unwrap(), None);
        let failing = FakeHost::new(Os::Windows).with_run_response(
            "py",
            &["-3", "-c", PROBE],
            CommandOutput { status: 103, stdout: String::new(), stderr: "No suitable Python runtime found".into() },
        );
        assert_eq!(find_python(&failing).unwrap(), None);
        let garbled = FakeHost::new(Os::Windows).with_run_response("py", &["-3", "-c", PROBE], ok("not json"));
        assert_eq!(find_python(&garbled).unwrap(), None);
    }

    #[test]
    fn syntax_check_reports_the_error_line() {
        let host = FakeHost::new(Os::Macos)
            .with_run_response("/usr/bin/python3", &["-c", SYNTAX_CHECK, "/s/good.py"], ok(""))
            .with_run_response(
                "/usr/bin/python3",
                &["-c", SYNTAX_CHECK, "/s/bad.py"],
                CommandOutput {
                    status: 1,
                    stdout: String::new(),
                    stderr: "  File \"/s/bad.py\", line 2\n    x =\n       ^\nSyntaxError: invalid syntax\n".into(),
                },
            );
        let py = Path::new("/usr/bin/python3");
        assert_eq!(syntax_check(&host, py, Path::new("/s/good.py")).unwrap(), None);
        assert_eq!(
            syntax_check(&host, py, Path::new("/s/bad.py")).unwrap().as_deref(),
            Some("SyntaxError: invalid syntax")
        );
        assert!(syntax_check(&host, py, Path::new("/s/unknown.py")).is_err());
    }
}
```

In `lib.rs`: add `pub mod python_env;` (alphabetical).

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core python_env::`
Expected: 3 tests FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

```rust
pub fn find_python(host: &dyn Host) -> Result<Option<PythonInfo>> {
    #[derive(Deserialize)]
    struct Probe {
        executable: PathBuf,
        version: String,
        hedgebuddy: Option<String>,
    }
    let command = launcher(host.os());
    let mut args: Vec<&str> = command[1..].to_vec();
    args.extend(["-c", PROBE]);
    let Ok(out) = host.run(command[0], &args) else {
        return Ok(None);
    };
    if out.status != 0 {
        return Ok(None);
    }
    let Some(line) = out.stdout.lines().rev().find(|l| !l.trim().is_empty()) else {
        return Ok(None);
    };
    let Ok(probe) = serde_json::from_str::<Probe>(line.trim()) else {
        return Ok(None);
    };
    Ok(Some(PythonInfo {
        launcher: command.iter().map(|s| s.to_string()).collect(),
        executable: probe.executable,
        version: probe.version,
        hedgebuddy: probe.hedgebuddy,
    }))
}

pub fn syntax_check(host: &dyn Host, python: &Path, script: &Path) -> Result<Option<String>> {
    let python = python.to_string_lossy();
    let script = script.to_string_lossy();
    let out = host.run(&python, &["-c", SYNTAX_CHECK, &script])?;
    if out.status == 0 {
        return Ok(None);
    }
    let message = out
        .stderr
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("syntax check failed")
        .trim()
        .to_owned();
    Ok(Some(message))
}
```

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test -p hedgebuddy-core python_env::
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 3 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): find the Hedge apps' Python interpreter and syntax-check scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Real-machine smoke test, spec, and changelog

**Files:**
- Create: `crates/core/tests/real_host.rs`
- Modify: `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md` (sections 3, 7), `CHANGELOG.md`, `crates/core/src/lib.rs` (crate docs)

**Interfaces:**
- Consumes: everything from Tasks 1–9 through public paths (`hedgebuddy_core::catalog::Catalog`, `hedgebuddy_core::hedge::Hedge`, `hedgebuddy_core::host::{Host, RealHost}`, `hedgebuddy_core::python_env`, `hedgebuddy_core::volumes`, `hedgebuddy_core::Store`).
- Produces: an `#[ignore]`d, read-only integration test; documentation that matches the implementation.

- [ ] **Step 1: Write the read-only smoke test**

`crates/core/tests/real_host.rs`:
```rust
//! Read-only checks against the real machine. Ignored by default because the
//! results depend on what is installed. Run with:
//!
//! ```text
//! cargo test -p hedgebuddy-core --test real_host -- --ignored --nocapture
//! ```
//!
//! Nothing here writes to the registry, app settings, or the data directory.

use std::sync::Arc;

use hedgebuddy_core::catalog::Catalog;
use hedgebuddy_core::hedge::{Hedge, LogKind};
use hedgebuddy_core::host::{Host, RealHost};
use hedgebuddy_core::{python_env, volumes, Store};

#[test]
#[ignore = "reads the real machine; run with --ignored"]
fn real_host_read_only_smoke() {
    let host = Arc::new(RealHost);
    let vols = host.volumes().unwrap();
    assert!(!vols.is_empty());
    for v in &vols {
        println!("volume {} at {} ({}; removable: {})", v.name, v.mount_point.display(), v.file_system, v.removable);
    }
    if let Some(first) = vols.iter().find(|v| v.removable) {
        println!("inspect {:?}", volumes::inspect_volume(&first.mount_point).map(|r| (r.card, r.clip_count)));
    }

    let hedge = Hedge::new(host.clone(), Catalog::embedded().unwrap());
    for status in hedge.apps().unwrap() {
        println!("app {status:?}");
    }
    let store = Store::at_default().unwrap();
    for app in ["offshoot", "foolcat"] {
        match hedge.attachments(app, &store) {
            Ok(list) => {
                for a in list {
                    println!("{app} {} {:?}", a.event, a.state);
                }
            }
            Err(e) => println!("{app}: {e}"),
        }
    }
    println!("offshoot presets {:?}", hedge.list_presets("offshoot").map(|p| p.len()));
    println!("offshoot selected preset {:?}", hedge.selected_preset("offshoot"));
    println!("offshoot event log tail {:?}", hedge.read_app_log("offshoot", LogKind::Event, 3));
    println!("python {:?}", python_env::find_python(host.as_ref()).unwrap());
}
```

Run: `cargo test -p hedgebuddy-core --test real_host` → `1 ignored`. Then run it for real on the Windows machine: `cargo test -p hedgebuddy-core --test real_host -- --ignored --nocapture`, and paste the output into the report. Expected on the test machine: OffShoot installed with version `26.1 (1023)`, FoolCat installed with `26.1.1 (121)`, and the OffShoot events pointing at the deleted `E:\Coding\hedgebuddy\service\...` scripts reported as `Stale`.

- [ ] **Step 2: Update the spec**

In section 3, replace the macOS bullet under "Where attachments are stored" with:
```markdown
- macOS: OffShoot Helper applies workspace JSON files from `~/Library/Preferences/Hedge/Workspaces/`; a workspace's `setPreferences` object accepts `scripting_opt_in` and `scripting_events_{checkpoint_issue, disk_added, disk_busy, disk_idle, disk_removed, disks_idle, file_copy_completed}` (documented on the Helper page). HedgeBuddy writes `HedgeBuddy.json` there and the operator applies it from the Helper menu, so macOS attachments are reported as *staged*. No keys are documented for OffShoot Started, Transfers Added, or Source Added, or for FoolCat and EditReady; those are attached by hand on macOS.
```
and replace the Presets paragraph's last sentence with: `The active preset name is in the registry value SessionVariableSelectedPreset (observed, undocumented); PresetsLocation overrides the folder. No API selects a preset, and the macOS preset folder is not documented.`

In section 7, replace the example TOML block and the "What core does with it" list with a pointer and a short summary:
```markdown
The authoritative format is `catalog/README.md`, and the shipped files are `catalog/*.toml`. Differences from the first draft of this section: detection uses `registry_key` + `version_value` (Windows) and `app_path` + optional `bundle_id` (macOS); scripting kinds are `registry`, `helper_workspace`, and `manual`; `payload` lists the exact keys scripts receive; commands declare `form = "url"` or `"action"` (actions are batched into one `actions?json=` URL) and `list_separator` for `|`-separated lists; a `[presets.<os>]` section describes the preset folder, its registry override, and preset selection. License commands (`activate`, `deactivate`) and `update` are deliberately absent, and `setPreferences` is not used.

Core uses the catalog through `Hedge`: app status and version warnings, attachment state per event (`attached`, `external`, `stale`, `staged`, `detached`, `manual`, `unsupported`), attach/detach plans applied only by `Hedge::apply`, profile-wide `sync_attachments`, URL commands with callback-log responses, presets, and app log tails.
```

- [ ] **Step 3: Crate docs and changelog**

In `crates/core/src/lib.rs`, append to the crate doc comment (before the first `pub mod`):
```rust
//!
//! Hedge app integration lives in [`hedge::Hedge`] (a [`host::Host`] plus a
//! [`catalog::Catalog`]); every change outside the data directory is planned
//! as a list of [`hedge::Action`]s and executed only by [`hedge::Hedge::apply`].
//! [`volumes::inspect_volume`] and [`python_env::find_python`] cover camera
//! cards and the Python interpreter.
```

In `CHANGELOG.md` under `## Unreleased` → `### Added`, append:
```markdown
- Hedge app catalog (`catalog/*.toml`) for OffShoot, FoolCat, EditReady, and Canister, overridable from `<data>/catalog/`.
- Core Hedge integration: app detection with version warnings, script attachment state, attach/detach with dry runs, profile-wide attachment sync, URL-scheme commands with callback-log responses, OffShoot presets, and app log tails.
- Camera-card volume inspection and Python interpreter discovery.
```

- [ ] **Step 4: Full verification**

```bash
cd E:/Coding/hedgebuddy
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo doc -p hedgebuddy-core --no-deps 2>&1 | grep -i warning || echo "no doc warnings"
(cd python && uv run pytest -q)
python scripts/sync_version.py --check
```
Expected: all green, no doc warnings.

- [ ] **Step 5: Commit**

```bash
git add crates/core docs/superpowers/specs CHANGELOG.md
git commit -m "docs: catalog-driven Hedge integration in spec and changelog; real-host smoke test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (phase 2, integration half, spec section 13 item 2 and sections 3, 7, 8):** catalog with four manifests, embedded and overridable → Task 2; OS integration trait with Windows and macOS implementations and a fake → Task 1; detection and `tested_against` warnings → Task 3; attach, detach, state, with dry runs → Task 4; `sync_attachments` and the catalog check `write_script` needs → Task 5 (`validate_manifest`); commands, chaining, callback log → Task 6; presets and logs (`list_presets`, `write_preset`, `read_app_log`) → Task 7; `list_volumes` (`Host::volumes`) and `inspect_volume` → Tasks 1 and 8; the interpreter for `environment` and the syntax half of `check_script` → Task 9; the open question "do apps re-read attachments live" stays for the manual smoke test in phase 3, when the CLI can attach a real script. The Phase 2A carry-overs (`list_runs_pruned`, `VarValue` conversions, debounced watch) belong to phase 3 and are not here.

**Placeholders:** none; every `todo!()` is replaced in its own task.

**Type consistency:** `Host` methods (T1) are used by name in T3 (`registry_key_exists`, `registry_read`, `app_bundle`), T4 (`registry_read`, `registry_write`, `registry_delete`, `open_url`), T6 (`open_url`), T7 (`registry_read`), T9 (`run`). `Scripting` variants and fields (T2) match their uses in T3, T4. `EventSpec.registry_name` / `pref_name` (T2) drive T4. `CommandSpec::{param_specs, available_on}`, `CommandForm`, `ParamType` (T2) drive T6. `PresetsSpec` fields (T2) drive T7. `Action` variants (T4) are produced by T4, T5, T7 and consumed by `apply` (T4). `managed_script`, `AttachState::{Attached, Staged, Stale}` (T4) are consumed by T5. `Hedge::expand` (T3) is used by T4, T6, T7. Re-exports: `hedge/mod.rs` gains `apps` (T3), `attach` (T4), `sync` (T5), `commands` (T6), `presets` (T7); crate root gains `FakeHost, Host, Os, RealHost` (T1), `Catalog` (T2), `Hedge` (T3).
