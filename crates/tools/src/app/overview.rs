//! What the Variables, Scripts and Hedge apps screens list (spec §6.3–§6.5),
//! computed here so the screens never re-derive catalog, registry or
//! requirement rules.

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

use hedgebuddy_core::hedge::{
    managed_script, validate_manifest, AppStatus, AttachState, EventAttachment,
};
use hedgebuddy_core::{Manifest, Os, RequirementIssue, Store, VarType};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::scripts::{runs_script, AppEvent};
use crate::variables::{var_view, VarView};
use crate::{Context, NoParams, ToolError};

/// Arguments of the overviews that read one profile.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileArgs {
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
}

/// Result of `variables_overview`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct VariablesOverview {
    /// Profile name.
    pub profile: String,
    /// Its variables, sorted by name; secret values are masked.
    pub variables: Vec<VarView>,
    /// Every variable its scripts require, sorted by name.
    pub requirements: Vec<RequirementRow>,
}

/// One variable the profile's scripts require.
#[derive(Debug, Serialize, JsonSchema)]
pub struct RequirementRow {
    /// Variable name.
    pub name: String,
    /// The type the first script requiring it asks for.
    #[serde(rename = "type")]
    pub ty: VarType,
    /// The first non-empty description a script gives it.
    pub description: String,
    /// Whether any script requiring it gives a default.
    pub has_default: bool,
    /// The scripts that require it, sorted by script name.
    pub required_by: Vec<ScriptTarget>,
    /// Whether the profile meets it.
    pub state: RequirementState,
    /// The type the profile declares, for a type mismatch.
    pub actual: Option<VarType>,
}

/// A script and the app event its manifest names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct ScriptTarget {
    /// Script file name.
    pub script: String,
    /// The manifest's app id, if any.
    pub app: Option<String>,
    /// The manifest's event id, if any.
    pub event: Option<String>,
}

/// Whether the profile meets a requirement, across every script that has it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RequirementState {
    /// The profile has a value of the required type.
    Set,
    /// The profile has no value, and a script that requires it gives no default.
    Missing,
    /// The profile declares it with another type.
    TypeMismatch,
    /// The profile has no value; every script that requires it uses its default.
    Defaulted,
}

/// Result of `scripts_overview`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ScriptsOverview {
    /// Profile name.
    pub profile: String,
    /// Its scripts, sorted by name.
    pub scripts: Vec<ScriptRow>,
}

/// One script, and what its target event runs now.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ScriptRow {
    /// Script file name.
    pub name: String,
    /// The script's absolute path.
    pub path: PathBuf,
    /// The parsed manifest, or null when the script has none or it does not parse.
    pub manifest: Option<Manifest>,
    /// Why the manifest block does not parse, if so.
    pub manifest_error: Option<String>,
    /// The app event the manifest targets, when it names a catalog app and event.
    pub target: Option<TargetEvent>,
    /// Why the manifest's app or event is not in the catalog, if so.
    pub catalog_error: Option<String>,
    /// What the target event runs now.
    pub attachment: TargetAttachment,
    /// Every app event attached to (or staged for) this script, across all apps.
    pub attached_to: Vec<AppEvent>,
    /// Requirements the profile does not meet.
    pub unmet: Vec<RequirementIssue>,
}

/// The catalog app event a script's manifest targets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct TargetEvent {
    /// Catalog app id.
    pub app: String,
    /// The app's display name.
    pub app_name: String,
    /// Event id.
    pub event: String,
}

/// What a script's target event runs now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum TargetAttachment {
    /// The manifest names no catalog app event.
    NoTarget,
    /// The event runs this script.
    Attached,
    /// This script is written to the OffShoot Helper workspace for the event;
    /// it takes effect when the operator applies that workspace (macOS).
    Staged,
    /// The event runs (or is staged for) another HedgeBuddy script.
    OtherScript {
        /// That script's profile.
        profile: String,
        /// That script's file name.
        script: String,
    },
    /// The event runs a file outside HedgeBuddy.
    External {
        /// The file.
        path: PathBuf,
    },
    /// The event points at a file that no longer exists.
    Stale {
        /// The missing file.
        path: PathBuf,
    },
    /// Nothing is attached to the event.
    Free,
    /// The operator attaches scripts in the app's own settings.
    Manual {
        /// What to do there, from the catalog.
        note: String,
    },
    /// No known attachment location for the event on this platform.
    Unsupported,
    /// The app's attachments could not be read.
    Unknown {
        /// Why.
        error: String,
    },
}

/// Result of `apps_overview`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct AppsOverview {
    /// The platform HedgeBuddy runs on.
    pub os: Os,
    /// Every catalog app, sorted by id.
    pub apps: Vec<AppRow>,
}

/// One Hedge app.
#[derive(Debug, Serialize, JsonSchema)]
pub struct AppRow {
    /// Whether it is installed, its version and its scripting support.
    pub status: AppStatus,
    /// Whether the catalog knows how to find it on this platform.
    pub available_here: bool,
    /// Its documentation page.
    pub docs: String,
    /// Its scripting events, in catalog order.
    pub events: Vec<AppEventInfo>,
    /// Events that run a file: attached, staged or external (0 when its
    /// attachments cannot be read).
    pub attached: usize,
    /// Events that point at a file that no longer exists (0 when its
    /// attachments cannot be read).
    pub stale: usize,
}

/// One scripting event of an app.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct AppEventInfo {
    /// Event id.
    pub id: String,
    /// What the event is, from the catalog.
    pub description: String,
}

/// A profile's variables, and every variable its scripts require with
/// whether the profile meets it. Secret values are masked.
pub fn variables_overview(
    ctx: &Context,
    args: ProfileArgs,
) -> Result<VariablesOverview, ToolError> {
    let profile = ctx.profile(args.profile.as_deref())?;
    let resolved = ctx.store.list_variables(&profile)?;
    let valued: BTreeSet<&str> = resolved
        .iter()
        .filter(|v| v.value.is_some())
        .map(|v| v.name.as_str())
        .collect();

    let mut rows: BTreeMap<String, RequirementRow> = BTreeMap::new();
    for info in ctx.store.list_scripts(&profile)? {
        if info.manifest.is_none() {
            continue;
        }
        // The manifest and its issues come from one read of the script.
        let check = ctx.store.check_script(&profile, &info.name)?;
        let Some(manifest) = check.manifest else {
            continue;
        };
        for (name, req) in &manifest.requires {
            let row = rows.entry(name.clone()).or_insert_with(|| RequirementRow {
                name: name.clone(),
                ty: req.ty,
                description: String::new(),
                has_default: false,
                required_by: Vec::new(),
                state: RequirementState::Set,
                actual: None,
            });
            if row.description.is_empty() {
                row.description.clone_from(&req.description);
            }
            row.has_default |= req.default.is_some();
            row.required_by.push(ScriptTarget {
                script: info.name.clone(),
                app: manifest.app.clone(),
                event: manifest.event.clone(),
            });
        }
        for issue in check.issues {
            match issue {
                RequirementIssue::TypeMismatch { name, actual, .. } => {
                    if let Some(row) = rows.get_mut(&name) {
                        row.state = RequirementState::TypeMismatch;
                        row.actual = Some(actual);
                    }
                }
                RequirementIssue::Missing { name, .. } => {
                    if let Some(row) = rows
                        .get_mut(&name)
                        .filter(|r| r.state != RequirementState::TypeMismatch)
                    {
                        row.state = RequirementState::Missing;
                    }
                }
            }
        }
    }
    for row in rows.values_mut() {
        if row.state == RequirementState::Set && !valued.contains(row.name.as_str()) {
            row.state = RequirementState::Defaulted;
        }
    }

    Ok(VariablesOverview {
        variables: resolved.iter().map(|v| var_view(v, false)).collect(),
        requirements: rows.into_values().collect(),
        profile,
    })
}

/// A profile's scripts, each with its manifest, its target event, what that
/// event runs now, the events attached to it and its unmet requirements.
pub fn scripts_overview(ctx: &Context, args: ProfileArgs) -> Result<ScriptsOverview, ToolError> {
    let profile = ctx.profile(args.profile.as_deref())?;
    let catalog = ctx.hedge.catalog();
    // Every app's attachments, read once for all scripts.
    let attachments: BTreeMap<&str, Result<Vec<EventAttachment>, String>> = catalog
        .apps()
        .map(|m| {
            let list = ctx
                .hedge
                .attachments(&m.app.id, &ctx.store)
                .map_err(|e| e.to_string());
            (m.app.id.as_str(), list)
        })
        .collect();

    let mut scripts = Vec::new();
    for info in ctx.store.list_scripts(&profile)? {
        let (target, catalog_error) = match &info.manifest {
            None => (None, None),
            Some(m) => match validate_manifest(catalog, m) {
                Err(e) => (None, Some(e.to_string())),
                Ok(()) => match (&m.app, &m.event) {
                    (Some(app), Some(event)) => {
                        let target = TargetEvent {
                            app: app.clone(),
                            app_name: catalog.app(app)?.app.name.clone(),
                            event: event.clone(),
                        };
                        (Some(target), None)
                    }
                    _ => (None, None),
                },
            },
        };
        let attachment = match &target {
            None => TargetAttachment::NoTarget,
            Some(t) => match attachments.get(t.app.as_str()) {
                Some(Err(error)) => TargetAttachment::Unknown {
                    error: error.clone(),
                },
                Some(Ok(list)) => match list.iter().find(|a| a.event == t.event) {
                    Some(a) => target_attachment(&ctx.store, &a.state, &profile, &info.name),
                    None => TargetAttachment::Unknown {
                        error: format!("{} has no event {}", t.app_name, t.event),
                    },
                },
                None => TargetAttachment::Unknown {
                    error: format!("app '{}' is not in the catalog", t.app),
                },
            },
        };
        let attached_to = attachments
            .values()
            .filter_map(|list| list.as_ref().ok())
            .flatten()
            .filter(|a| runs_script(&ctx.store, a, &profile, &info.name))
            .map(|a| AppEvent {
                app: a.app.clone(),
                event: a.event.clone(),
            })
            .collect();
        let unmet = if info.manifest.is_some() {
            ctx.store.check_script(&profile, &info.name)?.issues
        } else {
            Vec::new()
        };
        scripts.push(ScriptRow {
            path: ctx.store.script_path(&profile, &info.name),
            name: info.name,
            manifest: info.manifest,
            manifest_error: info.manifest_error,
            target,
            catalog_error,
            attachment,
            attached_to,
            unmet,
        });
    }
    Ok(ScriptsOverview { profile, scripts })
}

/// What a target event's `state` means for `profile/script`.
fn target_attachment(
    store: &Store,
    state: &AttachState,
    profile: &str,
    script: &str,
) -> TargetAttachment {
    let this = |p: &str, s: &str| p == profile && s == script;
    match state {
        AttachState::Attached {
            profile: p,
            script: s,
            ..
        } if this(p, s) => TargetAttachment::Attached,
        AttachState::Attached {
            profile: p,
            script: s,
            ..
        } => TargetAttachment::OtherScript {
            profile: p.clone(),
            script: s.clone(),
        },
        AttachState::Staged { path, .. } => match managed_script(store, path) {
            Some((p, s)) if this(&p, &s) => TargetAttachment::Staged,
            Some((profile, script)) => TargetAttachment::OtherScript { profile, script },
            None => TargetAttachment::External { path: path.clone() },
        },
        AttachState::External { path } => TargetAttachment::External { path: path.clone() },
        AttachState::Stale { path } => TargetAttachment::Stale { path: path.clone() },
        AttachState::Detached => TargetAttachment::Free,
        AttachState::Manual { note } => TargetAttachment::Manual { note: note.clone() },
        AttachState::Unsupported => TargetAttachment::Unsupported,
    }
}

/// Every catalog app with its status, whether it can exist on this
/// platform, its docs and events, and how many of its events run a file or
/// point at a missing one.
pub fn apps_overview(ctx: &Context, _: NoParams) -> Result<AppsOverview, ToolError> {
    let os = ctx.hedge.host().os();
    let mut apps = Vec::new();
    for status in ctx.hedge.apps()? {
        let manifest = ctx.hedge.catalog().app(&status.id)?;
        let (mut attached, mut stale) = (0, 0);
        if let Ok(list) = ctx.hedge.attachments(&status.id, &ctx.store) {
            for a in &list {
                match a.state {
                    AttachState::Attached { .. }
                    | AttachState::Staged { .. }
                    | AttachState::External { .. } => attached += 1,
                    AttachState::Stale { .. } => stale += 1,
                    _ => {}
                }
            }
        }
        apps.push(AppRow {
            available_here: manifest.detect.get(os).is_some(),
            docs: manifest.app.docs.clone(),
            events: manifest
                .events
                .iter()
                .map(|e| AppEventInfo {
                    id: e.id.clone(),
                    description: e.description.clone(),
                })
                .collect(),
            attached,
            stale,
            status,
        });
    }
    Ok(AppsOverview { os, apps })
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::RegValue;
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use super::*;
    use crate::app::checked;
    use crate::{call, test_ctx};

    const KEY: &str = "HKCU\\Software\\Hedge";
    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\", \"requires\": {\"CLIENT_EMAIL\": {\"type\": \"string\", \"description\": \"Who gets the report\"}, \"HOOK\": {\"type\": \"secret\"}, \"RETRIES\": {\"type\": \"int\", \"default\": 3}, \"NOTIFY\": {\"type\": \"bool\"}}}\n---\n\"\"\"\n";
    const DISK: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"DiskAdded\", \"requires\": {\"CLIENT_EMAIL\": {\"type\": \"string\"}}}\n---\n\"\"\"\n";

    fn host() -> FakeHost {
        FakeHost::new(Os::Windows)
            .with_registry_value(KEY, "BuildVersion", RegValue::String("26.1 (1023)".into()))
            .with_registry_value(KEY, "EventScriptAllowScripting", RegValue::Dword(1))
            .with_registry_value(
                KEY,
                "EventScriptDiskIdle",
                RegValue::String("E:\\gone\\idle.py".into()),
            )
    }

    #[test]
    fn variables_list_every_requirement_with_its_state() {
        let (_d, _f, ctx) = test_ctx(host());
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(
            &ctx,
            "set_var",
            json!({"name": "HOOK", "type": "secret", "value": "https://hook"}),
        )
        .unwrap();
        call(
            &ctx,
            "set_var",
            json!({"name": "NOTIFY", "type": "string", "value": "yes"}),
        )
        .unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": COPY}),
        )
        .unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "disk.py", "source": DISK}),
        )
        .unwrap();
        let o = checked(
            "variables_overview",
            variables_overview(&ctx, ProfileArgs::default()).unwrap(),
        );
        assert_eq!(o.profile, "p");
        assert!(
            !serde_json::to_string(&o).unwrap().contains("https://hook"),
            "secrets stay masked"
        );
        let row = |n: &str| o.requirements.iter().find(|r| r.name == n).unwrap();
        assert_eq!(row("CLIENT_EMAIL").state, RequirementState::Missing);
        assert_eq!(row("CLIENT_EMAIL").description, "Who gets the report");
        assert_eq!(
            row("CLIENT_EMAIL")
                .required_by
                .iter()
                .map(|s| s.script.as_str())
                .collect::<Vec<_>>(),
            ["copy.py", "disk.py"]
        );
        assert_eq!(row("HOOK").state, RequirementState::Set);
        assert_eq!(row("RETRIES").state, RequirementState::Defaulted);
        assert!(row("RETRIES").has_default);
        assert_eq!(row("NOTIFY").state, RequirementState::TypeMismatch);
        assert_eq!(row("NOTIFY").actual, Some(VarType::String));
        assert_eq!(o.variables.len(), 2);
    }

    #[test]
    fn scripts_show_what_their_target_event_runs() {
        let (_d, _f, ctx) = test_ctx(host());
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let plain_copy = COPY.replace(", \"requires\": {\"CLIENT_EMAIL\": {\"type\": \"string\", \"description\": \"Who gets the report\"}, \"HOOK\": {\"type\": \"secret\"}, \"RETRIES\": {\"type\": \"int\", \"default\": 3}, \"NOTIFY\": {\"type\": \"bool\"}}", "");
        call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": plain_copy}),
        )
        .unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "disk.py", "source": DISK}),
        )
        .unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "notes.py", "source": "print('x')\n"}),
        )
        .unwrap();
        call(&ctx, "attach_script", json!({"name": "copy.py"})).unwrap();
        let o = checked(
            "scripts_overview",
            scripts_overview(&ctx, ProfileArgs::default()).unwrap(),
        );
        let row = |n: &str| o.scripts.iter().find(|s| s.name == n).unwrap();
        assert!(matches!(
            row("copy.py").attachment,
            TargetAttachment::Attached
        ));
        assert_eq!(
            row("copy.py").attached_to,
            vec![AppEvent {
                app: "offshoot".into(),
                event: "FileCopyCompleted".into()
            }]
        );
        assert_eq!(row("copy.py").target.as_ref().unwrap().app_name, "OffShoot");
        assert_eq!(row("copy.py").path, ctx.store.script_path("p", "copy.py"));
        assert!(matches!(row("disk.py").attachment, TargetAttachment::Free));
        assert_eq!(row("disk.py").unmet.len(), 1);
        assert!(matches!(
            row("notes.py").attachment,
            TargetAttachment::NoTarget
        ));
    }

    fn targeting(event: &str) -> String {
        format!("\"\"\"\n{{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"{event}\"}}\n---\n\"\"\"\n")
    }

    #[test]
    fn other_scripts_external_files_and_stale_paths_are_told_apart() {
        let own = tempfile::NamedTempFile::new().unwrap();
        let (_d, _f, ctx) = test_ctx(host().with_registry_value(
            KEY,
            "EventScriptDiskBusy",
            RegValue::String(own.path().display().to_string()),
        ));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        for (name, event) in [
            ("copy.py", "FileCopyCompleted"),
            ("copy_too.py", "FileCopyCompleted"),
            ("idle.py", "DiskIdle"),
            ("busy.py", "DiskBusy"),
        ] {
            let source = targeting(event);
            call(
                &ctx,
                "write_script",
                json!({"name": name, "source": source}),
            )
            .unwrap();
        }
        // write_script refuses an unknown event, so write the file directly.
        std::fs::write(ctx.store.script_path("p", "bad.py"), targeting("Nope")).unwrap();
        call(&ctx, "attach_script", json!({"name": "copy.py"})).unwrap();
        let o = checked(
            "scripts_overview",
            scripts_overview(&ctx, ProfileArgs::default()).unwrap(),
        );
        let row = |n: &str| o.scripts.iter().find(|s| s.name == n).unwrap();
        assert_eq!(
            row("copy_too.py").attachment,
            TargetAttachment::OtherScript {
                profile: "p".into(),
                script: "copy.py".into()
            }
        );
        assert!(row("copy_too.py").attached_to.is_empty());
        assert_eq!(
            row("idle.py").attachment,
            TargetAttachment::Stale {
                path: "E:\\gone\\idle.py".into()
            }
        );
        assert_eq!(
            row("busy.py").attachment,
            TargetAttachment::External {
                path: own.path().to_path_buf()
            }
        );
        assert!(row("bad.py")
            .catalog_error
            .as_deref()
            .unwrap()
            .contains("Nope"));
        assert_eq!(row("bad.py").target, None);
        assert_eq!(row("bad.py").attachment, TargetAttachment::NoTarget);
    }

    #[test]
    fn a_staged_script_and_an_unreadable_workspace_on_macos() {
        let home = tempfile::tempdir().unwrap();
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Macos).with_home(home.path()));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let source = targeting("FileCopyCompleted");
        call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": source}),
        )
        .unwrap();
        call(&ctx, "attach_script", json!({"name": "copy.py"})).unwrap();
        let o = checked(
            "scripts_overview",
            scripts_overview(&ctx, ProfileArgs::default()).unwrap(),
        );
        assert_eq!(o.scripts[0].attachment, TargetAttachment::Staged);
        assert_eq!(o.scripts[0].attached_to.len(), 1);
        let apps = checked(
            "apps_overview",
            apps_overview(&ctx, crate::NoParams {}).unwrap(),
        );
        let offshoot = apps
            .apps
            .iter()
            .find(|a| a.status.id == "offshoot")
            .unwrap();
        assert_eq!((offshoot.attached, offshoot.stale), (1, 0));

        let workspace = home
            .path()
            .join("Library/Preferences/Hedge/Workspaces/HedgeBuddy.json");
        std::fs::write(&workspace, "not json").unwrap();
        let o = checked(
            "scripts_overview",
            scripts_overview(&ctx, ProfileArgs::default()).unwrap(),
        );
        assert!(matches!(
            o.scripts[0].attachment,
            TargetAttachment::Unknown { .. }
        ));
        assert!(o.scripts[0].attached_to.is_empty());
        let apps = checked(
            "apps_overview",
            apps_overview(&ctx, crate::NoParams {}).unwrap(),
        );
        let offshoot = apps
            .apps
            .iter()
            .find(|a| a.status.id == "offshoot")
            .unwrap();
        assert_eq!((offshoot.attached, offshoot.stale), (0, 0));
    }

    #[test]
    fn apps_count_attached_and_stale_events() {
        let (_d, _f, ctx) = test_ctx(host());
        let o = checked(
            "apps_overview",
            apps_overview(&ctx, crate::NoParams {}).unwrap(),
        );
        assert_eq!(o.os, Os::Windows);
        let offshoot = o.apps.iter().find(|a| a.status.id == "offshoot").unwrap();
        assert!(offshoot.available_here);
        assert_eq!(offshoot.stale, 1);
        assert_eq!(offshoot.attached, 0);
        assert!(offshoot.events.iter().any(|e| e.id == "FileCopyCompleted"));
        assert!(offshoot.docs.starts_with("https://"));
    }
}
