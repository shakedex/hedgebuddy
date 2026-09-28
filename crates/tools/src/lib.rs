//! Every HedgeBuddy tool, defined once, plus the MCP resources and the
//! `author_script` prompt. A tool is a plain function from JSON arguments to
//! a JSON result over a [`Context`]; the MCP server, `hedgebuddy call` and the
//! desktop app all dispatch through [`call`].

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use hedgebuddy_core::{Catalog, CoreError, DataLock, Hedge, Host, RealHost, Store, LOCK_TIMEOUT};
use schemars::generate::SchemaSettings;
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

// `mod profiles` (and each later task's `mod <group>`) is declared here,
// above `tool!`'s definition, so it must reach the macro through the
// `pub(crate) use tool;` re-export below rather than through `macro_rules!`
// legacy textual scoping (which would otherwise make that re-export, or the
// group modules' own `use super::tool;`, look unused to `unused_imports`).
pub mod app;
pub(crate) mod apps;
pub(crate) mod attachments;
pub(crate) mod profiles;
pub mod resources;
pub(crate) mod scripts;
pub(crate) mod system;
pub(crate) mod variables;

/// Build a [`ToolDef`] from a name, description, hints, parameter type,
/// result type, and handler `fn(&Context, Params) -> Result<Output, ToolError>`.
macro_rules! tool {
    ($name:literal, $desc:expr, $hints:expr, $params:ty, $output:ty, $f:path) => {
        $crate::ToolDef {
            name: $name,
            description: $desc,
            hints: $hints,
            schema: || $crate::schema_of::<$params>(),
            output_schema: || $crate::output_schema_of::<$output>(),
            run: |ctx, args| {
                let params: $params = $crate::parse_args(args)?;
                let output: $output = $f(ctx, params)?;
                $crate::to_json(&output)
            },
        }
    };
}
pub(crate) use tool;

/// Everything a tool call needs.
pub struct Context {
    pub store: Store,
    pub hedge: Hedge,
    /// Set when `<data>/catalog/` has an invalid override; the embedded
    /// catalog is used instead and `environment` reports this text.
    pub catalog_error: Option<String>,
    /// Held by [`call`] around every tool that is not read-only, so writes
    /// within this process run one at a time: the store's read-modify-write
    /// updates don't lose each other's changes, and two `run_app_command`
    /// calls don't drive a Hedge app at the same time. [`Context::write_guard`]
    /// takes it together with the data folder's cross-process lock, which
    /// does the same across HedgeBuddy processes. Shared with a context
    /// rebuilt from this one (see [`Context::with_write_lock_of`]).
    pub(crate) write_lock: Arc<Mutex<()>>,
    /// How long a write waits for another HedgeBuddy process to release the
    /// data folder's lock.
    pub(crate) lock_timeout: Duration,
}

impl Context {
    /// A context over `store` and `host`, with the catalog loaded from the
    /// store's overrides folder.
    pub fn new(store: Store, host: Arc<dyn Host>) -> Context {
        let (catalog, catalog_error) = match Catalog::load(Some(&store.catalog_dir())) {
            Ok(c) => (c, None),
            Err(e) => (
                Catalog::embedded().expect("the embedded catalog is valid"),
                Some(e.to_string()),
            ),
        };
        Context {
            store,
            hedge: Hedge::new(host, catalog),
            catalog_error,
            write_lock: Arc::new(Mutex::new(())),
            lock_timeout: LOCK_TIMEOUT,
        }
    }

    /// The same context with a different wait for the data folder's lock
    /// (tests use a short one).
    pub fn with_lock_timeout(mut self, timeout: Duration) -> Context {
        self.lock_timeout = timeout;
        self
    }

    /// The same context, sharing `other`'s in-process write lock: when a
    /// context is rebuilt (the app reloads the catalog), a write on the old
    /// one and a write on the new one then wait for each other in turn,
    /// instead of the second finding the data folder's lock taken and
    /// reporting busy.
    pub fn with_write_lock_of(mut self, other: &Context) -> Context {
        self.write_lock = Arc::clone(&other.write_lock);
        self
    }

    /// Serialise a write: this process's mutex first, then the data folder's
    /// cross-process lock. Hold the guard for the whole write.
    pub fn write_guard(&self) -> Result<WriteGuard<'_>, ToolError> {
        self.write_guard_within(self.lock_timeout)
    }

    /// The same as [`Context::write_guard`], but waiting at most `timeout`
    /// for the data folder's cross-process lock regardless of
    /// [`Context::lock_timeout`]. Callers that must not stall (app startup)
    /// pass a short timeout here instead of changing the context's own.
    pub fn write_guard_within(&self, timeout: Duration) -> Result<WriteGuard<'_>, ToolError> {
        // A tool that panicked while holding the mutex leaves nothing
        // half-held in `()`, so a poisoned mutex is still safe to take.
        let process = self.write_lock.lock().unwrap_or_else(|e| e.into_inner());
        let data = self.store.lock_within(timeout)?;
        Ok(WriteGuard {
            _data: data,
            _process: process,
        })
    }

    /// The real machine and the platform data directory.
    pub fn real() -> Result<Context, ToolError> {
        Ok(Context::new(Store::at_default()?, Arc::new(RealHost)))
    }

    /// `given`, or the active profile when `None`.
    pub fn profile(&self, given: Option<&str>) -> Result<String, ToolError> {
        match given {
            Some(p) => Ok(p.to_owned()),
            None => self.store.active_profile_name()?.ok_or_else(|| {
                ToolError::new(
                    "no active profile; create one with create_profile or pass `profile`",
                )
            }),
        }
    }
}

/// Held while a write runs; see [`Context::write_guard`]. Fields drop in
/// order, so the cross-process lock is released first.
#[must_use = "the write lock is released as soon as this value is dropped"]
pub struct WriteGuard<'a> {
    _data: DataLock,
    _process: MutexGuard<'a, ()>,
}

/// A tool failure, reported to the caller as text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolError(pub String);

impl ToolError {
    /// A tool error with this message.
    pub fn new(message: impl Into<String>) -> ToolError {
        ToolError(message.into())
    }

    /// Whether this is the "another HedgeBuddy is busy" error, which the
    /// caller can offer to retry.
    pub fn is_busy(&self) -> bool {
        self.0 == hedgebuddy_core::BUSY_MESSAGE
    }
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ToolError {}

impl From<CoreError> for ToolError {
    fn from(e: CoreError) -> ToolError {
        ToolError(e.to_string())
    }
}

/// What a tool returns.
pub type ToolResult = Result<Value, ToolError>;

/// MCP behaviour hints for a tool.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Hints {
    pub read_only: bool,
    pub destructive: bool,
    pub idempotent: bool,
}

/// Reads only.
pub const READ: Hints = Hints {
    read_only: true,
    destructive: false,
    idempotent: true,
};
/// Writes inside the data directory; repeating it gives the same result.
pub const WRITE: Hints = Hints {
    read_only: false,
    destructive: false,
    idempotent: true,
};
/// Deletes, overwrites, or changes something outside the data directory.
pub const DESTRUCTIVE: Hints = Hints {
    read_only: false,
    destructive: true,
    idempotent: false,
};

/// One tool.
pub struct ToolDef {
    /// The tool's name, e.g. `list_profiles`.
    pub name: &'static str,
    /// What the tool does, as MCP clients show it.
    pub description: &'static str,
    /// MCP behaviour hints; [`call`] serializes tools that are not read-only.
    pub hints: Hints,
    /// JSON Schema of the arguments.
    pub schema: fn() -> Value,
    /// JSON Schema of the result.
    pub output_schema: fn() -> Value,
    /// Parse the JSON arguments, run the tool, and serialize its result.
    pub run: fn(&Context, Value) -> ToolResult,
}

/// Parse tool arguments; `null` counts as `{}`.
pub fn parse_args<T: DeserializeOwned>(args: Value) -> Result<T, ToolError> {
    let args = if args.is_null() { json!({}) } else { args };
    serde_json::from_value(args).map_err(|e| ToolError::new(format!("invalid arguments: {e}")))
}

/// The JSON Schema of a parameter type.
pub fn schema_of<T: JsonSchema>() -> Value {
    serde_json::to_value(schemars::schema_for!(T)).expect("schemas serialize")
}

/// The JSON Schema of a result type, describing how it serializes: a field
/// is required unless it has `skip_serializing_if`, so an `Option` that is
/// always emitted is required and nullable. A root without `type` (an
/// untagged union, whose variants are all objects) gets `"type": "object"`,
/// which MCP clients expect of an output schema. The root `$schema` key is
/// left out: MCP already treats 2020-12 as the default dialect, and a
/// client's validator might not have that meta-schema to load.
pub fn output_schema_of<T: JsonSchema>() -> Value {
    let schema = SchemaSettings::draft2020_12()
        .for_serialize()
        .into_generator()
        .into_root_schema_for::<T>();
    let mut schema = serde_json::to_value(schema).expect("schemas serialize");
    if let Some(map) = schema.as_object_mut() {
        map.remove("$schema");
        map.entry("type").or_insert_with(|| json!("object"));
    }
    schema
}

/// Every tool's input and output schema: `{"<tool>": {"input", "output"}}`.
pub fn schemas() -> Value {
    let map: serde_json::Map<String, Value> = all()
        .into_iter()
        .map(|t| {
            let entry = json!({ "input": (t.schema)(), "output": (t.output_schema)() });
            (t.name.to_owned(), entry)
        })
        .collect();
    Value::Object(map)
}

/// Why `value` does not match `def`'s output schema (empty when it does).
#[cfg(test)]
pub(crate) fn output_errors(def: &ToolDef, value: &Value) -> Vec<String> {
    let schema = (def.output_schema)();
    let validator = jsonschema::validator_for(&schema).expect("output schema compiles");
    validator
        .iter_errors(value)
        .map(|e| format!("{} at {}", e, e.instance_path()))
        .collect()
}

/// Serialize a result value.
pub fn to_json<T: Serialize>(value: &T) -> ToolResult {
    serde_json::to_value(value).map_err(|e| ToolError::new(e.to_string()))
}

/// How a call ends up in the Claude activity log: an error, a
/// `run_app_command` that stopped for the operator's approval, or ok.
pub fn activity_outcome(result: &ToolResult) -> hedgebuddy_core::ActivityOutcome {
    use hedgebuddy_core::ActivityOutcome;
    match result {
        Err(_) => ActivityOutcome::Error,
        Ok(v) if v.get("requires_confirmation").is_some() => ActivityOutcome::NeedsConfirmation,
        Ok(_) => ActivityOutcome::Ok,
    }
}

/// Parameters of tools that take none.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct NoParams {}

/// Every tool, in a stable order.
pub fn all() -> Vec<ToolDef> {
    let mut tools = Vec::new();
    tools.extend(apps::tools());
    tools.extend(attachments::tools());
    tools.extend(profiles::tools());
    tools.extend(scripts::tools());
    tools.extend(system::tools());
    tools.extend(variables::tools());
    tools
}

/// Run one tool by name. Tools that are not read-only run under
/// [`Context::write_guard`], one at a time across every HedgeBuddy process.
pub fn call(ctx: &Context, name: &str, args: Value) -> ToolResult {
    let def = all()
        .into_iter()
        .find(|t| t.name == name)
        .ok_or_else(|| ToolError::new(format!("unknown tool '{name}'")))?;
    let result = if def.hints.read_only {
        (def.run)(ctx, args)
    } else {
        let _guard = ctx.write_guard()?;
        (def.run)(ctx, args)
    };
    #[cfg(test)]
    if let Ok(value) = &result {
        let errors = output_errors(&def, value);
        assert!(
            errors.is_empty(),
            "{name} result does not match its output schema: {errors:?}\n{value:#}"
        );
    }
    result
}

#[cfg(test)]
pub(crate) fn test_ctx(
    host: hedgebuddy_core::FakeHost,
) -> (tempfile::TempDir, Arc<hedgebuddy_core::FakeHost>, Context) {
    let dir = tempfile::tempdir().unwrap();
    let fake = Arc::new(host);
    let ctx = Context::new(Store::open(dir.path().join("HedgeBuddy")), fake.clone());
    (dir, fake, ctx)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use hedgebuddy_core::{FakeHost, Os};

    use super::*;

    #[test]
    fn a_rebuilt_context_queues_behind_the_old_one_instead_of_reporting_busy() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("HedgeBuddy");
        let host = Arc::new(FakeHost::new(Os::Windows));
        let old = Context::new(Store::open(root.clone()), host.clone());
        let fresh = Context::new(Store::open(root), host)
            .with_write_lock_of(&old)
            .with_lock_timeout(Duration::from_millis(50));
        let held = old.write_guard().unwrap();
        std::thread::scope(|s| {
            let waiter = s.spawn(|| fresh.write_guard().map(drop));
            std::thread::sleep(Duration::from_millis(200));
            drop(held);
            let waited = waiter.join().unwrap();
            assert!(waited.is_ok(), "{waited:?}");
        });
    }

    #[test]
    fn tool_names_are_unique_described_and_schemas_are_objects() {
        let tools = all();
        let names: BTreeSet<&str> = tools.iter().map(|t| t.name).collect();
        assert_eq!(names.len(), tools.len(), "duplicate tool names");
        for t in &tools {
            assert!(!t.description.is_empty(), "{} has no description", t.name);
            let schema = (t.schema)();
            assert_eq!(schema["type"], "object", "{} schema: {schema}", t.name);
            assert!(
                !(t.hints.read_only && t.hints.destructive),
                "{} is both read-only and destructive",
                t.name
            );
        }
    }

    #[test]
    fn every_tool_has_object_input_and_output_schemas() {
        for t in all() {
            let input = (t.schema)();
            let output = (t.output_schema)();
            assert_eq!(input["type"], "object", "{} input: {input}", t.name);
            assert_eq!(output["type"], "object", "{} output: {output}", t.name);
            assert!(
                output.get("$schema").is_none(),
                "{} output schema names a dialect: {output}",
                t.name
            );
            jsonschema::validator_for(&output)
                .unwrap_or_else(|e| panic!("{} output schema does not compile: {e}", t.name));
        }
    }

    #[test]
    fn the_output_check_rejects_a_wrong_shape() {
        let def = all()
            .into_iter()
            .find(|t| t.name == "list_profiles")
            .unwrap();
        assert!(output_errors(&def, &json!({"active": null, "profiles": []})).is_empty());
        assert!(!output_errors(&def, &json!({"active": null, "profiles": 3})).is_empty());
    }

    #[test]
    fn output_schemas_require_every_field_that_is_always_emitted() {
        let output = |name: &str| {
            let def = all().into_iter().find(|t| t.name == name).unwrap();
            (def.output_schema)()
        };
        let list_profiles = output("list_profiles");
        let required = list_profiles["required"].as_array().unwrap();
        assert!(
            required.contains(&json!("active")),
            "an Option that is always emitted (as null) is required: {list_profiles}"
        );
        let attach = output("attach_script");
        let required = attach["required"].as_array().unwrap();
        assert!(required.contains(&json!("applied")), "{attach}");
        assert!(
            !required.contains(&json!("note")),
            "a skip_serializing_if field is optional: {attach}"
        );
    }

    #[test]
    fn schemas_cover_every_tool() {
        let s = schemas();
        let map = s.as_object().unwrap();
        assert_eq!(map.len(), all().len());
        for t in all() {
            assert!(map[t.name]["input"].is_object(), "{}", t.name);
            assert!(map[t.name]["output"].is_object(), "{}", t.name);
        }
    }

    #[test]
    fn unknown_tools_and_bad_arguments_are_errors() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        assert_eq!(
            call(&ctx, "nope", json!({})).unwrap_err().0,
            "unknown tool 'nope'"
        );
        let err = call(&ctx, "list_profiles", json!({"extra": 1})).unwrap_err();
        assert!(err.0.starts_with("invalid arguments"), "{err}");
        call(&ctx, "list_profiles", Value::Null).unwrap();
    }

    #[test]
    fn profile_defaults_to_the_active_one() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        assert!(ctx
            .profile(None)
            .unwrap_err()
            .0
            .contains("no active profile"));
        ctx.store.create_profile("p", "").unwrap();
        assert_eq!(ctx.profile(None).unwrap(), "p");
        assert_eq!(ctx.profile(Some("q")).unwrap(), "q");
    }

    #[test]
    fn a_broken_catalog_override_falls_back_and_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        std::fs::create_dir_all(store.catalog_dir()).unwrap();
        std::fs::write(store.catalog_dir().join("offshoot.toml"), "not toml [").unwrap();
        let ctx = Context::new(store, Arc::new(FakeHost::new(Os::Windows)));
        assert!(ctx
            .catalog_error
            .as_deref()
            .unwrap()
            .contains("offshoot.toml"));
        assert_eq!(ctx.hedge.catalog().apps().count(), 4);
    }

    #[test]
    fn an_override_declaring_a_license_command_falls_back() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        std::fs::create_dir_all(store.catalog_dir()).unwrap();
        let offshoot = include_str!("../../../catalog/offshoot.toml");
        std::fs::write(
            store.catalog_dir().join("offshoot.toml"),
            format!("{offshoot}\n[[commands]]\nid = \"activate\"\nform = \"url\"\n"),
        )
        .unwrap();
        let ctx = Context::new(store, Arc::new(FakeHost::new(Os::Windows)));
        assert!(ctx
            .catalog_error
            .as_deref()
            .unwrap()
            .contains("license commands are never exposed"));
        let err = call(
            &ctx,
            "run_app_command",
            json!({"app": "offshoot", "commands": [{"command": "activate"}], "dry_run": true}),
        )
        .unwrap_err();
        assert!(err.0.contains("activate"), "{err}");
    }

    #[test]
    fn concurrent_writes_to_one_profile_are_all_kept() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = Arc::new(ctx);
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let start = Arc::new(std::sync::Barrier::new(8));
        let threads: Vec<_> = (0..8)
            .map(|i| {
                let (ctx, start) = (ctx.clone(), start.clone());
                std::thread::spawn(move || {
                    // Half secrets, so both profile.json and secrets.json are rewritten.
                    let ty = if i % 2 == 0 { "string" } else { "secret" };
                    start.wait();
                    call(
                        &ctx,
                        "set_var",
                        json!({"name": format!("VAR_{i}"), "type": ty, "value": format!("v{i}")}),
                    )
                })
            })
            .collect();
        for t in threads {
            t.join().unwrap().unwrap();
        }
        let listed = call(&ctx, "list_vars", json!({})).unwrap();
        let names: BTreeSet<&str> = listed["variables"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v["name"].as_str().unwrap())
            .collect();
        let expected: BTreeSet<String> = (0..8).map(|i| format!("VAR_{i}")).collect();
        assert_eq!(
            names,
            expected.iter().map(String::as_str).collect(),
            "{listed}"
        );
        for i in 0..8 {
            let v = call(
                &ctx,
                "get_var",
                json!({"name": format!("VAR_{i}"), "reveal": true}),
            )
            .unwrap();
            assert_eq!(v["value"], format!("v{i}"), "{v}");
        }
    }

    #[test]
    fn outcomes_for_the_activity_log() {
        use hedgebuddy_core::ActivityOutcome;
        assert_eq!(
            activity_outcome(&Ok(json!({"active": "p"}))),
            ActivityOutcome::Ok
        );
        assert_eq!(
            activity_outcome(&Err(ToolError::new("nope"))),
            ActivityOutcome::Error
        );
        assert_eq!(
            activity_outcome(&Ok(
                json!({"executed": false, "requires_confirmation": ["addTransfers"]})
            )),
            ActivityOutcome::NeedsConfirmation
        );
    }

    #[test]
    fn writes_wait_for_another_holder_and_report_busy() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let ctx = ctx.with_lock_timeout(std::time::Duration::from_millis(200));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let other = Store::open(ctx.store.root());
        let held = other.lock().unwrap();
        let set = json!({"name": "A", "type": "string", "value": "x"});
        let err = call(&ctx, "set_var", set.clone()).unwrap_err();
        assert!(err.is_busy(), "{err}");
        assert_eq!(err.0, hedgebuddy_core::BUSY_MESSAGE);
        // Read-only tools never wait for the lock.
        call(&ctx, "list_vars", json!({})).unwrap();
        drop(held);
        call(&ctx, "set_var", set).unwrap();
    }
}
