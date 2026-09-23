//! Hedge app tools: status, commands, presets, logs.

use std::time::Duration;

use hedgebuddy_core::hedge::{
    Action, AppDescription, AppStatus, CommandCall, CommandOutcome, CommandPlan, LogKind, Preset,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::{tool, Context, NoParams, ToolDef, ToolError, DESTRUCTIVE, READ};
use crate::attachments::AppArg;

/// One command of `run_app_command`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CommandArg {
    /// Command id from describe_app, e.g. setSource.
    pub command: String,
    /// Parameters as describe_app lists them; omit for none.
    #[serde(default)]
    pub params: Map<String, Value>,
}

/// Arguments of `run_app_command`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RunCommand {
    /// Catalog app id.
    pub app: String,
    /// Commands in order.
    pub commands: Vec<CommandArg>,
    /// Return the planned URLs without opening them.
    #[serde(default)]
    pub dry_run: bool,
    /// Set only after the operator approved the commands listed in requires_confirmation.
    #[serde(default)]
    pub confirmed: bool,
    /// Seconds to wait for each response in the app's callback log (default 5, max 30, 0 = don't wait).
    #[serde(default)]
    pub wait_seconds: Option<u64>,
}

/// Arguments of `read_app_log`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ReadLog {
    /// Catalog app id.
    pub app: String,
    /// "callback" (URL command responses) or "event" (scripting and app log).
    pub log: String,
    /// How many lines from the end (default 50, max 500).
    #[serde(default)]
    pub lines: Option<usize>,
}

/// Arguments of `write_preset`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WritePreset {
    /// Catalog app id (presets exist for offshoot on Windows).
    pub app: String,
    /// Preset name (file name without .hedge).
    pub name: String,
    /// Destination folder pattern, e.g. ClientX/CAMERA/A{Source Counter}.
    pub folder_pattern: String,
    /// Source label pattern, e.g. A{Source Counter}.
    pub label_pattern: String,
    /// File rename pattern; empty keeps names.
    #[serde(default)]
    pub rename_pattern: String,
    /// Next counter value, e.g. "003".
    pub counter: String,
    /// Flatten source folders.
    #[serde(default)]
    pub flatten_folders: bool,
    /// Skip empty folders.
    #[serde(default)]
    pub ignore_empty_folders: bool,
    /// Return the planned file without writing it.
    #[serde(default)]
    pub dry_run: bool,
}

/// Arguments of `select_preset`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SelectPreset {
    /// Catalog app id.
    pub app: String,
    /// Existing preset name.
    pub name: String,
    /// Return the planned change without making it.
    #[serde(default)]
    pub dry_run: bool,
}

/// Result of `list_apps`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListAppsResult {
    /// Every catalog app and its status on this machine.
    pub apps: Vec<AppStatus>,
}

/// Result of `run_app_command`.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum RunAppCommandResult {
    /// With `dry_run`: the planned URLs; nothing ran.
    DryRun {
        /// Always false.
        executed: bool,
        /// Always true.
        dry_run: bool,
        /// The URLs that would open.
        plan: CommandPlan,
    },
    /// Some commands need the operator's approval; nothing ran.
    NeedsConfirmation {
        /// Always false.
        executed: bool,
        /// Commands the operator must approve.
        requires_confirmation: Vec<String>,
        /// The URLs that would open.
        plan: CommandPlan,
        /// What to do next.
        message: String,
    },
    /// The commands ran.
    Executed {
        /// Always true.
        executed: bool,
        /// The URLs opened and the app's responses.
        outcome: CommandOutcome,
    },
}

/// Result of `read_app_log`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ReadAppLogResult {
    /// Catalog app id.
    pub app: String,
    /// "callback" or "event".
    pub log: String,
    /// The last lines, oldest first.
    pub lines: Vec<String>,
}

/// Result of `list_presets`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListPresetsResult {
    /// Catalog app id.
    pub app: String,
    /// The app's presets.
    pub presets: Vec<Preset>,
    /// The selected preset, if known.
    pub selected: Option<String>,
}

/// Result of `write_preset`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct WritePresetResult {
    /// The preset written (or planned).
    pub preset: Preset,
    /// The file changes.
    pub actions: Vec<Action>,
    /// False on a dry run.
    pub applied: bool,
    /// What to do next.
    pub next: String,
}

/// Result of `select_preset`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SelectPresetResult {
    /// Catalog app id.
    pub app: String,
    /// The preset selected.
    pub selected: String,
    /// The settings changes.
    pub actions: Vec<Action>,
    /// False on a dry run.
    pub applied: bool,
}

/// The Hedge app tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_apps",
            "List Hedge apps: installed or not, version, whether scripting is enabled, and warnings (for example an app newer than HedgeBuddy's catalog).",
            READ,
            NoParams,
            ListAppsResult,
            list_apps
        ),
        tool!(
            "describe_app",
            "Everything about one Hedge app: status, events with the exact payload keys scripts receive, commands with parameter types, file locations, and the documentation URL.",
            READ,
            AppArg,
            AppDescription,
            describe_app
        ),
        tool!(
            "run_app_command",
            "Run Hedge app URL commands in order (for OffShoot: reset, setSource, setDestination, addTransfers, reloadPresets...). Run with dry_run first and show the operator the plan. Commands listed in requires_confirmation run only when called again with confirmed: true after the operator agrees. Returns the app's callback-log responses.",
            DESTRUCTIVE,
            RunCommand,
            RunAppCommandResult,
            run_app_command
        ),
        tool!(
            "read_app_log",
            "Read the last lines of a Hedge app's callback log (URL command responses) or event log.",
            READ,
            ReadLog,
            ReadAppLogResult,
            read_app_log
        ),
        tool!(
            "list_presets",
            "List the app's presets (folder pattern, label pattern, counter) and which one is selected.",
            READ,
            AppArg,
            ListPresetsResult,
            list_presets
        ),
        tool!(
            "write_preset",
            "Create or update a preset file. Run with dry_run first. Afterwards run run_app_command with reloadPresets so the app sees it.",
            DESTRUCTIVE,
            WritePreset,
            WritePresetResult,
            write_preset
        ),
        tool!(
            "select_preset",
            "Make a preset the selected one (Windows). Whether a running app picks up the change is unverified; a restart may be needed.",
            DESTRUCTIVE,
            SelectPreset,
            SelectPresetResult,
            select_preset
        ),
    ]
}

fn list_apps(ctx: &Context, _: NoParams) -> Result<ListAppsResult, ToolError> {
    Ok(ListAppsResult {
        apps: ctx.hedge.apps()?,
    })
}

fn describe_app(ctx: &Context, p: AppArg) -> Result<AppDescription, ToolError> {
    Ok(ctx.hedge.describe_app(&p.app)?)
}

fn run_app_command(ctx: &Context, p: RunCommand) -> Result<RunAppCommandResult, ToolError> {
    let calls: Vec<CommandCall> = p
        .commands
        .into_iter()
        .map(|c| CommandCall {
            command: c.command,
            params: c.params,
        })
        .collect();
    let plan = ctx.hedge.plan_commands(&p.app, &calls)?;
    if p.dry_run {
        return Ok(RunAppCommandResult::DryRun {
            executed: false,
            dry_run: true,
            plan,
        });
    }
    if !plan.confirm.is_empty() && !p.confirmed {
        return Ok(RunAppCommandResult::NeedsConfirmation {
            executed: false,
            requires_confirmation: plan.confirm.clone(),
            plan,
            message: "Ask the operator to approve these commands, then call run_app_command again with confirmed: true.".to_owned(),
        });
    }
    let wait = Duration::from_secs(p.wait_seconds.unwrap_or(5).min(30));
    let outcome = ctx.hedge.run_commands(&p.app, &calls, wait)?;
    Ok(RunAppCommandResult::Executed {
        executed: true,
        outcome,
    })
}

fn read_app_log(ctx: &Context, p: ReadLog) -> Result<ReadAppLogResult, ToolError> {
    let kind = match p.log.as_str() {
        "callback" => LogKind::Callback,
        "event" => LogKind::Event,
        other => {
            return Err(ToolError::new(format!(
                "log must be \"callback\" or \"event\", not \"{other}\""
            )))
        }
    };
    let lines = ctx
        .hedge
        .read_app_log(&p.app, kind, p.lines.unwrap_or(50).min(500))?;
    Ok(ReadAppLogResult {
        app: p.app,
        log: p.log,
        lines,
    })
}

fn list_presets(ctx: &Context, p: AppArg) -> Result<ListPresetsResult, ToolError> {
    let presets = ctx.hedge.list_presets(&p.app)?;
    let selected = ctx.hedge.selected_preset(&p.app).ok().flatten();
    Ok(ListPresetsResult {
        app: p.app,
        presets,
        selected,
    })
}

fn write_preset(ctx: &Context, p: WritePreset) -> Result<WritePresetResult, ToolError> {
    let preset = Preset {
        name: p.name,
        folder_pattern: p.folder_pattern,
        label_pattern: p.label_pattern,
        rename_pattern: p.rename_pattern,
        counter: p.counter,
        flatten_folders: p.flatten_folders,
        ignore_empty_folders: p.ignore_empty_folders,
    };
    let actions = ctx.hedge.plan_write_preset(&p.app, &preset)?;
    if !p.dry_run {
        ctx.hedge.apply(&actions)?;
    }
    Ok(WritePresetResult {
        preset,
        actions,
        applied: !p.dry_run,
        next: "Run run_app_command with reloadPresets so the app sees the preset.".to_owned(),
    })
}

fn select_preset(ctx: &Context, p: SelectPreset) -> Result<SelectPresetResult, ToolError> {
    let actions = ctx.hedge.plan_select_preset(&p.app, &p.name)?;
    if !p.dry_run {
        ctx.hedge.apply(&actions)?;
    }
    Ok(SelectPresetResult {
        app: p.app,
        selected: p.name,
        actions,
        applied: !p.dry_run,
    })
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::RegValue;
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::{call, test_ctx};

    const KEY: &str = "HKCU\\Software\\Hedge";

    fn windows(appdata: &std::path::Path) -> FakeHost {
        FakeHost::new(Os::Windows)
            .with_env("APPDATA", &appdata.display().to_string())
            .with_registry_value(KEY, "BuildVersion", RegValue::String("26.1 (1023)".into()))
    }

    #[test]
    fn apps_and_description() {
        let appdata = tempfile::tempdir().unwrap();
        let (_d, _f, ctx) = test_ctx(windows(appdata.path()));
        let apps = call(&ctx, "list_apps", json!({})).unwrap();
        assert_eq!(apps["apps"].as_array().unwrap().len(), 4);
        let d = call(&ctx, "describe_app", json!({"app": "offshoot"})).unwrap();
        assert_eq!(d["status"]["installed"], true);
        assert!(d["manifest"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["id"] == "FileCopyCompleted"));
    }

    #[test]
    fn run_app_command_dry_run_and_confirmation_gate() {
        let appdata = tempfile::tempdir().unwrap();
        let (_d, fake, ctx) = test_ctx(windows(appdata.path()));
        let cmds = json!([
            {"command": "setSource", "params": {"paths": ["/Volumes/A003"], "label": "A003"}},
            {"command": "addTransfers"}
        ]);
        let dry = call(
            &ctx,
            "run_app_command",
            json!({"app": "offshoot", "commands": cmds, "dry_run": true}),
        )
        .unwrap();
        assert_eq!(dry["executed"], false);
        assert_eq!(dry["plan"]["urls"].as_array().unwrap().len(), 2);
        let gated = call(
            &ctx,
            "run_app_command",
            json!({"app": "offshoot", "commands": cmds}),
        )
        .unwrap();
        assert_eq!(gated["executed"], false);
        assert_eq!(gated["requires_confirmation"], json!(["addTransfers"]));
        assert!(fake.opened_urls().is_empty());
        let ran = call(
            &ctx,
            "run_app_command",
            json!({"app": "offshoot", "commands": cmds, "confirmed": true, "wait_seconds": 0}),
        )
        .unwrap();
        assert_eq!(ran["executed"], true);
        assert_eq!(fake.opened_urls().len(), 2);
        let open = call(
            &ctx,
            "run_app_command",
            json!({"app": "offshoot", "commands": [{"command": "open"}], "wait_seconds": 0}),
        )
        .unwrap();
        assert_eq!(open["executed"], true, "open needs no confirmation");
        assert!(call(
            &ctx,
            "run_app_command",
            json!({"app": "offshoot", "commands": [{"command": "activate"}]})
        )
        .is_err());
    }

    #[test]
    fn presets_and_logs() {
        let appdata = tempfile::tempdir().unwrap();
        let hedge_dir = appdata.path().join("Hedge");
        std::fs::create_dir_all(hedge_dir.join("Presets")).unwrap();
        std::fs::write(hedge_dir.join("Hedge.log"), "a\nb\nc\n").unwrap();
        let (_d, fake, ctx) = test_ctx(windows(appdata.path()));
        let args = json!({"app": "offshoot", "name": "A cam", "folder_pattern": "X/CAMERA/A{Source Counter}", "label_pattern": "A{Source Counter}", "counter": "003"});
        let mut dry = args.clone();
        dry["dry_run"] = json!(true);
        call(&ctx, "write_preset", dry).unwrap();
        assert!(!hedge_dir.join("Presets").join("A cam.hedge").exists());
        call(&ctx, "write_preset", args).unwrap();
        let listed = call(&ctx, "list_presets", json!({"app": "offshoot"})).unwrap();
        assert_eq!(listed["presets"][0]["counter"], "003");
        assert_eq!(listed["selected"], serde_json::Value::Null);
        call(
            &ctx,
            "select_preset",
            json!({"app": "offshoot", "name": "A cam"}),
        )
        .unwrap();
        assert_eq!(
            fake.registry_value(KEY, "SessionVariableSelectedPreset"),
            Some(RegValue::String("A cam".into()))
        );
        let log = call(
            &ctx,
            "read_app_log",
            json!({"app": "offshoot", "log": "event", "lines": 2}),
        )
        .unwrap();
        assert_eq!(log["lines"], json!(["b", "c"]));
        assert!(call(
            &ctx,
            "read_app_log",
            json!({"app": "offshoot", "log": "other"})
        )
        .is_err());
    }
}
