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
    RegistrySet {
        key: String,
        value: String,
        data: RegValue,
    },
    RegistryDelete {
        key: String,
        value: String,
    },
    WorkspacePrefs {
        path: PathBuf,
        set: Map<String, Value>,
    },
    WriteFile {
        path: PathBuf,
        contents: String,
    },
    OpenUrl {
        url: String,
    },
}

/// What an app event is attached to right now.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AttachState {
    /// A script in this HedgeBuddy data directory.
    Attached {
        path: PathBuf,
        profile: String,
        script: String,
    },
    /// An existing file outside HedgeBuddy.
    External {
        path: PathBuf,
    },
    /// A file that no longer exists.
    Stale {
        path: PathBuf,
    },
    /// Written to the OffShoot Helper workspace; takes effect when the
    /// operator applies that workspace in OffShoot Helper (macOS).
    Staged {
        path: PathBuf,
        workspace: PathBuf,
    },
    Detached,
    /// The operator attaches scripts in the app's own settings.
    Manual {
        note: String,
    },
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
        Some((profile, script)) => AttachState::Attached {
            path,
            profile,
            script,
        },
        None => AttachState::External { path },
    }
}

fn read_workspace(path: &Path) -> Result<Vec<Value>> {
    if !path.exists() {
        return Ok(vec![json!({ "setPreferences": {} })]);
    }
    let text = fs::read_to_string(path).map_err(|e| CoreError::io(path, e))?;
    match serde_json::from_str::<Value>(&text).map_err(|e| CoreError::Json {
        path: path.to_path_buf(),
        source: e,
    })? {
        Value::Array(items) => Ok(items),
        _ => Err(CoreError::Validation(format!(
            "{} is not a workspace (expected a JSON array)",
            path.display()
        ))),
    }
}

fn workspace_prefs(doc: &[Value]) -> Option<&Map<String, Value>> {
    doc.iter()
        .find_map(|v| v.get("setPreferences").and_then(Value::as_object))
}

fn merge_workspace(path: &Path, set: &Map<String, Value>) -> Result<()> {
    let mut doc = read_workspace(path)?;
    let index = match doc
        .iter()
        .position(|v| v.get("setPreferences").is_some_and(Value::is_object))
    {
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

    /// Attachment state of one event.
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
            Some(Scripting::Registry {
                key, value_pattern, ..
            }) => {
                let Some(name) = &e.registry_name else {
                    return Ok(AttachState::Unsupported);
                };
                let value = value_pattern.replace("{registry_name}", name);
                match self.host.registry_read(key, &value)? {
                    Some(RegValue::String(s)) if !s.trim().is_empty() => {
                        Ok(classify(store, PathBuf::from(s.trim())))
                    }
                    _ => Ok(AttachState::Detached),
                }
            }
            Some(Scripting::HelperWorkspace {
                workspace_dir,
                workspace_file,
                pref_pattern,
                ..
            }) => {
                let Some(name) = &e.pref_name else {
                    return Ok(AttachState::Unsupported);
                };
                let workspace = self.expand(workspace_dir)?.join(workspace_file);
                let key = pref_pattern.replace("{pref_name}", name);
                let doc = read_workspace(&workspace)?;
                match workspace_prefs(&doc)
                    .and_then(|p| p.get(&key))
                    .and_then(Value::as_str)
                {
                    Some(s) if !s.is_empty() => Ok(AttachState::Staged {
                        path: PathBuf::from(s),
                        workspace,
                    }),
                    _ => Ok(AttachState::Detached),
                }
            }
        }
    }

    /// The actions that attach `script_path` to `app`'s `event`. Reads only.
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
            return Err(CoreError::Validation(format!(
                "script {target} does not exist"
            )));
        }
        match m.scripting.get(self.host.os()) {
            Some(Scripting::Registry {
                key,
                enable_value,
                value_pattern,
            }) => {
                let name = e.registry_name.as_ref().ok_or_else(|| no_location(m, e))?;
                Ok(vec![
                    Action::RegistrySet {
                        key: key.clone(),
                        value: enable_value.clone(),
                        data: RegValue::Dword(1),
                    },
                    Action::RegistrySet {
                        key: key.clone(),
                        value: value_pattern.replace("{registry_name}", name),
                        data: RegValue::String(target),
                    },
                ])
            }
            Some(Scripting::HelperWorkspace {
                workspace_dir,
                workspace_file,
                enable_pref,
                pref_pattern,
            }) => {
                let name = e.pref_name.as_ref().ok_or_else(|| no_location(m, e))?;
                let mut set = Map::new();
                set.insert(enable_pref.clone(), Value::Bool(true));
                set.insert(
                    pref_pattern.replace("{pref_name}", name),
                    Value::String(target),
                );
                Ok(vec![Action::WorkspacePrefs {
                    path: self.expand(workspace_dir)?.join(workspace_file),
                    set,
                }])
            }
            _ => unreachable!("manual and missing scripting returned above"),
        }
    }

    /// The actions that detach whatever is attached to `app`'s `event`. Reads only.
    pub fn plan_detach(&self, app: &str, event: &str) -> Result<Vec<Action>> {
        let m = self.catalog.app(app)?;
        let e = m.event(event)?;
        match m.scripting.get(self.host.os()) {
            Some(Scripting::Registry {
                key, value_pattern, ..
            }) => {
                let name = e.registry_name.as_ref().ok_or_else(|| no_location(m, e))?;
                Ok(vec![Action::RegistryDelete {
                    key: key.clone(),
                    value: value_pattern.replace("{registry_name}", name),
                }])
            }
            Some(Scripting::HelperWorkspace {
                workspace_dir,
                workspace_file,
                pref_pattern,
                ..
            }) => {
                let name = e.pref_name.as_ref().ok_or_else(|| no_location(m, e))?;
                let mut set = Map::new();
                set.insert(
                    pref_pattern.replace("{pref_name}", name),
                    Value::String(String::new()),
                );
                Ok(vec![Action::WorkspacePrefs {
                    path: self.expand(workspace_dir)?.join(workspace_file),
                    set,
                }])
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

    /// Execute actions in order, stopping at the first failure.
    pub fn apply(&self, actions: &[Action]) -> Result<()> {
        for action in actions {
            match action {
                Action::RegistrySet { key, value, data } => {
                    self.host.registry_write(key, value, data)?
                }
                Action::RegistryDelete { key, value } => self.host.registry_delete(key, value)?,
                Action::WorkspacePrefs { path, set } => merge_workspace(path, set)?,
                Action::WriteFile { path, contents } => {
                    fs_util::write_atomic(path, contents.as_bytes(), false)?
                }
                Action::OpenUrl { url } => self.host.open_url(url)?,
            }
        }
        Ok(())
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
        let plan = hedge
            .plan_attach("offshoot", "FileCopyCompleted", &path)
            .unwrap();
        assert_eq!(
            plan,
            vec![
                Action::RegistrySet {
                    key: KEY.into(),
                    value: "EventScriptAllowScripting".into(),
                    data: RegValue::Dword(1)
                },
                Action::RegistrySet {
                    key: KEY.into(),
                    value: "EventScriptFileCopyCompleted".into(),
                    data: RegValue::String(path.display().to_string()),
                },
            ]
        );
        assert_eq!(
            fake.registry_value(KEY, "EventScriptFileCopyCompleted"),
            None,
            "planning must not write"
        );
        hedge.apply(&plan).unwrap();
        assert_eq!(
            fake.registry_value(KEY, "EventScriptAllowScripting"),
            Some(RegValue::Dword(1))
        );
        assert_eq!(
            hedge
                .attachment("offshoot", "FileCopyCompleted", &store)
                .unwrap()
                .state,
            AttachState::Attached {
                path: path.clone(),
                profile: "p".into(),
                script: "copy.py".into()
            }
        );
        let detach = hedge.plan_detach("offshoot", "FileCopyCompleted").unwrap();
        assert_eq!(
            detach,
            vec![Action::RegistryDelete {
                key: KEY.into(),
                value: "EventScriptFileCopyCompleted".into()
            }]
        );
        hedge.apply(&detach).unwrap();
        assert_eq!(
            hedge
                .attachment("offshoot", "FileCopyCompleted", &store)
                .unwrap()
                .state,
            AttachState::Detached
        );
    }

    #[test]
    fn registry_states_stale_external_and_internal_names() {
        let outside = tempfile::tempdir().unwrap();
        let external = outside.path().join("mine.py");
        fs::write(&external, "print(1)\n").unwrap();
        let (_d, store, _fake, hedge) = setup(
            FakeHost::new(Os::Windows)
                .with_registry_value(
                    KEY,
                    "EventScriptDiskAdded",
                    RegValue::String("E:\\gone\\x.py".into()),
                )
                .with_registry_value(
                    KEY,
                    "EventScriptDiskIdle",
                    RegValue::String(external.display().to_string()),
                )
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
        assert_eq!(
            state("DiskAdded"),
            AttachState::Stale {
                path: PathBuf::from("E:\\gone\\x.py")
            }
        );
        assert_eq!(
            state("DiskIdle"),
            AttachState::External {
                path: external.clone()
            }
        );
        assert_eq!(state("DiskBusy"), AttachState::Detached);
        assert!(matches!(
            state("VerificationIssue"),
            AttachState::Attached { .. }
        ));
        assert_eq!(state("SourceAdded"), AttachState::Unsupported);
        assert_eq!(state("OffShootStarted"), AttachState::Detached);
    }

    #[test]
    fn unsupported_manual_and_missing_script() {
        let (_d, store, _fake, hedge) = setup(FakeHost::new(Os::Windows));
        let path = store.script_path("p", "copy.py");
        assert!(matches!(
            hedge
                .plan_attach("offshoot", "SourceAdded", &path)
                .unwrap_err(),
            CoreError::Unsupported(_)
        ));
        assert!(matches!(
            hedge
                .plan_attach(
                    "offshoot",
                    "DiskAdded",
                    &store.script_path("p", "missing.py")
                )
                .unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            hedge.plan_attach("offshoot", "Nope", &path).unwrap_err(),
            CoreError::EventNotFound { .. }
        ));
        let manual = hedge
            .plan_attach("editready", "FileConversionCompleted", &path)
            .unwrap_err();
        assert!(
            matches!(&manual, CoreError::Unsupported(m) if m.contains("Scripting settings") && m.contains("copy.py")),
            "{manual}"
        );
        assert!(matches!(
            hedge
                .attachment("editready", "FileConversionCompleted", &store)
                .unwrap()
                .state,
            AttachState::Manual { .. }
        ));
        assert!(hedge.attachments("canister", &store).unwrap().is_empty());
    }

    #[test]
    fn macos_helper_workspace_is_merged_and_staged() {
        let home = tempfile::tempdir().unwrap();
        let (_d, store, _fake, hedge) = setup(FakeHost::new(Os::Macos).with_home(home.path()));
        let workspace = home
            .path()
            .join("Library/Preferences/Hedge/Workspaces/HedgeBuddy.json");
        fs::create_dir_all(workspace.parent().unwrap()).unwrap();
        fs::write(
            &workspace,
            r#"[{"setSources": ["/Volumes/X"], "setPreferences": {"transfers_verification_mode": "source"}}]"#,
        )
        .unwrap();
        let path = store.script_path("p", "copy.py");
        let plan = hedge
            .plan_attach("offshoot", "FileCopyCompleted", &path)
            .unwrap();
        let mut set = Map::new();
        set.insert("scripting_opt_in".into(), Value::Bool(true));
        set.insert(
            "scripting_events_file_copy_completed".into(),
            Value::String(path.display().to_string()),
        );
        assert_eq!(
            plan,
            vec![Action::WorkspacePrefs {
                path: workspace.clone(),
                set
            }]
        );
        hedge.apply(&plan).unwrap();
        let doc: Value = serde_json::from_str(&fs::read_to_string(&workspace).unwrap()).unwrap();
        assert_eq!(doc[0]["setSources"], json!(["/Volumes/X"]));
        assert_eq!(
            doc[0]["setPreferences"]["transfers_verification_mode"],
            "source"
        );
        assert_eq!(doc[0]["setPreferences"]["scripting_opt_in"], true);
        assert_eq!(
            hedge
                .attachment("offshoot", "FileCopyCompleted", &store)
                .unwrap()
                .state,
            AttachState::Staged {
                path: path.clone(),
                workspace: workspace.clone()
            }
        );
        assert_eq!(
            hedge
                .attachment("offshoot", "TransfersAdded", &store)
                .unwrap()
                .state,
            AttachState::Unsupported
        );
        hedge
            .apply(&hedge.plan_detach("offshoot", "FileCopyCompleted").unwrap())
            .unwrap();
        assert_eq!(
            hedge
                .attachment("offshoot", "FileCopyCompleted", &store)
                .unwrap()
                .state,
            AttachState::Detached
        );
        assert!(matches!(
            hedge
                .attachment("foolcat", "ReportCreated", &store)
                .unwrap()
                .state,
            AttachState::Manual { .. }
        ));
    }

    #[test]
    fn workspace_is_created_when_missing() {
        let home = tempfile::tempdir().unwrap();
        let (_d, store, _fake, hedge) = setup(FakeHost::new(Os::Macos).with_home(home.path()));
        hedge
            .apply(
                &hedge
                    .plan_attach("offshoot", "DiskAdded", &store.script_path("p", "copy.py"))
                    .unwrap(),
            )
            .unwrap();
        let workspace = home
            .path()
            .join("Library/Preferences/Hedge/Workspaces/HedgeBuddy.json");
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
        assert_eq!(
            managed_script(&store, &store.profile_dir("p").join("profile.json")),
            None
        );
    }

    #[test]
    fn actions_serialize_with_a_tag() {
        let a = Action::OpenUrl {
            url: "offshoot://open".into(),
        };
        assert_eq!(
            serde_json::to_value(&a).unwrap(),
            json!({"action": "open_url", "url": "offshoot://open"})
        );
        let s = AttachState::Stale {
            path: PathBuf::from("x"),
        };
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            json!({"state": "stale", "path": "x"})
        );
    }
}
