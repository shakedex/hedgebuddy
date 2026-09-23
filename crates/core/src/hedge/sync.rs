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

fn push_unique(actions: &mut Vec<Action>, new: Vec<Action>) {
    for a in new {
        if !actions.contains(&a) {
            actions.push(a);
        }
    }
}

fn describe_issues(issues: &[RequirementIssue]) -> String {
    issues
        .iter()
        .map(|i| match i {
            RequirementIssue::Missing { name, ty } => format!("{name} ({} missing)", ty.as_str()),
            RequirementIssue::TypeMismatch {
                name,
                expected,
                actual,
            } => {
                format!(
                    "{name} (is {}, needs {})",
                    actual.as_str(),
                    expected.as_str()
                )
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

impl Hedge {
    /// Attach one script to the app event its manifest names. Refuses scripts
    /// without an app/event, unknown to the catalog, or with unmet
    /// requirements. With `dry_run` the actions are returned but not applied.
    pub fn attach_script(
        &self,
        store: &Store,
        profile: &str,
        script: &str,
        dry_run: bool,
    ) -> Result<Vec<Action>> {
        let check = store.check_script(profile, script)?;
        let manifest = check.manifest.ok_or_else(|| {
            CoreError::Validation(format!(
                "{script} has no manifest; add one naming the app and event"
            ))
        })?;
        let (Some(app), Some(event)) = (manifest.app.as_deref(), manifest.event.as_deref()) else {
            return Err(CoreError::Validation(format!(
                "{script}'s manifest does not name an app and an event"
            )));
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

    /// Detach whatever is attached to an app event.
    pub fn detach_event(&self, app: &str, event: &str, dry_run: bool) -> Result<Vec<Action>> {
        let actions = self.plan_detach(app, event)?;
        if !dry_run {
            self.apply(&actions)?;
        }
        Ok(actions)
    }

    /// Make Hedge app attachments reflect `profile`:
    /// 1. Each of the profile's scripts whose manifest names a known app and
    ///    event, with met requirements, is a candidate; others are skipped.
    /// 2. Two or more candidates for the same app event is a conflict; none
    ///    of them is attached.
    /// 3. A single candidate is attached, unless it already is.
    /// 4. Any other event currently pointing at a HedgeBuddy-managed script
    ///    (any profile) and not claimed by rule 1-2 is detached.
    /// 5. Attach actions run before detach actions; `dry_run = false` applies them.
    pub fn sync_attachments(
        &self,
        store: &Store,
        profile: &str,
        dry_run: bool,
    ) -> Result<SyncReport> {
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

        let mut targets: BTreeMap<(String, String), Vec<String>> = BTreeMap::new();
        for info in scripts {
            if let Some(reason) = info.manifest_error {
                report.skipped.push(SyncSkip {
                    script: info.name,
                    reason,
                });
                continue;
            }
            let Some(manifest) = info.manifest else {
                continue;
            };
            let (Some(app), Some(event)) = (manifest.app.clone(), manifest.event.clone()) else {
                continue;
            };
            if let Err(e) = validate_manifest(&self.catalog, &manifest) {
                report.skipped.push(SyncSkip {
                    script: info.name,
                    reason: e.to_string(),
                });
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
                report.conflicts.push(SyncConflict {
                    app: app.clone(),
                    event: event.clone(),
                    scripts: names.clone(),
                });
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
                    push_unique(&mut report.actions, actions);
                    report.attach.push(SyncItem {
                        app: app.clone(),
                        event: event.clone(),
                        script: script.clone(),
                    });
                }
                Err(CoreError::Unsupported(reason)) => {
                    report.skipped.push(SyncSkip {
                        script: script.clone(),
                        reason,
                    });
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
                    AttachState::Attached { path, .. }
                    | AttachState::Staged { path, .. }
                    | AttachState::Stale { path } => path,
                    _ => continue,
                };
                let Some((other_profile, other_script)) = managed_script(store, &path) else {
                    continue;
                };
                push_unique(&mut report.actions, self.plan_detach(&m.app.id, &e.id)?);
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
        assert!(matches!(
            validate_manifest(&catalog, &m(Some("postlab"), None)).unwrap_err(),
            CoreError::AppNotFound(_)
        ));
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
            .write_script(
                "p",
                "copy.py",
                &script(
                    "FileCopyCompleted",
                    "\"SLACK_WEBHOOK\": {\"type\": \"secret\"}",
                ),
            )
            .unwrap();
        store.write_script("p", "plain.py", "print('x')\n").unwrap();
        store
            .write_script(
                "p",
                "noevent.py",
                "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\"}\n---\n\"\"\"\n",
            )
            .unwrap();

        let unmet = hedge
            .attach_script(&store, "p", "copy.py", false)
            .unwrap_err();
        assert!(
            matches!(&unmet, CoreError::Validation(m) if m.contains("SLACK_WEBHOOK")),
            "{unmet}"
        );
        assert!(matches!(
            hedge
                .attach_script(&store, "p", "plain.py", false)
                .unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            hedge
                .attach_script(&store, "p", "noevent.py", false)
                .unwrap_err(),
            CoreError::Validation(_)
        ));

        store
            .set_variable(
                "p",
                "SLACK_WEBHOOK",
                VariableInput {
                    ty: VarType::Secret,
                    value: Some(json!("https://h")),
                    description: String::new(),
                },
            )
            .unwrap();
        let actions = hedge.attach_script(&store, "p", "copy.py", true).unwrap();
        assert_eq!(actions.len(), 2);
        assert_eq!(
            reg(&fake, "EventScriptFileCopyCompleted"),
            None,
            "dry run must not write"
        );
        hedge.attach_script(&store, "p", "copy.py", false).unwrap();
        assert_eq!(
            reg(&fake, "EventScriptFileCopyCompleted"),
            Some(store.script_path("p", "copy.py").display().to_string())
        );
        hedge
            .detach_event("offshoot", "FileCopyCompleted", true)
            .unwrap();
        assert!(
            reg(&fake, "EventScriptFileCopyCompleted").is_some(),
            "dry run must not delete"
        );
        hedge
            .detach_event("offshoot", "FileCopyCompleted", false)
            .unwrap();
        assert_eq!(reg(&fake, "EventScriptFileCopyCompleted"), None);
    }

    #[test]
    fn sync_attaches_this_profile_and_detaches_others() {
        let (_d, store, fake, hedge) = setup();
        store.create_profile("q", "").unwrap();
        store
            .write_script("q", "q_copy.py", &script("FileCopyCompleted", ""))
            .unwrap();
        store
            .write_script("q", "q_busy.py", &script("DiskBusy", ""))
            .unwrap();
        hedge
            .attach_script(&store, "q", "q_copy.py", false)
            .unwrap();
        hedge
            .attach_script(&store, "q", "q_busy.py", false)
            .unwrap();

        store.create_profile("p", "").unwrap();
        store
            .write_script("p", "copy.py", &script("FileCopyCompleted", ""))
            .unwrap();
        store
            .write_script(
                "p",
                "disk.py",
                &script(
                    "DiskAdded",
                    "\"NOTIFY\": {\"type\": \"bool\", \"default\": true}",
                ),
            )
            .unwrap();
        store
            .write_script("p", "dup1.py", &script("DiskIdle", ""))
            .unwrap();
        store
            .write_script("p", "dup2.py", &script("DiskIdle", ""))
            .unwrap();
        store
            .write_script("p", "bad.py", &script("Nope", ""))
            .unwrap();
        store.write_script("p", "plain.py", "print('x')\n").unwrap();

        let before_busy = reg(&fake, "EventScriptDiskBusy");
        let dry = hedge.sync_attachments(&store, "p", true).unwrap();
        let item = |event: &str, script: &str| SyncItem {
            app: "offshoot".into(),
            event: event.into(),
            script: script.into(),
        };
        assert_eq!(dry.profile, "p");
        assert_eq!(
            dry.attach,
            vec![
                item("DiskAdded", "disk.py"),
                item("FileCopyCompleted", "copy.py")
            ]
        );
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
        assert_eq!(
            reg(&fake, "EventScriptDiskBusy"),
            before_busy,
            "dry run must not write"
        );

        let real = hedge.sync_attachments(&store, "p", false).unwrap();
        assert!(real.applied);
        assert_eq!(
            reg(&fake, "EventScriptFileCopyCompleted"),
            Some(store.script_path("p", "copy.py").display().to_string())
        );
        assert_eq!(
            reg(&fake, "EventScriptDiskAdded"),
            Some(store.script_path("p", "disk.py").display().to_string())
        );
        assert_eq!(reg(&fake, "EventScriptDiskBusy"), None);
        assert_eq!(reg(&fake, "EventScriptDiskIdle"), None);

        let again = hedge.sync_attachments(&store, "p", false).unwrap();
        assert!(
            again.attach.is_empty() && again.detach.is_empty() && again.actions.is_empty(),
            "{again:#?}"
        );
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
            .write_script(
                "p",
                "needs.py",
                &script("DiskAdded", "\"TOKEN\": {\"type\": \"secret\"}"),
            )
            .unwrap();
        let report = hedge.sync_attachments(&store, "p", false).unwrap();
        assert!(report.attach.is_empty());
        assert_eq!(report.skipped.len(), 1);
        assert!(report.skipped[0].reason.contains("TOKEN"));
        assert!(report.detach.is_empty());
        assert_eq!(
            reg(&fake, "EventScriptDiskRemoved"),
            Some(external.display().to_string())
        );
        assert!(matches!(
            hedge.sync_attachments(&store, "ghost", true).unwrap_err(),
            CoreError::ProfileNotFound(_)
        ));
    }
}
