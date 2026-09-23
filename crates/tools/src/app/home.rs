//! Everything Home and the sidebar badges show, in one call (spec §6.1).

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

use hedgebuddy_core::hedge::{managed_script, AttachState};
use hedgebuddy_core::python_env::{self, PythonInfo};
use hedgebuddy_core::{ActivityRecord, RequirementIssue, Run, RunFilter, RunStatus, VarType};
use jiff::Timestamp;
use schemars::JsonSchema;
use serde::Serialize;

use super::PythonCache;
use crate::{Context, ToolError};

/// How many recent runs Home lists.
pub const RECENT_RUNS: usize = 5;
/// How many Claude calls Home lists.
pub const RECENT_ACTIVITY: usize = 3;
/// Failed runs listed one by one before the rest are summed up.
pub const FAILED_RUNS_LISTED: usize = 3;

/// Result of `home_summary`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct HomeSummary {
    /// When the app was opened before this session (UTC, RFC 3339), or null
    /// on the first launch. Counts cover the runs since then, or every kept
    /// run (30 days) when null.
    pub since: Option<String>,
    /// The active profile, or null when there is none.
    pub active_profile: Option<String>,
    /// Every profile name.
    pub profiles: Vec<String>,
    /// The four numbers at the top of Home.
    pub counts: HomeCounts,
    /// Counts for the sidebar badges.
    pub badges: SidebarBadges,
    /// Problems, most serious first, each linking to where it gets fixed.
    pub attention: Vec<AttentionItem>,
    /// The latest runs across all profiles, newest first.
    pub recent_runs: Vec<Run>,
    /// Claude's latest tool calls, newest first.
    pub recent_activity: Vec<ActivityRecord>,
    /// The Python the Hedge apps use.
    pub python: PythonStatus,
}

/// The numbers at the top of Home.
#[derive(Debug, Serialize, JsonSchema)]
pub struct HomeCounts {
    /// Runs started since `since`, across all profiles.
    pub runs_since: usize,
    /// Of those, the runs that failed (status `failed` or `error`).
    pub failed_since: usize,
    /// The active profile's scripts attached to (or staged for) an app event.
    pub scripts_attached: usize,
    /// The active profile's variables.
    pub variables: usize,
}

/// Counts for the sidebar badges.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SidebarBadges {
    /// Runs: failures since the last open.
    pub runs: usize,
    /// Variables: required variables missing or of the wrong type.
    pub variables: usize,
    /// Hedge apps: events pointing at deleted scripts.
    pub apps: usize,
    /// Settings: package problems (0 or 1).
    pub settings: usize,
}

/// What is wrong with a required variable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum VariableProblem {
    /// The profile has no value for it.
    Missing,
    /// The profile declares another type.
    TypeMismatch,
}

/// One row of "Needs attention".
#[derive(Debug, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AttentionItem {
    /// A run that failed since the last open.
    RunFailed {
        /// Run id (links to `#/runs/<id>`).
        run_id: String,
        /// Script file name.
        script: String,
        /// The profile it ran with.
        profile: String,
        /// When it started (UTC, RFC 3339).
        started_at: String,
    },
    /// Failed runs beyond the ones listed.
    MoreFailedRuns {
        /// How many more.
        count: usize,
    },
    /// A variable the active profile's scripts require is missing or has
    /// the wrong type.
    VariableIssue {
        /// Variable name.
        name: String,
        /// The type the scripts require.
        #[serde(rename = "type")]
        ty: VarType,
        /// Missing or the wrong type.
        problem: VariableProblem,
        /// The type the profile declares, for a type mismatch.
        actual: Option<VarType>,
        /// The scripts that require it.
        scripts: Vec<String>,
    },
    /// App events that point at deleted scripts.
    StaleEntries {
        /// Catalog app id.
        app: String,
        /// The app's display name.
        app_name: String,
        /// How many events.
        count: usize,
    },
    /// The Python the Hedge apps use cannot import this `hedgebuddy`.
    PackageProblem {
        /// Whether Python was found at all.
        python_found: bool,
        /// The installed `hedgebuddy` version, if any.
        installed: Option<String>,
        /// The version this HedgeBuddy needs.
        required: String,
    },
    /// An installed app is newer than the version HedgeBuddy was tested with.
    AppNewer {
        /// Catalog app id.
        app: String,
        /// The app's display name.
        app_name: String,
        /// Installed version.
        version: String,
        /// The version HedgeBuddy was tested with.
        tested_against: String,
    },
    /// Scripting is turned off in an app that has scripts attached.
    ScriptingOff {
        /// Catalog app id.
        app: String,
        /// The app's display name.
        app_name: String,
        /// How many of its events have a script attached.
        events: usize,
    },
}

/// The Python the Hedge apps use, for Home and Settings.
#[derive(Debug, Serialize, JsonSchema)]
pub struct PythonStatus {
    /// Whether an interpreter was found.
    pub found: bool,
    /// Its path.
    pub executable: Option<PathBuf>,
    /// Its version.
    pub version: Option<String>,
    /// The `hedgebuddy` version installed there, if any.
    pub installed: Option<String>,
    /// The version this HedgeBuddy needs.
    pub required: String,
    /// What is wrong, in one sentence, or null.
    pub problem: Option<String>,
}

/// Everything Home shows. `since` is the session's stored `last_opened`.
pub fn home_summary(
    ctx: &Context,
    since: Option<&str>,
    python: &PythonCache,
) -> Result<HomeSummary, ToolError> {
    let since_ts = since.and_then(|s| s.parse::<Timestamp>().ok());
    let active = ctx.store.active_profile_name()?;
    let profiles = ctx.store.list_profiles()?;

    let runs = ctx.store.list_recent_runs(&RunFilter::default())?;
    let new_runs: Vec<&Run> = runs
        .iter()
        .filter(|r| started_after(&r.started_at, since_ts.as_ref()))
        .collect();
    let failed: Vec<&Run> = new_runs.iter().copied().filter(|r| is_failure(r)).collect();

    let mut attention = Vec::new();
    for run in failed.iter().take(FAILED_RUNS_LISTED) {
        attention.push(AttentionItem::RunFailed {
            run_id: run.run_id.clone(),
            script: run.script.clone(),
            profile: run.profile.clone(),
            started_at: run.started_at.clone(),
        });
    }
    if failed.len() > FAILED_RUNS_LISTED {
        attention.push(AttentionItem::MoreFailedRuns {
            count: failed.len() - FAILED_RUNS_LISTED,
        });
    }

    let (variables, variable_items) = match &active {
        Some(p) => (
            ctx.store.load_profile(p)?.variables.len(),
            variable_issues(ctx, p)?,
        ),
        None => (0, Vec::new()),
    };
    let variable_badge = variable_items.len();
    attention.extend(variable_items);

    let mut stale_total = 0;
    let mut attached = BTreeSet::new();
    let mut stale_items = Vec::new();
    let mut newer_items = Vec::new();
    let mut scripting_off_items = Vec::new();
    for status in ctx.hedge.apps()? {
        // Checked before the attachments read below, so a failed read (a
        // stale registry key an app can't currently see, say) never hides
        // that the app itself is newer than HedgeBuddy was tested against.
        if status.installed && status.newer_than_tested {
            if let Some(version) = &status.version {
                newer_items.push(AttentionItem::AppNewer {
                    app: status.id.clone(),
                    app_name: status.name.clone(),
                    version: version.clone(),
                    tested_against: status.tested_against.clone(),
                });
            }
        }
        let Ok(events) = ctx.hedge.attachments(&status.id, &ctx.store) else {
            continue;
        };
        let mut stale = 0;
        let mut in_use = 0;
        for e in &events {
            match &e.state {
                AttachState::Stale { .. } => stale += 1,
                AttachState::Attached {
                    profile, script, ..
                } => {
                    in_use += 1;
                    if active.as_deref() == Some(profile.as_str()) {
                        attached.insert(script.clone());
                    }
                }
                AttachState::Staged { path, .. } => {
                    in_use += 1;
                    if let Some((profile, script)) = managed_script(&ctx.store, path) {
                        if active.as_deref() == Some(profile.as_str()) {
                            attached.insert(script);
                        }
                    }
                }
                AttachState::External { .. } => in_use += 1,
                _ => {}
            }
        }
        if stale > 0 {
            stale_total += stale;
            stale_items.push(AttentionItem::StaleEntries {
                app: status.id.clone(),
                app_name: status.name.clone(),
                count: stale,
            });
        }
        if status.scripting_enabled == Some(false) && in_use > 0 {
            scripting_off_items.push(AttentionItem::ScriptingOff {
                app: status.id.clone(),
                app_name: status.name.clone(),
                events: in_use,
            });
        }
    }

    // Grouped by kind across every app, not interleaved app by app (spec
    // §6.1 order): stale entries, the package problem, newer apps, then
    // scripting off.
    attention.extend(stale_items);

    let python = python_status(python.get(ctx.hedge.host())?);
    if python.problem.is_some() {
        attention.push(AttentionItem::PackageProblem {
            python_found: python.found,
            installed: python.installed.clone(),
            required: python.required.clone(),
        });
    }
    attention.extend(newer_items);
    attention.extend(scripting_off_items);

    Ok(HomeSummary {
        since: since.filter(|_| since_ts.is_some()).map(str::to_owned),
        active_profile: active,
        profiles,
        counts: HomeCounts {
            runs_since: new_runs.len(),
            failed_since: failed.len(),
            scripts_attached: attached.len(),
            variables,
        },
        badges: SidebarBadges {
            runs: failed.len(),
            variables: variable_badge,
            apps: stale_total,
            settings: usize::from(python.problem.is_some()),
        },
        attention,
        recent_runs: runs.iter().take(RECENT_RUNS).cloned().collect(),
        recent_activity: ctx.store.read_activity(RECENT_ACTIVITY)?,
        python,
    })
}

/// Whether a run started after `since` (every run counts when `since` is
/// `None`; a timestamp that does not parse never counts).
fn started_after(started_at: &str, since: Option<&Timestamp>) -> bool {
    match since {
        None => true,
        Some(since) => started_at
            .parse::<Timestamp>()
            .map(|t| t > *since)
            .unwrap_or(false),
    }
}

fn is_failure(run: &Run) -> bool {
    matches!(run.status, Some(RunStatus::Failed | RunStatus::Error))
}

/// The active profile's unmet requirements, one item per variable.
fn variable_issues(ctx: &Context, profile: &str) -> Result<Vec<AttentionItem>, ToolError> {
    let mut by_name: BTreeMap<String, (VarType, VariableProblem, Option<VarType>, Vec<String>)> =
        BTreeMap::new();
    for info in ctx.store.list_scripts(profile)? {
        if info.manifest.is_none() {
            continue;
        }
        let Ok(check) = ctx.store.check_script(profile, &info.name) else {
            continue;
        };
        for issue in check.issues {
            let (name, ty, problem, actual) = match issue {
                RequirementIssue::Missing { name, ty } => {
                    (name, ty, VariableProblem::Missing, None)
                }
                RequirementIssue::TypeMismatch {
                    name,
                    expected,
                    actual,
                } => (name, expected, VariableProblem::TypeMismatch, Some(actual)),
            };
            by_name
                .entry(name)
                .or_insert((ty, problem, actual, Vec::new()))
                .3
                .push(info.name.clone());
        }
    }
    Ok(by_name
        .into_iter()
        .map(
            |(name, (ty, problem, actual, scripts))| AttentionItem::VariableIssue {
                name,
                ty,
                problem,
                actual,
                scripts,
            },
        )
        .collect())
}

fn python_status(info: Option<PythonInfo>) -> PythonStatus {
    let required = env!("CARGO_PKG_VERSION").to_owned();
    match info {
        None => PythonStatus {
            found: false,
            executable: None,
            version: None,
            installed: None,
            problem: Some(
                "Python 3 was not found; the Hedge apps need it to run scripts".to_owned(),
            ),
            required,
        },
        Some(info) => {
            let problem = python_env::package_problem(&info, &required);
            PythonStatus {
                found: true,
                executable: Some(info.executable),
                version: Some(info.version),
                installed: info.hedgebuddy,
                required,
                problem,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::{CommandOutput, RegValue};
    use hedgebuddy_core::python_env::PROBE;
    use hedgebuddy_core::{ActivityOutcome, FakeHost, Os};
    use jiff::{Span, Timestamp};
    use serde_json::json;

    use super::*;
    use crate::app::PythonCache;
    use crate::{call, test_ctx};

    const KEY: &str = "HKCU\\Software\\Hedge";
    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\", \"requires\": {\"CLIENT_EMAIL\": {\"type\": \"string\"}}}\n---\n\"\"\"\n";

    fn with_python(host: FakeHost, package: Option<&str>) -> FakeHost {
        let pkg = package
            .map(|v| format!("\"{v}\""))
            .unwrap_or_else(|| "null".into());
        host.with_run_response(
            "py",
            &["-3", "-c", PROBE],
            CommandOutput {
                status: 0,
                stdout: format!("{{\"executable\": \"C:\\\\Py\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": {pkg}}}\n"),
                stderr: String::new(),
            },
        )
    }

    fn ts(offset: Span) -> String {
        Timestamp::now().checked_add(offset).unwrap().to_string()
    }

    fn write_runs(ctx: &Context, lines: &[String]) {
        let today = jiff::Zoned::now().date().to_string();
        std::fs::create_dir_all(ctx.store.runs_dir()).unwrap();
        std::fs::write(
            ctx.store.runs_dir().join(format!("{today}.jsonl")),
            lines.join("\n") + "\n",
        )
        .unwrap();
    }

    fn start(id: &str, at: &str, profile: &str) -> String {
        format!(
            r#"{{"ts":"{at}","run_id":"{id}","phase":"start","app":"offshoot","event":"FileCopyCompleted","script":"copy.py","profile":"{profile}"}}"#
        )
    }

    fn end(id: &str, at: &str, status: &str) -> String {
        let code = if status == "ok" { 0 } else { 1 };
        format!(
            r#"{{"ts":"{at}","run_id":"{id}","phase":"end","status":"{status}","exit_code":{code}}}"#
        )
    }

    fn kinds(s: &HomeSummary) -> Vec<String> {
        s.attention
            .iter()
            .map(|i| {
                serde_json::to_value(i).unwrap()["kind"]
                    .as_str()
                    .unwrap()
                    .to_owned()
            })
            .collect()
    }

    #[test]
    fn a_fresh_install_shows_no_profile_and_the_missing_python() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        assert_eq!(s.active_profile, None);
        assert!(s.profiles.is_empty());
        assert_eq!(
            (
                s.counts.runs_since,
                s.counts.failed_since,
                s.counts.scripts_attached,
                s.counts.variables
            ),
            (0, 0, 0, 0)
        );
        assert_eq!(kinds(&s), ["package_problem"]);
        assert!(!s.python.found);
        assert_eq!(s.badges.settings, 1);
        assert_eq!(s.since, None);
    }

    #[test]
    fn a_healthy_setup_needs_no_attention() {
        let host = with_python(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "BuildVersion", RegValue::String("26.1 (1023)".into()))
                .with_registry_value(KEY, "EventScriptAllowScripting", RegValue::Dword(1)),
            Some(env!("CARGO_PKG_VERSION")),
        );
        let (_d, _f, ctx) = test_ctx(host);
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(
            &ctx,
            "set_var",
            json!({"name": "CLIENT_EMAIL", "type": "string", "value": "a@b.c"}),
        )
        .unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": COPY}),
        )
        .unwrap();
        call(&ctx, "attach_script", json!({"name": "copy.py"})).unwrap();
        write_runs(
            &ctx,
            &[
                start("a", &ts(Span::new().minutes(-5)), "p"),
                end("a", &ts(Span::new().minutes(-5)), "ok"),
            ],
        );
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        assert!(s.attention.is_empty(), "{:?}", s.attention);
        assert_eq!(
            (
                s.counts.runs_since,
                s.counts.failed_since,
                s.counts.scripts_attached,
                s.counts.variables
            ),
            (1, 0, 1, 1)
        );
        assert_eq!(s.recent_runs.len(), 1);
        assert_eq!(
            s.python.installed.as_deref(),
            Some(env!("CARGO_PKG_VERSION"))
        );
        assert_eq!(
            (
                s.badges.runs,
                s.badges.variables,
                s.badges.apps,
                s.badges.settings
            ),
            (0, 0, 0, 0)
        );
    }

    #[test]
    fn problems_are_listed_in_order_and_counted_since_the_last_open() {
        let gone = "E:\\gone\\old.py";
        let host = with_python(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "BuildVersion", RegValue::String("27.0 (1)".into()))
                .with_registry_value(KEY, "EventScriptDiskAdded", RegValue::String(gone.into())),
            Some("0.10.0"),
        );
        let (_d, _f, ctx) = test_ctx(host);
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        call(
            &ctx,
            "write_script",
            json!({"name": "copy.py", "source": COPY}),
        )
        .unwrap();
        let since = ts(Span::new().hours(-1));
        write_runs(
            &ctx,
            &[
                start("old", &ts(Span::new().hours(-2)), "p"),
                end("old", &ts(Span::new().hours(-2)), "failed"),
                start("new", &ts(Span::new().minutes(-10)), "other"),
                end("new", &ts(Span::new().minutes(-10)), "error"),
                start("ok", &ts(Span::new().minutes(-5)), "p"),
                end("ok", &ts(Span::new().minutes(-5)), "ok"),
            ],
        );
        ctx.store
            .append_activity(&ActivityRecord::now("list_runs", None, ActivityOutcome::Ok))
            .unwrap();
        let s = home_summary(&ctx, Some(&since), &PythonCache::default()).unwrap();
        assert_eq!(s.since.as_deref(), Some(since.as_str()));
        assert_eq!((s.counts.runs_since, s.counts.failed_since), (2, 1));
        assert_eq!(
            kinds(&s),
            [
                "run_failed",
                "variable_issue",
                "stale_entries",
                "package_problem",
                "app_newer"
            ]
        );
        let first = serde_json::to_value(&s.attention[0]).unwrap();
        assert_eq!(first["run_id"], "new");
        assert_eq!(first["profile"], "other");
        let var = serde_json::to_value(&s.attention[1]).unwrap();
        assert_eq!(
            var,
            json!({"kind": "variable_issue", "name": "CLIENT_EMAIL", "type": "string", "problem": "missing", "actual": null, "scripts": ["copy.py"]})
        );
        assert_eq!(
            (
                s.badges.runs,
                s.badges.variables,
                s.badges.apps,
                s.badges.settings
            ),
            (1, 1, 1, 1)
        );
        assert_eq!(s.recent_runs.len(), 3);
        assert_eq!(s.recent_activity.len(), 1);
    }

    #[test]
    fn many_failures_are_summed_up() {
        let (_d, _f, ctx) = test_ctx(with_python(
            FakeHost::new(Os::Windows),
            Some(env!("CARGO_PKG_VERSION")),
        ));
        let lines: Vec<String> = (0..5)
            .flat_map(|i| {
                let at = ts(Span::new().minutes(-(i + 1)));
                [
                    start(&format!("r{i}"), &at, "p"),
                    end(&format!("r{i}"), &at, "failed"),
                ]
            })
            .collect();
        write_runs(&ctx, &lines);
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        assert_eq!(
            kinds(&s),
            ["run_failed", "run_failed", "run_failed", "more_failed_runs"]
        );
        assert_eq!(serde_json::to_value(&s.attention[3]).unwrap()["count"], 2);
    }

    #[test]
    fn scripting_off_with_something_attached_is_flagged() {
        let own = tempfile::NamedTempFile::new().unwrap();
        let host = with_python(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "BuildVersion", RegValue::String("26.1 (1023)".into()))
                .with_registry_value(
                    KEY,
                    "EventScriptDiskAdded",
                    RegValue::String(own.path().display().to_string()),
                ),
            Some(env!("CARGO_PKG_VERSION")),
        );
        let (_d, _f, ctx) = test_ctx(host);
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        assert_eq!(kinds(&s), ["scripting_off"]);
        assert_eq!(serde_json::to_value(&s.attention[0]).unwrap()["events"], 1);
    }

    #[test]
    fn app_items_are_grouped_by_kind_across_apps_not_interleaved_per_app() {
        const FOOLCAT_KEY: &str = "HKCU\\Software\\FoolCat";
        let offshoot_script = tempfile::NamedTempFile::new().unwrap();
        let foolcat_script = tempfile::NamedTempFile::new().unwrap();
        let host = with_python(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "BuildVersion", RegValue::String("26.2 (1)".into()))
                .with_registry_value(
                    KEY,
                    "EventScriptDiskAdded",
                    RegValue::String(offshoot_script.path().display().to_string()),
                )
                .with_registry_value(
                    FOOLCAT_KEY,
                    "BuildVersion",
                    RegValue::String("26.2 (1)".into()),
                )
                .with_registry_value(
                    FOOLCAT_KEY,
                    "EventScriptReportCreated",
                    RegValue::String(foolcat_script.path().display().to_string()),
                ),
            Some(env!("CARGO_PKG_VERSION")),
        );
        let (_d, _f, ctx) = test_ctx(host);
        let s = home_summary(&ctx, None, &PythonCache::default()).unwrap();
        // Both OffShoot and FoolCat are newer than tested and have scripting
        // off with something attached: every app_newer must come before
        // every scripting_off, not app-by-app (foolcat sorts before
        // offshoot in the catalog).
        assert_eq!(
            kinds(&s),
            ["app_newer", "app_newer", "scripting_off", "scripting_off"]
        );
        let apps: Vec<String> = s
            .attention
            .iter()
            .map(|i| {
                serde_json::to_value(i).unwrap()["app"]
                    .as_str()
                    .unwrap()
                    .to_owned()
            })
            .collect();
        assert_eq!(apps, ["foolcat", "offshoot", "foolcat", "offshoot"]);
    }
}
