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
    fn parts(v: &str) -> Vec<u64> {
        let start = v.find(|c: char| c.is_ascii_digit()).unwrap_or(v.len());
        let rest = &v[start..];
        let end = rest
            .find(|c: char| !(c.is_ascii_digit() || c == '.'))
            .unwrap_or(rest.len());
        rest[..end]
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
    /// Status of every catalog app, sorted by id.
    pub fn apps(&self) -> Result<Vec<AppStatus>> {
        Ok(self.catalog.apps().map(|m| self.status_of(m)).collect())
    }

    /// Status of one app.
    pub fn app_status(&self, id: &str) -> Result<AppStatus> {
        Ok(self.status_of(self.catalog.app(id)?))
    }

    /// Status, catalog entry, and resolved files of one app.
    pub fn describe_app(&self, id: &str) -> Result<AppDescription> {
        let manifest = self.catalog.app(id)?;
        let os = self.host.os();
        let files = manifest.files.get(os);
        let mut status = self.status_of(manifest);
        let mut resolve = |t: Option<&String>| match t {
            Some(t) => match self.expand(t) {
                Ok(p) => Some(p),
                Err(e) => {
                    status.warnings.push(e.to_string());
                    None
                }
            },
            None => None,
        };
        let callback_log = resolve(files.and_then(|f| f.callback_log.as_ref()));
        let event_log = resolve(files.and_then(|f| f.event_log.as_ref()));
        let presets_dir = resolve(manifest.presets.get(os).map(|p| &p.dir));
        Ok(AppDescription {
            status,
            manifest: manifest.clone(),
            files: ResolvedFiles {
                callback_log,
                event_log,
                presets_dir,
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
            (
                true,
                Some(Scripting::Registry {
                    key, enable_value, ..
                }),
            ) => match self.host.registry_read(key, enable_value) {
                Ok(Some(RegValue::Dword(v))) => Some(v == 1),
                Ok(_) => Some(false),
                Err(e) => {
                    warnings.push(format!("cannot read {key}\\{enable_value}: {e}"));
                    None
                }
            },
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

    fn detect(
        &self,
        m: &AppManifest,
        os: Os,
        warnings: &mut Vec<String>,
    ) -> (bool, Option<String>) {
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
                let version = match d.version_value.as_ref() {
                    Some(v) => match self.host.registry_read(key, v) {
                        Ok(Some(RegValue::String(s))) => Some(s.trim().to_owned()),
                        Ok(_) => None,
                        Err(e) => {
                            warnings.push(format!("cannot read {key}\\{v}: {e}"));
                            None
                        }
                    },
                    None => None,
                };
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
        assert_eq!(compare_versions("v26.1", "26.1"), Ordering::Equal);
        assert_eq!(compare_versions("OffShoot 26.2", "26.1"), Ordering::Greater);
    }

    #[test]
    fn windows_detection_version_and_scripting_flag() {
        let h = hedge(
            FakeHost::new(Os::Windows)
                .with_registry_value(
                    "HKCU\\Software\\Hedge",
                    "BuildVersion",
                    RegValue::String("26.1 (1023)".into()),
                )
                .with_registry_value(
                    "HKCU\\Software\\Hedge",
                    "EventScriptAllowScripting",
                    RegValue::Dword(1),
                ),
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
        let h = hedge(FakeHost::new(Os::Windows).with_registry_value(
            "HKCU\\Software\\Hedge",
            "BuildVersion",
            RegValue::String("26.2 (1100)".into()),
        ));
        let s = h.app_status("offshoot").unwrap();
        assert!(s.newer_than_tested);
        assert_eq!(s.scripting_enabled, Some(false));
        assert!(
            s.warnings
                .iter()
                .any(|w| w.contains("26.2") && w.contains("26.1")),
            "{:?}",
            s.warnings
        );
    }

    #[test]
    fn macos_detection_uses_the_app_bundle() {
        let h = hedge(
            FakeHost::new(Os::Macos)
                .with_home("/Users/x")
                .with_app_bundle(
                    "/Applications/OffShoot.app",
                    "nl.syncfactory.Hedge.Mac",
                    "26.1",
                )
                .with_app_bundle("/Applications/FoolCat.app", "anything", "26.1.1"),
        );
        let o = h.app_status("offshoot").unwrap();
        assert!(o.installed);
        assert_eq!(o.scripting, ScriptingSupport::HelperWorkspace);
        assert_eq!(o.scripting_enabled, None);
        let f = h.app_status("foolcat").unwrap();
        assert!(
            f.installed,
            "no bundle_id in the catalog means any bundle counts"
        );
        assert_eq!(f.scripting, ScriptingSupport::Manual);

        let wrong = hedge(FakeHost::new(Os::Macos).with_app_bundle(
            "/Applications/OffShoot.app",
            "com.other",
            "1.0",
        ));
        let s = wrong.app_status("offshoot").unwrap();
        assert!(!s.installed);
        assert!(
            s.warnings.iter().any(|w| w.contains("com.other")),
            "{:?}",
            s.warnings
        );
    }

    #[test]
    fn describe_resolves_files() {
        let h =
            hedge(FakeHost::new(Os::Windows).with_env("APPDATA", "C:\\Users\\x\\AppData\\Roaming"));
        let d = h.describe_app("offshoot").unwrap();
        assert_eq!(d.manifest.app.id, "offshoot");
        let slash = |p: Option<PathBuf>| p.map(|p| p.to_string_lossy().replace('\\', "/"));
        assert_eq!(
            slash(d.files.callback_log.clone()).as_deref(),
            Some("C:/Users/x/AppData/Roaming/Hedge/HedgeCallback.log")
        );
        assert_eq!(
            slash(d.files.presets_dir.clone()).as_deref(),
            Some("C:/Users/x/AppData/Roaming/Hedge/Presets")
        );
        assert!(matches!(
            h.describe_app("nope").unwrap_err(),
            crate::error::CoreError::AppNotFound(_)
        ));
        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["status"]["scripting"], "registry");
    }
}
