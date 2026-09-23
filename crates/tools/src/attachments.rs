//! Attaching scripts to Hedge app events.

use hedgebuddy_core::hedge::{Action, AttachPlan, EventAttachment, SyncReport};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{tool, Context, ToolDef, ToolError, DESTRUCTIVE, READ};
use crate::scripts::ScriptDry;

const APPLY_NOTE: &str = "On macOS the change is staged in the OffShoot Helper workspace HedgeBuddy.json; the operator applies it from the OffShoot Helper menu. The Hedge app may need a restart to pick up the change (unverified).";

/// The OffShoot Helper apply note, but only when the change was actually
/// applied: on a dry run nothing was staged, so the note would be misleading.
fn note(applied: bool) -> Option<String> {
    applied.then(|| APPLY_NOTE.to_owned())
}

/// An app id.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AppArg {
    /// Catalog app id: offshoot, foolcat, editready or canister.
    pub app: String,
}

/// A profile plus `dry_run`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ProfileDry {
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Report what would change without changing it.
    #[serde(default)]
    pub dry_run: bool,
}

/// An app event plus `dry_run`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AppEventDry {
    /// Catalog app id.
    pub app: String,
    /// Event id from describe_app, e.g. FileCopyCompleted.
    pub event: String,
    /// Report what would change without changing it.
    #[serde(default)]
    pub dry_run: bool,
}

/// Result of `list_attachments`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListAttachmentsResult {
    /// Catalog app id.
    pub app: String,
    /// Every event of the app and what it runs.
    pub events: Vec<EventAttachment>,
}

/// Result of `attach_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct AttachScriptResult {
    /// The planned (or applied) attachment.
    #[serde(flatten)]
    pub plan: AttachPlan,
    /// False on a dry run.
    pub applied: bool,
    /// How to apply the change on macOS; absent on a dry run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Result of `detach_script`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct DetachScriptResult {
    /// Profile name.
    pub profile: String,
    /// Script file name.
    pub script: String,
    /// The changes to the Hedge app's settings.
    pub actions: Vec<Action>,
    /// False on a dry run.
    pub applied: bool,
    /// How to apply the change on macOS; absent on a dry run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Result of `sync_attachments`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SyncAttachmentsResult {
    /// What was (or would be) attached and detached.
    #[serde(flatten)]
    pub report: SyncReport,
    /// How to apply the change on macOS; absent on a dry run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Result of `clear_stale_attachment`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ClearStaleResult {
    /// Catalog app id.
    pub app: String,
    /// Event id.
    pub event: String,
    /// The changes to the Hedge app's settings.
    pub actions: Vec<Action>,
    /// False on a dry run.
    pub applied: bool,
    /// How to apply the change on macOS; absent on a dry run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// The attachment tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_attachments",
            "Show what every event of a Hedge app is attached to: attached (a HedgeBuddy script), external (the operator's own file), stale (a file that no longer exists), staged (macOS, waiting to be applied in OffShoot Helper), detached, manual, or unsupported.",
            READ,
            AppArg,
            ListAttachmentsResult,
            list_attachments
        ),
        tool!(
            "attach_script",
            "Attach a script to the app event its manifest names. Changes the Hedge app's settings: run with dry_run first and show the operator the planned change, including `replaces` if something else was attached. Refuses scripts with unmet requirements.",
            DESTRUCTIVE,
            ScriptDry,
            AttachScriptResult,
            attach_script
        ),
        tool!(
            "detach_script",
            "Detach a script from its app event, only if that event is attached to this script. Run with dry_run first.",
            DESTRUCTIVE,
            ScriptDry,
            DetachScriptResult,
            detach_script
        ),
        tool!(
            "sync_attachments",
            "Make the Hedge apps run this profile's scripts: attach every script whose manifest names an app event, and detach other profiles' HedgeBuddy scripts from events this profile does not use. The operator's own (external) scripts are never detached. Run with dry_run first and show the report.",
            DESTRUCTIVE,
            ProfileDry,
            SyncAttachmentsResult,
            sync_attachments
        ),
        tool!(
            "clear_stale_attachment",
            "Detach an app event that points at a script file that no longer exists (state stale). Refuses any other state. Run with dry_run first.",
            DESTRUCTIVE,
            AppEventDry,
            ClearStaleResult,
            clear_stale_attachment
        ),
    ]
}

fn list_attachments(ctx: &Context, p: AppArg) -> Result<ListAttachmentsResult, ToolError> {
    let events = ctx.hedge.attachments(&p.app, &ctx.store)?;
    Ok(ListAttachmentsResult { app: p.app, events })
}

fn attach_script(ctx: &Context, p: ScriptDry) -> Result<AttachScriptResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let plan = ctx
        .hedge
        .attach_script(&ctx.store, &profile, &p.name, p.dry_run)?;
    let applied = !p.dry_run;
    Ok(AttachScriptResult {
        plan,
        applied,
        note: note(applied),
    })
}

fn detach_script(ctx: &Context, p: ScriptDry) -> Result<DetachScriptResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let actions = ctx
        .hedge
        .detach_script(&ctx.store, &profile, &p.name, p.dry_run)?;
    let applied = !p.dry_run;
    Ok(DetachScriptResult {
        profile,
        script: p.name,
        actions,
        applied,
        note: note(applied),
    })
}

fn sync_attachments(ctx: &Context, p: ProfileDry) -> Result<SyncAttachmentsResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let report = ctx
        .hedge
        .sync_attachments(&ctx.store, &profile, p.dry_run)?;
    Ok(SyncAttachmentsResult {
        note: note(report.applied),
        report,
    })
}

fn clear_stale_attachment(ctx: &Context, p: AppEventDry) -> Result<ClearStaleResult, ToolError> {
    let actions = ctx
        .hedge
        .clear_stale_attachment(&p.app, &p.event, &ctx.store, p.dry_run)?;
    let applied = !p.dry_run;
    Ok(ClearStaleResult {
        app: p.app,
        event: p.event,
        actions,
        applied,
        note: note(applied),
    })
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::RegValue;
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::{call, test_ctx};

    use super::APPLY_NOTE;

    const KEY: &str = "HKCU\\Software\\Hedge";
    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\"}\n---\n\"\"\"\n";

    #[test]
    fn attach_detach_and_list() {
        let (_d, fake, ctx) = test_ctx(FakeHost::new(Os::Windows).with_registry_key(KEY));
        ctx.store.create_profile("p", "").unwrap();
        ctx.store.write_script("p", "copy.py", COPY).unwrap();
        let dry = call(
            &ctx,
            "attach_script",
            json!({"name": "copy.py", "dry_run": true}),
        )
        .unwrap();
        assert_eq!(dry["applied"], false);
        assert_eq!(dry["event"], "FileCopyCompleted");
        assert!(dry.get("note").is_none(), "dry run must not carry a note");
        assert!(fake
            .registry_value(KEY, "EventScriptFileCopyCompleted")
            .is_none());
        let applied = call(&ctx, "attach_script", json!({"name": "copy.py"})).unwrap();
        assert_eq!(applied["applied"], true);
        assert_eq!(applied["note"], APPLY_NOTE);
        assert!(fake
            .registry_value(KEY, "EventScriptFileCopyCompleted")
            .is_some());
        let list = call(&ctx, "list_attachments", json!({"app": "offshoot"})).unwrap();
        let fcc = list["events"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["event"] == "FileCopyCompleted")
            .unwrap()
            .clone();
        assert_eq!(fcc["state"], "attached");
        assert_eq!(fcc["script"], "copy.py");
        let detached = call(&ctx, "detach_script", json!({"name": "copy.py"})).unwrap();
        assert_eq!(detached["note"], APPLY_NOTE);
        assert!(fake
            .registry_value(KEY, "EventScriptFileCopyCompleted")
            .is_none());
        assert!(call(&ctx, "detach_script", json!({"name": "copy.py"})).is_err());
    }

    #[test]
    fn sync_and_clear_stale() {
        let (_d, fake, ctx) = test_ctx(FakeHost::new(Os::Windows).with_registry_value(
            KEY,
            "EventScriptDiskAdded",
            RegValue::String("E:\\gone\\old.py".into()),
        ));
        ctx.store.create_profile("p", "").unwrap();
        ctx.store.write_script("p", "copy.py", COPY).unwrap();
        let dry = call(&ctx, "sync_attachments", json!({"dry_run": true})).unwrap();
        assert_eq!(dry["attach"][0]["script"], "copy.py");
        assert_eq!(dry["applied"], false);
        assert!(dry.get("note").is_none(), "dry run must not carry a note");
        let synced = call(&ctx, "sync_attachments", json!({})).unwrap();
        assert_eq!(synced["note"], APPLY_NOTE);
        assert!(fake
            .registry_value(KEY, "EventScriptFileCopyCompleted")
            .is_some());
        assert!(call(
            &ctx,
            "clear_stale_attachment",
            json!({"app": "offshoot", "event": "DiskBusy"})
        )
        .is_err());
        let dry_clear = call(
            &ctx,
            "clear_stale_attachment",
            json!({"app": "offshoot", "event": "DiskAdded", "dry_run": true}),
        )
        .unwrap();
        assert!(
            dry_clear.get("note").is_none(),
            "dry run must not carry a note"
        );
        assert!(fake.registry_value(KEY, "EventScriptDiskAdded").is_some());
        let cleared = call(
            &ctx,
            "clear_stale_attachment",
            json!({"app": "offshoot", "event": "DiskAdded"}),
        )
        .unwrap();
        assert_eq!(cleared["note"], APPLY_NOTE);
        assert!(fake.registry_value(KEY, "EventScriptDiskAdded").is_none());
    }
}
