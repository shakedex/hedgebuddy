//! Profile tools.

use hedgebuddy_core::Profile;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{tool, Context, NoParams, ToolDef, ToolError, DESTRUCTIVE, READ, WRITE};
use crate::scripts::attached_to;

/// Which profile (defaults to the active one).
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileArg {
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
}

/// Arguments of `create_profile`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateProfile {
    /// Lowercase letters, digits and dashes, e.g. `commercial-one-day`.
    pub name: String,
    /// Free text shown to the operator.
    #[serde(default)]
    pub description: String,
}

/// A profile name.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct NameArg {
    /// Profile name.
    pub name: String,
}

/// Arguments of `delete_profile`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DeleteProfile {
    /// Profile name.
    pub name: String,
    /// Report what would be deleted without deleting.
    #[serde(default)]
    pub dry_run: bool,
}

/// Result of `list_profiles`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListProfilesResult {
    /// The active profile, or null when there is none.
    pub active: Option<String>,
    /// Every profile name.
    pub profiles: Vec<String>,
}

/// Result of `get_profile`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct GetProfileResult {
    /// The profile; secret values are never included.
    pub profile: Profile,
    /// Whether it is the active profile.
    pub active: bool,
    /// Its script file names.
    pub scripts: Vec<String>,
}

/// Result of `create_profile`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct CreateProfileResult {
    /// The new, empty profile.
    pub profile: Profile,
    /// Whether it became the active profile (the first one does).
    pub active: bool,
}

/// Result of `set_active_profile`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SetActiveProfileResult {
    /// The profile that is now active.
    pub active: String,
}

/// An app event attached to one of a profile's scripts.
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ScriptEvent {
    /// Catalog app id.
    pub app: String,
    /// Event id.
    pub event: String,
    /// Script file name.
    pub script: String,
}

/// What `delete_profile` would delete.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ProfileDeletion {
    /// Profile name.
    pub profile: String,
    /// How many variables it holds.
    pub variables: usize,
    /// Its script file names.
    pub scripts: Vec<String>,
}

/// Result of `delete_profile`.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DeleteProfileResult {
    /// With `dry_run`: what would be deleted.
    DryRun {
        /// Always true.
        dry_run: bool,
        /// What would be deleted.
        would_delete: ProfileDeletion,
        /// App events attached to its scripts.
        attached_to: Vec<ScriptEvent>,
    },
    /// The profile was deleted.
    Deleted {
        /// The deleted profile's name.
        deleted: String,
        /// The active profile afterwards.
        active: Option<String>,
        /// App events that pointed at its scripts.
        attached_to: Vec<ScriptEvent>,
    },
}

/// The profile tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_profiles",
            "List profiles and which one is active.",
            READ,
            NoParams,
            ListProfilesResult,
            list_profiles
        ),
        tool!(
            "get_profile",
            "Show a profile: its variables (secret values are never included), its scripts, and whether it is active. Defaults to the active profile.",
            READ,
            ProfileArg,
            GetProfileResult,
            get_profile
        ),
        tool!(
            "create_profile",
            "Create an empty profile. The name uses lowercase letters, digits and dashes. The first profile created becomes active.",
            WRITE,
            CreateProfile,
            CreateProfileResult,
            create_profile
        ),
        tool!(
            "set_active_profile",
            "Make a profile active. Scripts read the active profile's variables.",
            WRITE,
            NameArg,
            SetActiveProfileResult,
            set_active_profile
        ),
        tool!(
            "delete_profile",
            "Delete a profile with its variables, secrets and scripts. Run with dry_run first and confirm with the operator; attached_to lists the Hedge app events attached to its scripts. Detach those first (sync another profile or use detach_script), or the events will point at missing files.",
            DESTRUCTIVE,
            DeleteProfile,
            DeleteProfileResult,
            delete_profile
        ),
    ]
}

fn list_profiles(ctx: &Context, _: NoParams) -> Result<ListProfilesResult, ToolError> {
    Ok(ListProfilesResult {
        active: ctx.store.active_profile_name()?,
        profiles: ctx.store.list_profiles()?,
    })
}

fn get_profile(ctx: &Context, p: ProfileArg) -> Result<GetProfileResult, ToolError> {
    let name = ctx.profile(p.profile.as_deref())?;
    let profile = ctx.store.load_profile(&name)?;
    let scripts: Vec<String> = ctx
        .store
        .list_scripts(&name)?
        .into_iter()
        .map(|s| s.name)
        .collect();
    let active = ctx.store.active_profile_name()?.as_deref() == Some(name.as_str());
    Ok(GetProfileResult {
        profile,
        active,
        scripts,
    })
}

fn create_profile(ctx: &Context, p: CreateProfile) -> Result<CreateProfileResult, ToolError> {
    let profile = ctx.store.create_profile(&p.name, &p.description)?;
    let active = ctx.store.active_profile_name()?.as_deref() == Some(p.name.as_str());
    Ok(CreateProfileResult { profile, active })
}

fn set_active_profile(ctx: &Context, p: NameArg) -> Result<SetActiveProfileResult, ToolError> {
    ctx.store.set_active_profile(&p.name)?;
    Ok(SetActiveProfileResult { active: p.name })
}

fn delete_profile(ctx: &Context, p: DeleteProfile) -> Result<DeleteProfileResult, ToolError> {
    let profile = ctx.store.load_profile(&p.name)?;
    let scripts: Vec<String> = ctx
        .store
        .list_scripts(&p.name)?
        .into_iter()
        .map(|s| s.name)
        .collect();
    // App events attached to this profile's scripts go stale once it is gone.
    let attached: Vec<ScriptEvent> = scripts
        .iter()
        .flat_map(|script| {
            attached_to(ctx, &p.name, script)
                .into_iter()
                .map(move |a| ScriptEvent {
                    app: a.app,
                    event: a.event,
                    script: script.clone(),
                })
        })
        .collect();
    if p.dry_run {
        return Ok(DeleteProfileResult::DryRun {
            dry_run: true,
            would_delete: ProfileDeletion {
                profile: p.name,
                variables: profile.variables.len(),
                scripts,
            },
            attached_to: attached,
        });
    }
    ctx.store.delete_profile(&p.name)?;
    Ok(DeleteProfileResult::Deleted {
        deleted: p.name,
        active: ctx.store.active_profile_name()?,
        attached_to: attached,
    })
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::{call, test_ctx};

    #[test]
    fn create_list_get_and_activate() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let created = call(
            &ctx,
            "create_profile",
            json!({"name": "commercial-one-day", "description": "Client X"}),
        )
        .unwrap();
        assert_eq!(created["active"], true);
        assert_eq!(created["profile"]["name"], "commercial-one-day");
        call(&ctx, "create_profile", json!({"name": "second"})).unwrap();
        let list = call(&ctx, "list_profiles", json!({})).unwrap();
        assert_eq!(
            list,
            json!({"active": "commercial-one-day", "profiles": ["commercial-one-day", "second"]})
        );
        let got = call(&ctx, "get_profile", json!({})).unwrap();
        assert_eq!(got["profile"]["description"], "Client X");
        assert_eq!(got["active"], true);
        assert_eq!(got["scripts"], json!([]));
        call(&ctx, "set_active_profile", json!({"name": "second"})).unwrap();
        assert_eq!(
            call(&ctx, "get_profile", json!({})).unwrap()["profile"]["name"],
            "second"
        );
        assert!(call(&ctx, "create_profile", json!({"name": "Bad Name"})).is_err());
    }

    #[test]
    fn delete_has_a_dry_run_and_reports_attachments() {
        let (_d, _f, ctx) =
            test_ctx(FakeHost::new(Os::Windows).with_registry_key("HKCU\\Software\\Hedge"));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let copy = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\"}\n---\n\"\"\"\nprint('x')\n";
        ctx.store.write_script("p", "copy.py", copy).unwrap();
        ctx.store
            .write_script("p", "plain.py", "print('y')\n")
            .unwrap();
        ctx.hedge
            .attach_script(&ctx.store, "p", "copy.py", false)
            .unwrap();
        let attached =
            json!([{"app": "offshoot", "event": "FileCopyCompleted", "script": "copy.py"}]);

        let dry = call(
            &ctx,
            "delete_profile",
            json!({"name": "p", "dry_run": true}),
        )
        .unwrap();
        assert_eq!(dry["would_delete"]["profile"], "p");
        assert_eq!(
            dry["would_delete"]["scripts"],
            json!(["copy.py", "plain.py"])
        );
        assert_eq!(dry["attached_to"], attached);
        assert!(ctx.store.profile_exists("p"));
        let done = call(&ctx, "delete_profile", json!({"name": "p"})).unwrap();
        assert_eq!(
            done,
            json!({"deleted": "p", "active": null, "attached_to": attached})
        );
        assert!(call(&ctx, "delete_profile", json!({"name": "p"})).is_err());
    }
}
