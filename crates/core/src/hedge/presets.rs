//! OffShoot presets and Hedge app log files.

use std::fs;
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use super::{Action, Hedge};
use crate::catalog::PresetsSpec;
use crate::error::{CoreError, Result};
use crate::fs_util;
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
        || name.ends_with('.')
        || name.ends_with(' ')
        || name.chars().any(fs_util::is_forbidden_char)
        || fs_util::is_reserved_name(name);
    if bad {
        Err(CoreError::Validation(format!(
            "preset name '{name}' is not a valid file name"
        )))
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
    let s = |k: &str| {
        obj.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned()
    };
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
        m.presets.get(self.host.os()).ok_or_else(|| {
            CoreError::Unsupported(format!(
                "{} presets are not supported on this platform",
                m.app.name
            ))
        })
    }

    /// The preset folder: the registry override when set, else the catalog's `dir`.
    pub fn presets_dir(&self, app: &str) -> Result<PathBuf> {
        let spec = self.presets_spec(app)?;
        if let (Some(key), Some(value)) = (&spec.registry_key, &spec.location_override_value) {
            match self.host.registry_read(key, value) {
                Ok(Some(RegValue::String(s))) if !s.trim().is_empty() => {
                    return Ok(PathBuf::from(s.trim()))
                }
                Ok(_) => {}
                Err(e) => return Err(e),
            }
        }
        self.expand(&spec.dir)
    }

    /// Every readable preset, sorted by name. Unreadable files are skipped.
    pub fn list_presets(&self, app: &str) -> Result<Vec<Preset>> {
        let dir = self.presets_dir(app)?;
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(CoreError::io(&dir, e)),
        };
        let mut presets: Vec<Preset> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.extension()
                    .is_some_and(|x| x.eq_ignore_ascii_case("hedge"))
            })
            .filter_map(|p| read_preset(&p))
            .collect();
        presets.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(presets)
    }

    /// Write (create or update) a preset. Unknown keys in an existing file are
    /// kept. Run the app's `reloadPresets` command afterwards.
    pub fn plan_write_preset(&self, app: &str, preset: &Preset) -> Result<Vec<Action>> {
        validate_preset_name(&preset.name)?;
        let path = self
            .presets_dir(app)?
            .join(format!("{}.hedge", preset.name));
        let mut obj = if path.is_file() {
            preset_object(&path).ok_or_else(|| {
                CoreError::Validation(format!(
                    "{} exists but is not a valid preset; fix or delete it first",
                    path.display()
                ))
            })?
        } else {
            default_object()
        };
        obj.insert(
            "folderPattern".into(),
            Value::String(preset.folder_pattern.clone()),
        );
        obj.insert(
            "labelPattern".into(),
            Value::String(preset.label_pattern.clone()),
        );
        obj.insert(
            "renamePattern".into(),
            Value::String(preset.rename_pattern.clone()),
        );
        obj.insert("counter".into(), Value::String(preset.counter.clone()));
        obj.insert("flattenFolders".into(), Value::Bool(preset.flatten_folders));
        obj.insert(
            "ignoreEmptyFolders".into(),
            Value::Bool(preset.ignore_empty_folders),
        );
        let mut contents = serde_json::to_string_pretty(&Value::Array(vec![Value::Object(obj)]))
            .expect("JSON values serialize");
        contents.push('\n');
        Ok(vec![Action::WriteFile { path, contents }])
    }

    /// Make an existing preset the selected one.
    ///
    /// Unverified: whether a running OffShoot picks up the new selection or
    /// needs a restart.
    pub fn plan_select_preset(&self, app: &str, name: &str) -> Result<Vec<Action>> {
        validate_preset_name(name)?;
        let spec = self.presets_spec(app)?;
        let (Some(key), Some(value)) = (&spec.registry_key, &spec.selected_value) else {
            return Err(CoreError::Unsupported(format!(
                "selecting a preset is not supported for {app} here"
            )));
        };
        let file = self.presets_dir(app)?.join(format!("{name}.hedge"));
        if !file.is_file() {
            return Err(CoreError::Validation(format!(
                "preset '{name}' does not exist ({})",
                file.display()
            )));
        }
        Ok(vec![Action::RegistrySet {
            key: key.clone(),
            value: value.clone(),
            data: RegValue::String(name.to_owned()),
        }])
    }

    /// The selected preset's name, when the app records one.
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

    /// The last `tail` lines of an app log (empty when the file does not exist yet).
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
            CoreError::Unsupported(format!(
                "{} has no {which} log on this platform",
                m.app.name
            ))
        })?;
        let path = self.expand(template)?;
        const MAX_TAIL_BYTES: u64 = 1_048_576;
        let mut file = match fs::File::open(&path) {
            Ok(f) => f,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(CoreError::io(&path, e)),
        };
        let len = file.metadata().map_err(|e| CoreError::io(&path, e))?.len();
        let start = len.saturating_sub(MAX_TAIL_BYTES);
        if start > 0 {
            file.seek(SeekFrom::Start(start))
                .map_err(|e| CoreError::io(&path, e))?;
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|e| CoreError::io(&path, e))?;
        if start > 0 {
            match bytes.iter().position(|&b| b == b'\n') {
                Some(nl) => {
                    bytes.drain(..=nl);
                }
                None => bytes.clear(),
            }
        }
        let text = String::from_utf8_lossy(&bytes);
        let lines: Vec<&str> = text.lines().collect();
        Ok(lines[lines.len().saturating_sub(tail)..]
            .iter()
            .map(|s| s.to_string())
            .collect())
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
    fn validate_preset_names() {
        for ok in ["A cam", "B-cam 2"] {
            assert!(validate_preset_name(ok).is_ok(), "{ok:?} should be valid");
        }
        for bad in [
            "CON",
            "con",
            "Lpt1",
            "nul.backup",
            "name.",
            "name ",
            "",
            ".hidden",
            "a/b",
            "a:b",
        ] {
            assert!(
                matches!(validate_preset_name(bad), Err(CoreError::Validation(_))),
                "{bad:?} should be invalid"
            );
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
        assert!(
            !presets.join("B cam.hedge").exists(),
            "planning must not write"
        );
        h.apply(&plan).unwrap();
        let written: Value =
            serde_json::from_str(&fs::read_to_string(presets.join("B cam.hedge")).unwrap())
                .unwrap();
        assert_eq!(written[0]["version"], "1.0");
        assert_eq!(written[0]["counter"], "003");
        assert_eq!(written[0]["ignoreEmptyFolders"], true);

        let mut a = h
            .list_presets("offshoot")
            .unwrap()
            .into_iter()
            .find(|p| p.name == "A cam preset")
            .unwrap();
        a.counter = "016".into();
        h.apply(&h.plan_write_preset("offshoot", &a).unwrap())
            .unwrap();
        let updated: Value =
            serde_json::from_str(&fs::read_to_string(presets.join("A cam preset.hedge")).unwrap())
                .unwrap();
        assert_eq!(updated[0]["counter"], "016");
        assert_eq!(updated[0]["extraKey"], 7);

        let mut bad = b_cam();
        bad.name = "../escape".into();
        assert!(matches!(
            h.plan_write_preset("offshoot", &bad).unwrap_err(),
            CoreError::Validation(_)
        ));
    }

    #[test]
    fn write_refuses_to_replace_a_broken_preset() {
        let (_a, presets, _f, h) = setup(FakeHost::new(Os::Windows));
        let mut broken = b_cam();
        broken.name = "broken".into();
        let before = fs::read_to_string(presets.join("broken.hedge")).unwrap();
        assert!(matches!(
            h.plan_write_preset("offshoot", &broken).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert_eq!(
            fs::read_to_string(presets.join("broken.hedge")).unwrap(),
            before
        );
    }

    #[test]
    fn select_writes_the_registry_and_requires_the_file() {
        let (_a, _p, fake, h) = setup(FakeHost::new(Os::Windows));
        assert_eq!(h.selected_preset("offshoot").unwrap(), None);
        h.apply(&h.plan_select_preset("offshoot", "A cam preset").unwrap())
            .unwrap();
        assert_eq!(
            fake.registry_value(KEY, "SessionVariableSelectedPreset"),
            Some(RegValue::String("A cam preset".into()))
        );
        assert_eq!(
            h.selected_preset("offshoot").unwrap().as_deref(),
            Some("A cam preset")
        );
        assert!(matches!(
            h.plan_select_preset("offshoot", "Missing").unwrap_err(),
            CoreError::Validation(_)
        ));
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
        assert!(matches!(
            h.list_presets("offshoot").unwrap_err(),
            CoreError::Unsupported(_)
        ));
        assert!(matches!(
            h.list_presets("foolcat").unwrap_err(),
            CoreError::Unsupported(_)
        ));
    }

    #[test]
    fn app_logs_tail() {
        let (appdata, _p, _f, h) = setup(FakeHost::new(Os::Windows));
        assert!(h
            .read_app_log("offshoot", LogKind::Callback, 10)
            .unwrap()
            .is_empty());
        fs::write(
            appdata.path().join("Hedge").join("Hedge.log"),
            "1\n2\n3\n4\n5\n",
        )
        .unwrap();
        assert_eq!(
            h.read_app_log("offshoot", LogKind::Event, 2).unwrap(),
            vec!["4", "5"]
        );
        assert_eq!(
            h.read_app_log("offshoot", LogKind::Event, 99)
                .unwrap()
                .len(),
            5
        );
        assert!(matches!(
            h.read_app_log("canister", LogKind::Event, 5).unwrap_err(),
            CoreError::Unsupported(_)
        ));
    }

    #[test]
    fn describe_app_reports_the_effective_presets_dir() {
        let shared = tempfile::tempdir().unwrap();
        let (_a, _p, _f, h) = setup(FakeHost::new(Os::Windows).with_registry_value(
            KEY,
            "PresetsLocation",
            RegValue::String(shared.path().display().to_string()),
        ));
        assert_eq!(
            h.describe_app("offshoot").unwrap().files.presets_dir,
            Some(shared.path().to_path_buf())
        );
    }
}
