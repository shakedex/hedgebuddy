//! Commands only the desktop app has. They are plain functions over a
//! [`Context`], tested with `FakeHost`; the Tauri crate wraps each one. None
//! of them is ever registered as a tool, so no MCP client can reach them.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use hedgebuddy_core::python_env::{self, PythonInfo};
use hedgebuddy_core::{
    now_rfc3339, ActivityRecord, Host, Preferences, PreferencesPatch, ACTIVITY_KEEP,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{output_schema_of, schema_of, Context, NoParams, ToolError};

mod home;

pub use home::{
    home_summary, AttentionItem, HomeCounts, HomeSummary, PythonStatus, SidebarBadges,
    VariableProblem,
};

/// One app-only command's name and schemas (for the generated TypeScript).
pub struct AppCommandDef {
    /// The Tauri command name.
    pub name: &'static str,
    /// JSON Schema of its `args`.
    pub input: fn() -> Value,
    /// JSON Schema of its result.
    pub output: fn() -> Value,
}

macro_rules! app_command {
    ($name:literal, $input:ty, $output:ty) => {
        AppCommandDef {
            name: $name,
            input: || schema_of::<$input>(),
            output: || output_schema_of::<$output>(),
        }
    };
}

/// Every app-only command.
pub fn commands() -> Vec<AppCommandDef> {
    vec![
        app_command!("home_summary", NoParams, HomeSummary),
        app_command!("activity", ActivityArgs, ActivityList),
        app_command!("preferences_get", NoParams, Preferences),
        app_command!("preferences_set", PreferencesPatch, Preferences),
    ]
}

/// Every app-only command's schemas: `{"<command>": {"input", "output"}}`.
pub fn schemas() -> Value {
    let map: serde_json::Map<String, Value> = commands()
        .into_iter()
        .map(|c| {
            (
                c.name.to_owned(),
                json!({ "input": (c.input)(), "output": (c.output)() }),
            )
        })
        .collect();
    Value::Object(map)
}

/// How long the Python check behind `home_summary` is reused when an
/// interpreter is found.
pub const PYTHON_CACHE_TTL: Duration = Duration::from_secs(60);

/// How long a "not found" probe is reused, regardless of the cache's
/// configured `ttl`. On macOS without developer tools installed, running
/// `python3` pops an installation dialog, so a miss must never be retried
/// on every call the way a found interpreter's `ttl` allows.
pub const PYTHON_MISSING_TTL: Duration = Duration::from_secs(600);

/// The Python the Hedge apps use, probed at most once per `ttl` (once per
/// [`PYTHON_MISSING_TTL`] when the last probe found nothing): starting
/// Python costs tens to hundreds of milliseconds, and Home asks often.
pub struct PythonCache {
    ttl: Duration,
    slot: Mutex<Option<(Instant, Option<PythonInfo>)>>,
}

impl PythonCache {
    /// A cache that reuses a found interpreter for `ttl`, and a "not found"
    /// result for [`PYTHON_MISSING_TTL`] regardless of `ttl`.
    pub fn new(ttl: Duration) -> PythonCache {
        PythonCache {
            ttl,
            slot: Mutex::new(None),
        }
    }

    /// The cached probe, or a fresh one when it has aged past its ttl: `ttl`
    /// for a found interpreter, [`PYTHON_MISSING_TTL`] for a miss.
    pub fn get(&self, host: &dyn Host) -> Result<Option<PythonInfo>, ToolError> {
        let mut slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((at, info)) = slot.as_ref() {
            let ttl = if info.is_some() {
                self.ttl
            } else {
                PYTHON_MISSING_TTL
            };
            if at.elapsed() < ttl {
                return Ok(info.clone());
            }
        }
        let info = python_env::find_python(host)?;
        *slot = Some((Instant::now(), info.clone()));
        Ok(info)
    }

    /// Forget the cached probe, so the next `get` probes again no matter how
    /// recently the last one ran (used after the operator installs Python
    /// or the package, so Home reflects it immediately).
    pub fn invalidate(&self) {
        *self.slot.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

impl Default for PythonCache {
    fn default() -> Self {
        PythonCache::new(PYTHON_CACHE_TTL)
    }
}

/// What starting an app session found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionStart {
    /// `last_opened` as stored before this session: the session's "since".
    pub since: Option<String>,
    /// Why the new `last_opened` could not be read or stored, if so.
    pub warning: Option<String>,
}

/// How long `start_session` waits for the data folder's lock: short enough
/// that a busy lock never makes the app feel stuck at launch.
const START_SESSION_LOCK_WAIT: Duration = Duration::from_secs(1);

/// Start an app session: keep the stored `last_opened` for this session's
/// "since you last opened" figures, then store now. A busy lock or an
/// unreadable file never stops the app from starting: the write waits at
/// most [`START_SESSION_LOCK_WAIT`] for the data folder's lock (or the
/// context's own timeout, if shorter), not the full write-guard timeout.
pub fn start_session(ctx: &Context) -> SessionStart {
    let (since, mut warning) = match ctx.store.preferences() {
        Ok(p) => (p.last_opened, None),
        Err(e) => (None, Some(e.to_string())),
    };
    let wait = START_SESSION_LOCK_WAIT.min(ctx.lock_timeout);
    let stored = ctx.write_guard_within(wait).and_then(|_guard| {
        let now = PreferencesPatch {
            last_opened: Some(Some(now_rfc3339())),
            editor_command: None,
        };
        ctx.store.update_preferences(&now).map_err(ToolError::from)
    });
    if let Err(e) = stored {
        warning.get_or_insert(e.0);
    }
    SessionStart { since, warning }
}

/// Arguments of `activity`.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ActivityArgs {
    /// How many records, newest first (default and maximum 200).
    #[serde(default)]
    pub limit: Option<usize>,
}

/// Result of `activity`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ActivityList {
    /// Claude's latest tool calls, newest first.
    pub records: Vec<ActivityRecord>,
}

/// The latest Claude activity records, newest first.
pub fn activity(ctx: &Context, args: ActivityArgs) -> Result<ActivityList, ToolError> {
    let limit = args.limit.unwrap_or(ACTIVITY_KEEP).min(ACTIVITY_KEEP);
    Ok(ActivityList {
        records: ctx.store.read_activity(limit)?,
    })
}

/// The app's preferences.
pub fn preferences_get(ctx: &Context, _: NoParams) -> Result<Preferences, ToolError> {
    Ok(ctx.store.preferences()?)
}

/// Change the app's preferences under the write lock.
pub fn preferences_set(ctx: &Context, patch: PreferencesPatch) -> Result<Preferences, ToolError> {
    let _guard = ctx.write_guard()?;
    Ok(ctx.store.update_preferences(&patch)?)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::time::{Duration, Instant};

    use hedgebuddy_core::host::CommandOutput;
    use hedgebuddy_core::python_env::PROBE;
    use hedgebuddy_core::{ActivityOutcome, FakeHost, Os, Store};

    use super::*;
    use crate::test_ctx;

    fn with_found_python(host: FakeHost) -> FakeHost {
        host.with_run_response(
            "py",
            &["-3", "-c", PROBE],
            CommandOutput {
                status: 0,
                stdout: "{\"executable\": \"C:\\\\Py\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": null}\n".into(),
                stderr: String::new(),
            },
        )
    }

    #[test]
    fn app_commands_are_never_tools_and_have_object_schemas() {
        let tools: BTreeSet<&str> = crate::all().iter().map(|t| t.name).collect();
        for c in commands() {
            assert!(!tools.contains(c.name), "{} is also a tool", c.name);
            assert_eq!((c.input)()["type"], "object", "{}", c.name);
            assert_eq!((c.output)()["type"], "object", "{}", c.name);
        }
        assert_eq!(schemas().as_object().unwrap().len(), commands().len());
    }

    #[test]
    fn a_session_returns_the_previous_open_and_stores_now() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let first = start_session(&ctx);
        assert_eq!(
            first,
            SessionStart {
                since: None,
                warning: None
            }
        );
        let stored = ctx.store.preferences().unwrap().last_opened.unwrap();
        let second = start_session(&ctx);
        assert_eq!(second.since.as_deref(), Some(stored.as_str()));
    }

    #[test]
    fn a_busy_lock_does_not_stop_a_session() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = ctx.with_lock_timeout(Duration::from_millis(100));
        let _held = Store::open(ctx.store.root()).lock().unwrap();
        let s = start_session(&ctx);
        assert_eq!(s.since, None);
        assert_eq!(s.warning.as_deref(), Some(hedgebuddy_core::BUSY_MESSAGE));
    }

    #[test]
    fn a_busy_lock_does_not_stall_startup_even_with_the_default_timeout() {
        // The context's own lock_timeout (10s by default) must not be what
        // start_session waits on, or a busy lock at launch would make the
        // app appear to hang for the full ten seconds.
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let _held = Store::open(ctx.store.root()).lock().unwrap();
        let started = Instant::now();
        let s = start_session(&ctx);
        let elapsed = started.elapsed();
        assert_eq!(s.warning.as_deref(), Some(hedgebuddy_core::BUSY_MESSAGE));
        assert!(
            elapsed < Duration::from_secs(2),
            "start_session took {elapsed:?}"
        );
    }

    #[test]
    fn activity_is_newest_first_and_capped() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        for tool in ["a", "b"] {
            ctx.store
                .append_activity(&ActivityRecord::now(tool, None, ActivityOutcome::Ok))
                .unwrap();
        }
        let got = activity(&ctx, ActivityArgs { limit: Some(1) }).unwrap();
        assert_eq!(got.records.len(), 1);
        assert_eq!(got.records[0].tool, "b");
        assert_eq!(
            activity(&ctx, ActivityArgs::default())
                .unwrap()
                .records
                .len(),
            2
        );
    }

    #[test]
    fn preferences_round_trip_and_writes_wait_for_the_lock() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = ctx.with_lock_timeout(Duration::from_millis(100));
        let patch: PreferencesPatch =
            serde_json::from_str(r#"{"editor_command": "code"}"#).unwrap();
        assert_eq!(
            preferences_set(&ctx, patch.clone())
                .unwrap()
                .editor_command
                .as_deref(),
            Some("code")
        );
        assert_eq!(
            preferences_get(&ctx, NoParams {})
                .unwrap()
                .editor_command
                .as_deref(),
            Some("code")
        );
        let _held = Store::open(ctx.store.root()).lock().unwrap();
        assert!(preferences_set(&ctx, patch).unwrap_err().is_busy());
    }

    #[test]
    fn a_found_probe_is_cached_per_its_own_ttl() {
        let (_d, fake, ctx) = test_ctx(with_found_python(FakeHost::new(Os::Windows)));
        let cache = PythonCache::new(Duration::from_secs(60));
        assert!(cache.get(ctx.hedge.host()).unwrap().is_some());
        assert!(cache.get(ctx.hedge.host()).unwrap().is_some());
        assert_eq!(fake.runs().len(), 1, "{:?}", fake.runs());
        let fresh = PythonCache::new(Duration::ZERO);
        fresh.get(ctx.hedge.host()).unwrap();
        fresh.get(ctx.hedge.host()).unwrap();
        assert_eq!(fake.runs().len(), 3);
    }

    #[test]
    fn a_missing_probe_is_not_reprobed_once_its_found_ttl_elapses() {
        // A miss uses PYTHON_MISSING_TTL, not the cache's `ttl`: a
        // zero-second `ttl` (which would force a reprobe every call for a
        // found interpreter) must not do the same for a miss, or macOS
        // would pop an installer dialog on every `home_summary` call.
        let (_d, fake, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let cache = PythonCache::new(Duration::ZERO);
        assert_eq!(cache.get(ctx.hedge.host()).unwrap(), None);
        assert_eq!(cache.get(ctx.hedge.host()).unwrap(), None);
        assert_eq!(fake.runs().len(), 1, "{:?}", fake.runs());
    }

    #[test]
    fn invalidate_forces_a_fresh_probe() {
        let (_d, fake, ctx) = test_ctx(with_found_python(FakeHost::new(Os::Windows)));
        let cache = PythonCache::new(Duration::from_secs(60));
        cache.get(ctx.hedge.host()).unwrap();
        cache.get(ctx.hedge.host()).unwrap();
        assert_eq!(fake.runs().len(), 1, "{:?}", fake.runs());
        cache.invalidate();
        cache.get(ctx.hedge.host()).unwrap();
        assert_eq!(fake.runs().len(), 2, "{:?}", fake.runs());
    }
}
