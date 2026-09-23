# Phase 3: CLI and MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `hedgebuddy` binary as an MCP server over stdio (`hedgebuddy mcp`) exposing every tool in spec section 8, plus a shell surface (`hedgebuddy tools`, `hedgebuddy call <tool> <json>`) that runs the same tools, so the card scenario (spec section 14) can be driven from Claude Desktop or Claude Code with no GUI.

**Architecture:** One tool layer (`hedgebuddy_cli::tools`) defines every tool once: a name, a description, MCP hints, a JSON Schema derived from a `serde` + `schemars` parameter struct, and a plain function `fn(&Context, Params) -> Result<Value, ToolError>`. `Context` holds a `Store` and a `Hedge`. The MCP server (`hedgebuddy_cli::mcp`, on `rmcp` 3) and the `call` subcommand both dispatch through `tools::call`, so the shell and the agent see identical behaviour. All logic stays in `hedgebuddy-core`; this crate only parses arguments, calls core, masks secrets, gates confirmations, and shapes JSON. Three small core additions (Task 1) keep that true.

**Tech Stack:** Rust stable (1.98); `rmcp` 3 (`server`, `transport-io`), `tokio` 1, `schemars` 1, `serde`/`serde_json`, `clap` 4; tests with `tempfile`, `assert_cmd`, and a raw JSON-RPC client over the child process's stdio.

**Spec:** `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md` (sections 4, 8, 12, 13 item 3, 14, 15). Phase 2A/2B plans for the core API: `docs/superpowers/plans/2026-09-15-phase2a-core-storage.md`, `docs/superpowers/plans/2026-09-23-phase2b-hedge-integration.md`.

## Global Constraints

- Front ends are thin: logic lives in `hedgebuddy-core`. A tool function only resolves the profile, parses arguments, calls core, masks secrets, enforces `confirmed`, and builds JSON.
- Secrets never leave unmasked: `list_vars`/`get_var` return `"********"` for a secret's value unless `reveal: true`; `set_var` never echoes a value; no other tool returns secret values.
- Every tool that changes something outside the data directory (`attach_script`, `detach_script`, `sync_attachments`, `clear_stale_attachment`, `run_app_command`, `write_preset`, `select_preset`) and every deletion (`delete_profile`, `delete_script`, `delete_var`) accepts `dry_run` (default `false`) and carries the MCP `destructiveHint`. Read-only tools carry `readOnlyHint`.
- `run_app_command` refuses to execute commands the catalog marks `confirm = true` unless called with `confirmed: true`; it returns the plan and the list of commands needing confirmation instead.
- In `mcp` mode stdout carries only MCP protocol messages; diagnostics go to stderr.
- Tool parameter structs use `#[serde(deny_unknown_fields)]`; `profile` is optional everywhere and defaults to the active profile.
- Tool tests use `FakeHost` through `Context::new(store, host)`. The MCP contract test spawns the real binary with `HEDGEBUDDY_DATA_DIR` set to a temp folder and calls only tools that touch the data directory or the catalog.
- New dependencies in `crates/cli/Cargo.toml`: `serde`, `serde_json` (workspace), `schemars = "1"`, `rmcp = { version = "3", features = ["server", "transport-io"] }`, `tokio = { version = "1", features = ["rt-multi-thread", "macros", "io-std"] }`; dev: `tempfile = "3"`.
- Every `pub` item has a `///` doc comment (fields may stay bare, but tool parameter fields that clients fill in get a `///` line because schemars turns it into the schema description).
- `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings` stay clean on Windows and macOS; existing tests stay green.
- Branch `feat/phase3-cli-mcp`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Shell commands are for Git Bash on Windows; repo root is `E:/Coding/hedgebuddy`.

Decisions recorded for carry-overs from phase 2: `VarValue::parse` is not needed (both the CLI and MCP take JSON values); a failing `FakeHost` double is not needed yet; the debounced watcher belongs to phase 5; name newtypes are not introduced.

## Tool list

| Group | Tool | Hints |
|---|---|---|
| Profiles | `list_profiles`, `get_profile` | read |
| | `create_profile`, `set_active_profile` | write |
| | `delete_profile` | destructive, `dry_run` |
| Variables | `list_vars`, `get_var` | read (`reveal`) |
| | `set_var` | write |
| | `delete_var` | destructive, `dry_run` |
| Scripts | `list_scripts`, `read_script`, `check_script` | read |
| | `write_script` | destructive (may overwrite) |
| | `delete_script` | destructive, `dry_run` |
| Attachments | `list_attachments` | read |
| | `attach_script`, `detach_script`, `sync_attachments`, `clear_stale_attachment` | destructive, `dry_run` |
| Hedge apps | `list_apps`, `describe_app`, `read_app_log`, `list_presets` | read |
| | `run_app_command` | destructive, `dry_run`, `confirmed` |
| | `write_preset`, `select_preset` | destructive, `dry_run` |
| Runs | `list_runs`, `get_run` | read |
| System | `list_volumes`, `inspect_volume`, `environment` | read |

## File structure

| File | Responsibility |
|---|---|
| `crates/core/src/runs.rs` | + `Store::list_recent_runs` (prune, then list) |
| `crates/core/src/hedge/sync.rs` | + `Hedge::detach_script` (guarded), `Hedge::clear_stale_attachment` (guarded) |
| `crates/core/src/python_env.rs` | `PROBE`, `SYNTAX_CHECK` become `pub` (front-end tests register fake responses) |
| `crates/cli/src/lib.rs` | library root: `pub mod tools; pub mod resources; pub mod mcp;` |
| `crates/cli/src/tools/mod.rs` | `Context`, `ToolError`, `Hints`, `ToolDef`, `tool!` macro, `all()`, `call()`, test helpers |
| `crates/cli/src/tools/{profiles,variables,scripts,attachments,apps,system}.rs` | one tool group each |
| `crates/cli/src/resources.rs` | MCP resources and the `author_script` prompt, as plain functions |
| `crates/cli/src/mcp.rs` | the `rmcp` adapter: `ServerHandler` over `tools`/`resources`, `serve()` |
| `crates/cli/src/main.rs` | `env`, `tools`, `call`, `mcp` subcommands |
| `crates/cli/tests/cli.rs` | existing CLI tests + `tools`/`call` |
| `crates/cli/tests/mcp_contract.rs` | spawns `hedgebuddy mcp`, speaks JSON-RPC |
| `README.md`, `docs/smoke-checklist.md`, spec, `CHANGELOG.md` | setup, manual smoke steps, documentation |

---

### Task 1: Core additions: recent runs, guarded detach, public Python probes

**Files:**
- Modify: `crates/core/src/runs.rs`, `crates/core/src/hedge/sync.rs`, `crates/core/src/python_env.rs`

**Interfaces:**
- Produces:
  - `Store::list_recent_runs(&self, filter: &RunFilter) -> Result<Vec<Run>>`: prunes files older than `RUN_RETENTION_DAYS` using today's local date, then `list_runs(filter)`.
  - `Hedge::detach_script(&self, store: &Store, profile: &str, script: &str, dry_run: bool) -> Result<Vec<Action>>`: the script's manifest names the app/event; the event must currently be `Attached` or `Staged` to exactly this profile/script, else `CoreError::Validation`; then `detach_event`.
  - `Hedge::clear_stale_attachment(&self, app: &str, event: &str, store: &Store, dry_run: bool) -> Result<Vec<Action>>`: the event must currently be `Stale`, else `CoreError::Validation`; then `detach_event`.
  - `python_env::PROBE` and `python_env::SYNTAX_CHECK` become `pub const` with doc comments.

- [ ] **Step 1: Write the failing tests**

Append to the `tests` module in `crates/core/src/runs.rs`:
```rust
    #[test]
    fn list_recent_runs_prunes_old_files_first() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        fs::create_dir_all(store.runs_dir()).unwrap();
        fs::write(
            store.runs_dir().join("2020-01-01.jsonl"),
            r#"{"ts":"2020-01-01T00:00:00Z","run_id":"old","phase":"start","script":"a.py","profile":"p"}"#,
        )
        .unwrap();
        let today = jiff::Zoned::now().date().to_string();
        fs::write(
            store.runs_dir().join(format!("{today}.jsonl")),
            format!(r#"{{"ts":"{today}T10:00:00Z","run_id":"new","phase":"start","script":"a.py","profile":"p"}}"#),
        )
        .unwrap();
        let runs = store.list_recent_runs(&RunFilter::default()).unwrap();
        assert_eq!(runs.iter().map(|r| r.run_id.as_str()).collect::<Vec<_>>(), vec!["new"]);
        assert!(!store.runs_dir().join("2020-01-01.jsonl").exists());
    }
```

Append to the `tests` module in `crates/core/src/hedge/sync.rs`:
```rust
    #[test]
    fn detach_script_only_detaches_its_own_attachment() {
        let (_d, store, fake, hedge) = setup();
        store.create_profile("p", "").unwrap();
        store.write_script("p", "copy.py", &script("FileCopyCompleted", "")).unwrap();
        store.write_script("p", "other.py", &script("FileCopyCompleted", "")).unwrap();
        store.write_script("p", "plain.py", "print('x')\n").unwrap();
        assert!(matches!(
            hedge.detach_script(&store, "p", "copy.py", false).unwrap_err(),
            CoreError::Validation(_)
        ));
        hedge.attach_script(&store, "p", "copy.py", false).unwrap();
        assert!(matches!(
            hedge.detach_script(&store, "p", "other.py", false).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            hedge.detach_script(&store, "p", "plain.py", false).unwrap_err(),
            CoreError::Validation(_)
        ));
        let dry = hedge.detach_script(&store, "p", "copy.py", true).unwrap();
        assert_eq!(dry.len(), 1);
        assert!(reg(&fake, "EventScriptFileCopyCompleted").is_some(), "dry run must not delete");
        hedge.detach_script(&store, "p", "copy.py", false).unwrap();
        assert_eq!(reg(&fake, "EventScriptFileCopyCompleted"), None);
    }

    #[test]
    fn clear_stale_attachment_requires_a_stale_state() {
        let (_d, store, fake, hedge) = setup();
        hedge
            .apply(&[Action::RegistrySet {
                key: KEY.into(),
                value: "EventScriptDiskAdded".into(),
                data: RegValue::String("E:\\gone\\old.py".into()),
            }])
            .unwrap();
        assert!(matches!(
            hedge.clear_stale_attachment("offshoot", "DiskBusy", &store, false).unwrap_err(),
            CoreError::Validation(_)
        ));
        let dry = hedge.clear_stale_attachment("offshoot", "DiskAdded", &store, true).unwrap();
        assert_eq!(dry.len(), 1);
        assert!(reg(&fake, "EventScriptDiskAdded").is_some());
        hedge.clear_stale_attachment("offshoot", "DiskAdded", &store, false).unwrap();
        assert_eq!(reg(&fake, "EventScriptDiskAdded"), None);
    }
```

`setup()`, `script()`, `reg()`, and `KEY` already exist in that test module.

Add stub methods to the `impl Hedge` block in `sync.rs` so the tests compile:
```rust
    /// Detach a script from the app event its manifest names, but only when
    /// that event is currently attached to (or staged for) this very script.
    pub fn detach_script(&self, store: &Store, profile: &str, script: &str, dry_run: bool) -> Result<Vec<Action>> {
        todo!()
    }

    /// Detach an event whose attachment points at a file that no longer
    /// exists. Any other state is refused.
    pub fn clear_stale_attachment(&self, app: &str, event: &str, store: &Store, dry_run: bool) -> Result<Vec<Action>> {
        todo!()
    }
```
and to `impl Store` in `runs.rs`:
```rust
    /// Prune run files older than [`RUN_RETENTION_DAYS`] (by today's local
    /// date), then list runs. Front ends use this; the pure `list_runs` never
    /// deletes anything.
    pub fn list_recent_runs(&self, filter: &RunFilter) -> Result<Vec<Run>> {
        todo!()
    }
```

- [ ] **Step 2: Run to see the failures**

Run: `cargo test -p hedgebuddy-core list_recent_runs detach_script clear_stale`
(cargo accepts one filter; run the three separately if needed.)
Expected: 3 tests FAIL with `not yet implemented`.

- [ ] **Step 3: Implement**

`runs.rs`:
```rust
    pub fn list_recent_runs(&self, filter: &RunFilter) -> Result<Vec<Run>> {
        let today = jiff::Zoned::now().date();
        self.prune_runs(today, RUN_RETENTION_DAYS)?;
        self.list_runs(filter)
    }
```

`sync.rs`:
```rust
    pub fn detach_script(&self, store: &Store, profile: &str, script: &str, dry_run: bool) -> Result<Vec<Action>> {
        let check = store.check_script(profile, script)?;
        let manifest = check
            .manifest
            .ok_or_else(|| CoreError::Validation(format!("{script} has no manifest, so it is not attached")))?;
        let (Some(app), Some(event)) = (manifest.app.as_deref(), manifest.event.as_deref()) else {
            return Err(CoreError::Validation(format!("{script}'s manifest does not name an app and an event")));
        };
        let state = self.attachment(app, event, store)?.state;
        let ours = match &state {
            AttachState::Attached { path, .. } | AttachState::Staged { path, .. } => {
                managed_script(store, path) == Some((profile.to_owned(), script.to_owned()))
            }
            _ => false,
        };
        if !ours {
            return Err(CoreError::Validation(format!(
                "{app} {event} is not attached to {profile}/{script}; nothing to detach"
            )));
        }
        self.detach_event(app, event, dry_run)
    }

    pub fn clear_stale_attachment(&self, app: &str, event: &str, store: &Store, dry_run: bool) -> Result<Vec<Action>> {
        match self.attachment(app, event, store)?.state {
            AttachState::Stale { .. } => self.detach_event(app, event, dry_run),
            other => Err(CoreError::Validation(format!(
                "{app} {event} is not stale (state: {}); use detach_script or sync_attachments instead",
                serde_json::to_value(&other).ok().and_then(|v| v["state"].as_str().map(str::to_owned)).unwrap_or_default()
            ))),
        }
    }
```

`python_env.rs`: change `pub(crate) const PROBE` and `pub(crate) const SYNTAX_CHECK` to `pub const`, each with a `///` line: "The Python snippet [`find_python`] runs (public so front ends can fake its output in tests)." and "The Python snippet [`syntax_check`] runs; it compiles without executing."

- [ ] **Step 4: Run the tests, fmt, clippy**

```bash
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 3 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "feat(core): list_recent_runs, guarded detach_script and clear_stale_attachment, public Python probes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The tool layer, profile tools, and the `tools`/`call` subcommands

**Files:**
- Create: `crates/cli/src/lib.rs`, `crates/cli/src/tools/mod.rs`, `crates/cli/src/tools/profiles.rs`
- Modify: `crates/cli/Cargo.toml`, `crates/cli/src/main.rs`, `crates/cli/tests/cli.rs`

**Interfaces:**
- Consumes: `hedgebuddy_core::{Catalog, CoreError, FakeHost, Hedge, Host, Os, RealHost, Store}`.
- Produces:
  - `Context { store, hedge, catalog_error: Option<String>, command_lock }` with `Context::new(Store, Arc<dyn Host>)`, `Context::real()`, `Context::profile(Option<&str>) -> Result<String, ToolError>`.
  - `ToolError(String)` (+ `From<CoreError>`, `Display`), `ToolResult = Result<Value, ToolError>`, `Hints { read_only, destructive, idempotent }` with `READ`, `WRITE`, `DESTRUCTIVE`, `ToolDef { name, description, hints, schema: fn() -> Value, run: fn(&Context, Value) -> ToolResult }`, `parse_args`, `schema_of`, `to_json`, `NoParams`, the `tool!` macro, `all() -> Vec<ToolDef>`, `call(&Context, &str, Value) -> ToolResult`.
  - `#[cfg(test)] pub(crate) fn test_ctx(host: FakeHost) -> (tempfile::TempDir, Arc<FakeHost>, Context)`.
  - Profile tools: `list_profiles`, `get_profile`, `create_profile`, `set_active_profile`, `delete_profile`.
  - Subcommands: `hedgebuddy tools`, `hedgebuddy call <tool> [json|-]`.

- [ ] **Step 1: Crate setup**

`crates/cli/Cargo.toml` becomes:
```toml
[package]
name = "hedgebuddy-cli"
version.workspace = true
edition.workspace = true
license.workspace = true
repository.workspace = true
description = "HedgeBuddy command line and MCP server"

[lib]
name = "hedgebuddy_cli"
path = "src/lib.rs"

[[bin]]
name = "hedgebuddy"
path = "src/main.rs"

[dependencies]
clap = { workspace = true }
hedgebuddy-core = { workspace = true }
schemars = "1"
serde = { workspace = true }
serde_json = { workspace = true }

[dev-dependencies]
assert_cmd = "2"
predicates = "3"
tempfile = "3"
```
(`rmcp` and `tokio` are added in Task 8.)

`crates/cli/src/lib.rs`:
```rust
//! The HedgeBuddy tool layer and MCP server. The `hedgebuddy` binary is a thin
//! wrapper over this library; every tool is defined once in [`tools`] and
//! reached both from `hedgebuddy call` and from MCP clients.

pub mod tools;
```

- [ ] **Step 2: Write `tools/mod.rs`**

`crates/cli/src/tools/mod.rs`:
```rust
//! Every HedgeBuddy tool, defined once. A tool is a plain function from JSON
//! arguments to a JSON result over a [`Context`]; the MCP server and
//! `hedgebuddy call` both dispatch through [`call`].

use std::sync::{Arc, Mutex};

use hedgebuddy_core::{Catalog, CoreError, Hedge, Host, RealHost, Store};
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Build a [`ToolDef`] from a name, description, hints, parameter type, and
/// handler `fn(&Context, Params) -> ToolResult`.
macro_rules! tool {
    ($name:literal, $desc:expr, $hints:expr, $params:ty, $f:path) => {
        $crate::tools::ToolDef {
            name: $name,
            description: $desc,
            hints: $hints,
            schema: || $crate::tools::schema_of::<$params>(),
            run: |ctx, args| {
                let params: $params = $crate::tools::parse_args(args)?;
                $f(ctx, params)
            },
        }
    };
}
pub(crate) use tool;

mod profiles;

/// Everything a tool call needs.
pub struct Context {
    pub store: Store,
    pub hedge: Hedge,
    /// Set when `<data>/catalog/` has an invalid override; the embedded
    /// catalog is used instead and `environment` reports this text.
    pub catalog_error: Option<String>,
    pub(crate) command_lock: Mutex<()>,
}

impl Context {
    /// A context over `store` and `host`, with the catalog loaded from the
    /// store's overrides folder.
    pub fn new(store: Store, host: Arc<dyn Host>) -> Context {
        let (catalog, catalog_error) = match Catalog::load(Some(&store.catalog_dir())) {
            Ok(c) => (c, None),
            Err(e) => (Catalog::embedded().expect("the embedded catalog is valid"), Some(e.to_string())),
        };
        Context {
            store,
            hedge: Hedge::new(host, catalog),
            catalog_error,
            command_lock: Mutex::new(()),
        }
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
                ToolError::new("no active profile; create one with create_profile or pass `profile`")
            }),
        }
    }
}

/// A tool failure, reported to the caller as text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolError(pub String);

impl ToolError {
    /// A tool error with this message.
    pub fn new(message: impl Into<String>) -> ToolError {
        ToolError(message.into())
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
pub const READ: Hints = Hints { read_only: true, destructive: false, idempotent: true };
/// Writes inside the data directory; repeating it gives the same result.
pub const WRITE: Hints = Hints { read_only: false, destructive: false, idempotent: true };
/// Deletes, overwrites, or changes something outside the data directory.
pub const DESTRUCTIVE: Hints = Hints { read_only: false, destructive: true, idempotent: false };

/// One tool.
pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub hints: Hints,
    pub schema: fn() -> Value,
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

/// Serialize a result value.
pub fn to_json<T: Serialize>(value: &T) -> ToolResult {
    serde_json::to_value(value).map_err(|e| ToolError::new(e.to_string()))
}

/// Parameters of tools that take none.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct NoParams {}

/// Every tool, in a stable order.
pub fn all() -> Vec<ToolDef> {
    let mut tools = Vec::new();
    tools.extend(profiles::tools());
    tools
}

/// Run one tool by name.
pub fn call(ctx: &Context, name: &str, args: Value) -> ToolResult {
    let def = all()
        .into_iter()
        .find(|t| t.name == name)
        .ok_or_else(|| ToolError::new(format!("unknown tool '{name}'")))?;
    (def.run)(ctx, args)
}

#[cfg(test)]
pub(crate) fn test_ctx(host: hedgebuddy_core::FakeHost) -> (tempfile::TempDir, Arc<hedgebuddy_core::FakeHost>, Context) {
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
    fn tool_names_are_unique_described_and_schemas_are_objects() {
        let tools = all();
        let names: BTreeSet<&str> = tools.iter().map(|t| t.name).collect();
        assert_eq!(names.len(), tools.len(), "duplicate tool names");
        for t in &tools {
            assert!(!t.description.is_empty(), "{} has no description", t.name);
            let schema = (t.schema)();
            assert_eq!(schema["type"], "object", "{} schema: {schema}", t.name);
            assert!(!(t.hints.read_only && t.hints.destructive), "{} is both read-only and destructive", t.name);
        }
    }

    #[test]
    fn unknown_tools_and_bad_arguments_are_errors() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        assert_eq!(call(&ctx, "nope", json!({})).unwrap_err().0, "unknown tool 'nope'");
        let err = call(&ctx, "list_profiles", json!({"extra": 1})).unwrap_err();
        assert!(err.0.starts_with("invalid arguments"), "{err}");
        call(&ctx, "list_profiles", Value::Null).unwrap();
    }

    #[test]
    fn profile_defaults_to_the_active_one() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        assert!(ctx.profile(None).unwrap_err().0.contains("no active profile"));
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
        assert!(ctx.catalog_error.as_deref().unwrap().contains("offshoot.toml"));
        assert_eq!(ctx.hedge.catalog().apps().count(), 4);
    }
}
```

- [ ] **Step 3: Write `tools/profiles.rs` with failing tests**

`crates/cli/src/tools/profiles.rs`:
```rust
//! Profile tools.

use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;

use super::{tool, to_json, Context, NoParams, ToolDef, ToolResult, DESTRUCTIVE, READ, WRITE};

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

/// The profile tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!("list_profiles", "List profiles and which one is active.", READ, NoParams, list_profiles),
        tool!(
            "get_profile",
            "Show a profile: its variables (secret values are never included), its scripts, and whether it is active. Defaults to the active profile.",
            READ,
            ProfileArg,
            get_profile
        ),
        tool!(
            "create_profile",
            "Create an empty profile. The name uses lowercase letters, digits and dashes. The first profile created becomes active.",
            WRITE,
            CreateProfile,
            create_profile
        ),
        tool!(
            "set_active_profile",
            "Make a profile active. Scripts read the active profile's variables.",
            WRITE,
            NameArg,
            set_active_profile
        ),
        tool!(
            "delete_profile",
            "Delete a profile with its variables, secrets and scripts. Run with dry_run first and confirm with the operator. Detach its scripts first (sync another profile or use detach_script), or their Hedge app events will point at missing files.",
            DESTRUCTIVE,
            DeleteProfile,
            delete_profile
        ),
    ]
}

fn list_profiles(ctx: &Context, _: NoParams) -> ToolResult {
    Ok(json!({
        "active": ctx.store.active_profile_name()?,
        "profiles": ctx.store.list_profiles()?,
    }))
}

fn get_profile(ctx: &Context, p: ProfileArg) -> ToolResult {
    let name = ctx.profile(p.profile.as_deref())?;
    let profile = ctx.store.load_profile(&name)?;
    let scripts: Vec<String> = ctx.store.list_scripts(&name)?.into_iter().map(|s| s.name).collect();
    let active = ctx.store.active_profile_name()?.as_deref() == Some(name.as_str());
    Ok(json!({ "profile": to_json(&profile)?, "active": active, "scripts": scripts }))
}

fn create_profile(ctx: &Context, p: CreateProfile) -> ToolResult {
    let profile = ctx.store.create_profile(&p.name, &p.description)?;
    let active = ctx.store.active_profile_name()?.as_deref() == Some(p.name.as_str());
    Ok(json!({ "profile": to_json(&profile)?, "active": active }))
}

fn set_active_profile(ctx: &Context, p: NameArg) -> ToolResult {
    ctx.store.set_active_profile(&p.name)?;
    Ok(json!({ "active": p.name }))
}

fn delete_profile(ctx: &Context, p: DeleteProfile) -> ToolResult {
    let profile = ctx.store.load_profile(&p.name)?;
    let scripts: Vec<String> = ctx.store.list_scripts(&p.name)?.into_iter().map(|s| s.name).collect();
    if p.dry_run {
        return Ok(json!({
            "dry_run": true,
            "would_delete": { "profile": p.name, "variables": profile.variables.len(), "scripts": scripts },
        }));
    }
    ctx.store.delete_profile(&p.name)?;
    Ok(json!({ "deleted": p.name, "active": ctx.store.active_profile_name()? }))
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::tools::{call, test_ctx};

    #[test]
    fn create_list_get_and_activate() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let created = call(&ctx, "create_profile", json!({"name": "commercial-one-day", "description": "Client X"})).unwrap();
        assert_eq!(created["active"], true);
        assert_eq!(created["profile"]["name"], "commercial-one-day");
        call(&ctx, "create_profile", json!({"name": "second"})).unwrap();
        let list = call(&ctx, "list_profiles", json!({})).unwrap();
        assert_eq!(list, json!({"active": "commercial-one-day", "profiles": ["commercial-one-day", "second"]}));
        let got = call(&ctx, "get_profile", json!({})).unwrap();
        assert_eq!(got["profile"]["description"], "Client X");
        assert_eq!(got["active"], true);
        assert_eq!(got["scripts"], json!([]));
        call(&ctx, "set_active_profile", json!({"name": "second"})).unwrap();
        assert_eq!(call(&ctx, "get_profile", json!({})).unwrap()["profile"]["name"], "second");
        assert!(call(&ctx, "create_profile", json!({"name": "Bad Name"})).is_err());
    }

    #[test]
    fn delete_has_a_dry_run() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        call(&ctx, "create_profile", json!({"name": "p"})).unwrap();
        let dry = call(&ctx, "delete_profile", json!({"name": "p", "dry_run": true})).unwrap();
        assert_eq!(dry["would_delete"]["profile"], "p");
        assert!(ctx.store.profile_exists("p"));
        let done = call(&ctx, "delete_profile", json!({"name": "p"})).unwrap();
        assert_eq!(done, json!({"deleted": "p", "active": null}));
        assert!(call(&ctx, "delete_profile", json!({"name": "p"})).is_err());
    }
}
```

- [ ] **Step 4: Run the library tests**

Run: `cargo test -p hedgebuddy-cli --lib`
Expected: 4 `tools::` tests and 2 profile tests pass. (The handlers and tests land together here; this task's red-green cycle is the CLI subcommands in Step 5.)

- [ ] **Step 5: Add `tools` and `call` subcommands with failing tests**

Append to `crates/cli/tests/cli.rs`:
```rust
#[test]
fn tools_lists_every_tool() {
    hb().arg("tools")
        .assert()
        .success()
        .stdout(predicate::str::contains("list_profiles"))
        .stdout(predicate::str::contains("delete_profile"));
}

#[test]
fn call_runs_a_tool_and_prints_json() {
    let dir = tempfile::tempdir().unwrap();
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "create_profile", r#"{"name": "p"}"#])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"active\": true"));
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "list_profiles"])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"profiles\": [\n    \"p\"\n  ]"));
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "get_profile", "-"])
        .write_stdin(r#"{"profile": "p"}"#)
        .assert()
        .success()
        .stdout(predicate::str::contains("\"name\": \"p\""));
}

#[test]
fn call_reports_errors_on_stderr() {
    let dir = tempfile::tempdir().unwrap();
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "nope"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("unknown tool 'nope'"));
    hb().env("HEDGEBUDDY_DATA_DIR", dir.path())
        .args(["call", "list_profiles", "{not json"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("not JSON"));
}
```

Run: `cargo test -p hedgebuddy-cli --test cli` → the three new tests FAIL (unknown subcommand).

Replace `crates/cli/src/main.rs` with:
```rust
//! `hedgebuddy` command line. Every subcommand is a thin call into
//! `hedgebuddy_cli` / `hedgebuddy_core`; no logic lives here.

use std::io::Read;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use hedgebuddy_cli::tools::{self, Context};
use serde_json::Value;

#[derive(Parser)]
#[command(name = "hedgebuddy", version, about = "HedgeBuddy command line", arg_required_else_help = true)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Print environment information (data directory and overrides in effect)
    Env,
    /// List every tool `call` and MCP clients can use
    Tools,
    /// Run one tool with JSON arguments ("-" reads them from stdin) and print its JSON result
    Call {
        /// Tool name, as listed by `hedgebuddy tools`
        tool: String,
        /// JSON object of arguments, or "-" to read them from stdin
        #[arg(default_value = "{}")]
        args: String,
    },
}

fn main() -> ExitCode {
    match Cli::parse().command {
        Command::Env => match hedgebuddy_core::data_dir() {
            Ok(dir) => {
                println!("data_dir={}", dir.display());
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("error: {e}");
                ExitCode::FAILURE
            }
        },
        Command::Tools => {
            for t in tools::all() {
                println!("{:<24} {}", t.name, t.description);
            }
            ExitCode::SUCCESS
        }
        Command::Call { tool, args } => run_call(&tool, &args),
    }
}

fn run_call(tool: &str, args: &str) -> ExitCode {
    let text = if args == "-" {
        let mut buf = String::new();
        if let Err(e) = std::io::stdin().read_to_string(&mut buf) {
            eprintln!("error: cannot read arguments from stdin: {e}");
            return ExitCode::FAILURE;
        }
        buf
    } else {
        args.to_owned()
    };
    let args: Value = match serde_json::from_str(if text.trim().is_empty() { "{}" } else { &text }) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("error: arguments are not JSON: {e}");
            return ExitCode::FAILURE;
        }
    };
    let ctx = match Context::real() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::FAILURE;
        }
    };
    match tools::call(&ctx, tool, args) {
        Ok(v) => {
            println!("{}", serde_json::to_string_pretty(&v).expect("JSON values serialize"));
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}
```

- [ ] **Step 6: Run everything, fmt, clippy**

```bash
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 4 `tools::` tests + 2 profile tests + 3 new CLI tests pass; existing tests green.

- [ ] **Step 7: Commit**

```bash
git add crates/cli Cargo.lock
git commit -m "feat(cli): tool layer, profile tools, and the tools/call subcommands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Variable tools

**Files:**
- Create: `crates/cli/src/tools/variables.rs`
- Modify: `crates/cli/src/tools/mod.rs` (`mod variables;`, `tools.extend(variables::tools());`)

**Interfaces:**
- Consumes: `Context`, `tool!`, hints (Task 2); `Store::{list_variables, get_variable, set_variable, delete_variable}`, `ResolvedVariable`, `VariableInput`, `VarType` (core).
- Produces: `list_vars`, `get_var`, `set_var`, `delete_var`; `pub const MASK: &str = "********"`; `pub(crate) fn var_json(&ResolvedVariable, reveal: bool) -> Value` (`{name, type, description, value, missing}`).

- [ ] **Step 1: Write the module with tests**

`crates/cli/src/tools/variables.rs`:
```rust
//! Variable tools. Secret values are masked unless the caller passes
//! `reveal: true`, and `set_var` never echoes a value.

use std::str::FromStr;

use hedgebuddy_core::{ResolvedVariable, VarType, VariableInput};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{tool, Context, ToolDef, ToolError, ToolResult, DESTRUCTIVE, READ, WRITE};

/// What a masked secret value looks like.
pub const MASK: &str = "********";

/// Arguments of `list_vars`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ListVars {
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Show secret values. Only when the operator explicitly asks to see a secret.
    #[serde(default)]
    pub reveal: bool,
}

/// Arguments of `get_var`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GetVar {
    /// Variable name (UPPER_SNAKE_CASE).
    pub name: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Show the value if it is a secret. Only when the operator explicitly asks.
    #[serde(default)]
    pub reveal: bool,
}

/// Arguments of `set_var`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SetVar {
    /// Variable name (UPPER_SNAKE_CASE).
    pub name: String,
    /// One of: string, secret, int, float, bool, path, url, string[], path[].
    #[serde(rename = "type")]
    pub ty: String,
    /// The value, as JSON matching the type (secret and url are strings; string[] and path[] are arrays of strings).
    pub value: Value,
    /// What the variable is for.
    #[serde(default)]
    pub description: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
}

/// Arguments of `delete_var`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DeleteVar {
    /// Variable name.
    pub name: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Report what would be deleted without deleting.
    #[serde(default)]
    pub dry_run: bool,
}

/// The variable tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_vars",
            "List a profile's variables. Secret values are shown as ******** unless reveal is true; set reveal only when the operator explicitly asks to see a secret.",
            READ,
            ListVars,
            list_vars
        ),
        tool!(
            "get_var",
            "Show one variable. Secret values are masked unless reveal is true (only on the operator's explicit request).",
            READ,
            GetVar,
            get_var
        ),
        tool!(
            "set_var",
            "Create or replace a variable. type is string, secret, int, float, bool, path, url, string[] or path[]; value must match it. Secret values are stored separately and never returned by this tool.",
            WRITE,
            SetVar,
            set_var
        ),
        tool!(
            "delete_var",
            "Delete a variable and its secret value. Run with dry_run first.",
            DESTRUCTIVE,
            DeleteVar,
            delete_var
        ),
    ]
}

/// A variable as tools return it, with secrets masked unless `reveal`.
pub(crate) fn var_json(v: &ResolvedVariable, reveal: bool) -> Value {
    let masked = v.ty == VarType::Secret && !reveal;
    let value = match &v.value {
        Some(_) if masked => json!(MASK),
        Some(value) => value.clone(),
        None => Value::Null,
    };
    json!({
        "name": v.name,
        "type": v.ty.as_str(),
        "description": v.description,
        "value": value,
        "missing": v.value.is_none(),
    })
}

fn list_vars(ctx: &Context, p: ListVars) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    let vars: Vec<Value> = ctx
        .store
        .list_variables(&profile)?
        .iter()
        .map(|v| var_json(v, p.reveal))
        .collect();
    Ok(json!({ "profile": profile, "variables": vars }))
}

fn get_var(ctx: &Context, p: GetVar) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    let v = ctx.store.get_variable(&profile, &p.name)?;
    let mut out = var_json(&v, p.reveal);
    out["profile"] = json!(profile);
    Ok(out)
}

fn set_var(ctx: &Context, p: SetVar) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    let ty = VarType::from_str(&p.ty).map_err(ToolError::from)?;
    ctx.store.set_variable(
        &profile,
        &p.name,
        VariableInput { ty, value: Some(p.value), description: p.description.clone() },
    )?;
    Ok(json!({ "profile": profile, "name": p.name, "type": ty.as_str(), "description": p.description }))
}

fn delete_var(ctx: &Context, p: DeleteVar) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    let v = ctx.store.get_variable(&profile, &p.name)?;
    if p.dry_run {
        return Ok(json!({ "dry_run": true, "would_delete": { "profile": profile, "name": v.name, "type": v.ty.as_str() } }));
    }
    ctx.store.delete_variable(&profile, &p.name)?;
    Ok(json!({ "deleted": p.name, "profile": profile }))
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use super::MASK;
    use crate::tools::{call, test_ctx};

    fn ctx_with_profile() -> (tempfile::TempDir, crate::tools::Context) {
        let (d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        ctx.store.create_profile("p", "").unwrap();
        (d, ctx)
    }

    #[test]
    fn secrets_are_masked_unless_revealed_and_never_echoed() {
        let (_d, ctx) = ctx_with_profile();
        let set = call(&ctx, "set_var", json!({"name": "HOOK", "type": "secret", "value": "https://hook"})).unwrap();
        assert!(!set.to_string().contains("https://hook"), "set_var echoed the secret: {set}");
        call(&ctx, "set_var", json!({"name": "PROJECT_NAME", "type": "string", "value": "Spot"})).unwrap();
        let listed = call(&ctx, "list_vars", json!({})).unwrap();
        let vars = listed["variables"].as_array().unwrap();
        assert_eq!(vars[0]["name"], "HOOK");
        assert_eq!(vars[0]["value"], MASK);
        assert_eq!(vars[0]["missing"], false);
        assert_eq!(vars[1]["value"], "Spot");
        assert!(!listed.to_string().contains("https://hook"));
        let revealed = call(&ctx, "get_var", json!({"name": "HOOK", "reveal": true})).unwrap();
        assert_eq!(revealed["value"], "https://hook");
        assert_eq!(call(&ctx, "get_var", json!({"name": "HOOK"})).unwrap()["value"], MASK);
    }

    #[test]
    fn values_are_validated_against_types() {
        let (_d, ctx) = ctx_with_profile();
        assert!(call(&ctx, "set_var", json!({"name": "N", "type": "date", "value": "x"})).unwrap_err().0.contains("unknown variable type"));
        assert!(call(&ctx, "set_var", json!({"name": "N", "type": "int", "value": "3"})).is_err());
        assert!(call(&ctx, "set_var", json!({"name": "lower", "type": "string", "value": "x"})).is_err());
        call(&ctx, "set_var", json!({"name": "ROOTS", "type": "path[]", "value": ["D:/A", "F:/B"]})).unwrap();
        assert_eq!(call(&ctx, "get_var", json!({"name": "ROOTS"})).unwrap()["value"], json!(["D:/A", "F:/B"]));
        assert!(call(&ctx, "get_var", json!({"name": "MISSING"})).unwrap_err().0.contains("not found"));
    }

    #[test]
    fn delete_has_a_dry_run() {
        let (_d, ctx) = ctx_with_profile();
        call(&ctx, "set_var", json!({"name": "A", "type": "bool", "value": true})).unwrap();
        let dry = call(&ctx, "delete_var", json!({"name": "A", "dry_run": true})).unwrap();
        assert_eq!(dry["would_delete"]["name"], "A");
        call(&ctx, "get_var", json!({"name": "A"})).unwrap();
        call(&ctx, "delete_var", json!({"name": "A"})).unwrap();
        assert!(call(&ctx, "get_var", json!({"name": "A"})).is_err());
    }
}
```

- [ ] **Step 2: Register and run**

In `tools/mod.rs` add `mod variables;` after `mod profiles;` and `tools.extend(variables::tools());` in `all()`.

```bash
cargo test -p hedgebuddy-cli
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 3 new tests pass (the tests are written against complete handlers; to see them fail first, comment out the `tools.extend(variables::tools())` line, run, observe `unknown tool 'set_var'`, and restore it — record both runs in the report).

- [ ] **Step 3: Commit**

```bash
git add crates/cli
git commit -m "feat(cli): variable tools with secret masking

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Script tools

**Files:**
- Create: `crates/cli/src/tools/scripts.rs`
- Modify: `crates/cli/src/tools/mod.rs`

**Interfaces:**
- Consumes: `Context`, `tool!`, `to_json` (Task 2); `Store::{list_scripts, read_script, write_script, delete_script, check_script, script_path}`, `parse_manifest`, `validate_script_name`, `hedge::{validate_manifest, managed_script, AttachState}`, `python_env::{find_python, syntax_check}` (core).
- Produces: `list_scripts`, `read_script`, `write_script`, `delete_script`, `check_script`; `pub(crate) fn attached_to(ctx, profile, script) -> Vec<Value>` (`[{app, event}]` for events attached/staged to this script; apps whose state cannot be read are skipped).

- [ ] **Step 1: Write the module with tests**

`crates/cli/src/tools/scripts.rs`:
```rust
//! Script tools.

use hedgebuddy_core::hedge::{managed_script, validate_manifest, AttachState};
use hedgebuddy_core::{parse_manifest, python_env, validate_script_name};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{tool, to_json, Context, ToolDef, ToolResult, DESTRUCTIVE, READ};
use crate::tools::profiles::ProfileArg;

/// A script in a profile.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ScriptArg {
    /// Script file name, e.g. `on_copy_complete.py`.
    pub name: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
}

/// Arguments of `write_script`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct WriteScript {
    /// Script file name ending in `.py`.
    pub name: String,
    /// The full Python source, starting with the manifest docstring.
    pub source: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
}

/// A script plus `dry_run`.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ScriptDry {
    /// Script file name.
    pub name: String,
    /// Profile name; defaults to the active profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Report what would happen without doing it.
    #[serde(default)]
    pub dry_run: bool,
}

/// The script tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_scripts",
            "List a profile's scripts with their manifests (target app/event and required variables). Defaults to the active profile.",
            READ,
            ProfileArg,
            list_scripts
        ),
        tool!("read_script", "Return a script's source.", READ, ScriptArg, read_script),
        tool!(
            "write_script",
            "Create or replace a script. The source must start with a docstring whose first part is the JSON manifest, e.g. {\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\", \"requires\": {...}} followed by a line ---. The app and event are checked against the catalog (see describe_app). Returns unmet requirements; set them with set_var before attaching.",
            DESTRUCTIVE,
            WriteScript,
            write_script
        ),
        tool!(
            "delete_script",
            "Delete a script. Run with dry_run first; the result lists Hedge app events still attached to it (detach them first with detach_script).",
            DESTRUCTIVE,
            ScriptDry,
            delete_script
        ),
        tool!(
            "check_script",
            "Check a script without running it: manifest against the catalog, required variables against the profile, and a Python compile check with the interpreter Hedge apps use.",
            READ,
            ScriptArg,
            check_script
        ),
    ]
}

/// Events currently attached to (or staged for) `profile/script`, across all
/// apps. Apps whose attachment state cannot be read are skipped.
pub(crate) fn attached_to(ctx: &Context, profile: &str, script: &str) -> Vec<Value> {
    let mut out = Vec::new();
    for app in ctx.hedge.catalog().apps() {
        let Ok(list) = ctx.hedge.attachments(&app.app.id, &ctx.store) else { continue };
        for a in list {
            let path = match &a.state {
                AttachState::Attached { path, .. } | AttachState::Staged { path, .. } => path,
                _ => continue,
            };
            if managed_script(&ctx.store, path) == Some((profile.to_owned(), script.to_owned())) {
                out.push(json!({ "app": a.app, "event": a.event }));
            }
        }
    }
    out
}

fn list_scripts(ctx: &Context, p: ProfileArg) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    Ok(json!({ "profile": profile, "scripts": to_json(&ctx.store.list_scripts(&profile)?)? }))
}

fn read_script(ctx: &Context, p: ScriptArg) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    Ok(json!({ "profile": profile, "name": p.name, "source": ctx.store.read_script(&profile, &p.name)? }))
}

fn write_script(ctx: &Context, p: WriteScript) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    validate_script_name(&p.name)?;
    if let Some(manifest) = parse_manifest(&p.source)? {
        validate_manifest(ctx.hedge.catalog(), &manifest)?;
    }
    let replaced = ctx.store.script_path(&profile, &p.name).is_file();
    ctx.store.write_script(&profile, &p.name, &p.source)?;
    let check = ctx.store.check_script(&profile, &p.name)?;
    Ok(json!({
        "profile": profile,
        "name": p.name,
        "replaced": replaced,
        "manifest": to_json(&check.manifest)?,
        "unmet": to_json(&check.issues)?,
    }))
}

fn delete_script(ctx: &Context, p: ScriptDry) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    ctx.store.read_script(&profile, &p.name)?; // exists?
    let attached = attached_to(ctx, &profile, &p.name);
    if p.dry_run {
        return Ok(json!({ "dry_run": true, "would_delete": { "profile": profile, "name": p.name }, "attached_to": attached }));
    }
    ctx.store.delete_script(&profile, &p.name)?;
    Ok(json!({ "deleted": p.name, "profile": profile, "left_attached": attached }))
}

fn check_script(ctx: &Context, p: ScriptArg) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    let check = ctx.store.check_script(&profile, &p.name)?;
    let catalog_error = check
        .manifest
        .as_ref()
        .and_then(|m| validate_manifest(ctx.hedge.catalog(), m).err())
        .map(|e| e.to_string());
    let host = ctx.hedge.host();
    let (python, syntax_error) = match python_env::find_python(host)? {
        Some(info) => {
            let err = python_env::syntax_check(host, &info.executable, &ctx.store.script_path(&profile, &p.name))?;
            (Some(info.executable), err)
        }
        None => (None, None),
    };
    let ok = check.issues.is_empty() && catalog_error.is_none() && syntax_error.is_none();
    Ok(json!({
        "profile": profile,
        "name": p.name,
        "manifest": to_json(&check.manifest)?,
        "unmet": to_json(&check.issues)?,
        "catalog_error": catalog_error,
        "syntax_checked": python.is_some(),
        "python": python,
        "syntax_error": syntax_error,
        "ok": ok,
    }))
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::CommandOutput;
    use hedgebuddy_core::python_env::{PROBE, SYNTAX_CHECK};
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::tools::{call, test_ctx};

    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\", \"requires\": {\"HOOK\": {\"type\": \"secret\"}}}\n---\n\"\"\"\nprint('x')\n";

    #[test]
    fn write_validates_against_the_catalog_and_reports_unmet() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        ctx.store.create_profile("p", "").unwrap();
        let out = call(&ctx, "write_script", json!({"name": "copy.py", "source": COPY})).unwrap();
        assert_eq!(out["replaced"], false);
        assert_eq!(out["manifest"]["event"], "FileCopyCompleted");
        assert_eq!(out["unmet"][0]["name"], "HOOK");
        assert_eq!(call(&ctx, "write_script", json!({"name": "copy.py", "source": COPY})).unwrap()["replaced"], true);
        let bad = COPY.replace("FileCopyCompleted", "Nope");
        assert!(call(&ctx, "write_script", json!({"name": "bad.py", "source": bad})).unwrap_err().0.contains("Nope"));
        assert!(!ctx.store.script_path("p", "bad.py").exists());
        assert!(call(&ctx, "write_script", json!({"name": "../x.py", "source": "x"})).is_err());
        assert_eq!(call(&ctx, "read_script", json!({"name": "copy.py"})).unwrap()["source"], COPY);
        assert_eq!(call(&ctx, "list_scripts", json!({})).unwrap()["scripts"][0]["name"], "copy.py");
    }

    #[test]
    fn check_without_python_skips_the_compile_step() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        ctx.store.create_profile("p", "").unwrap();
        call(&ctx, "write_script", json!({"name": "copy.py", "source": COPY})).unwrap();
        let out = call(&ctx, "check_script", json!({"name": "copy.py"})).unwrap();
        assert_eq!(out["syntax_checked"], false);
        assert_eq!(out["ok"], false, "HOOK is unmet");
        assert_eq!(out["catalog_error"], serde_json::Value::Null);
    }

    #[test]
    fn check_reports_compile_errors_from_python() {
        let dir = tempfile::tempdir().unwrap();
        let store_root = dir.path().join("HedgeBuddy");
        let script_s = hedgebuddy_core::Store::open(&store_root)
            .script_path("p", "plain.py")
            .to_string_lossy()
            .to_string();
        let host = FakeHost::new(Os::Windows)
            .with_run_response(
                "py",
                &["-3", "-c", PROBE],
                CommandOutput {
                    status: 0,
                    stdout: "{\"executable\": \"C:\\\\Py\\\\python.exe\", \"version\": \"3.13.5\", \"hedgebuddy\": null}\n".into(),
                    stderr: String::new(),
                },
            )
            .with_run_response(
                "C:\\Py\\python.exe",
                &["-c", SYNTAX_CHECK, &script_s],
                CommandOutput { status: 1, stdout: String::new(), stderr: "SyntaxError: 'return' outside function\n".into() },
            );
        let ctx = crate::tools::Context::new(hedgebuddy_core::Store::open(&store_root), std::sync::Arc::new(host));
        ctx.store.create_profile("p", "").unwrap();
        call(&ctx, "write_script", json!({"name": "plain.py", "source": "return 1\n"})).unwrap();
        let out = call(&ctx, "check_script", json!({"name": "plain.py"})).unwrap();
        assert_eq!(out["syntax_checked"], true);
        assert_eq!(out["syntax_error"], "SyntaxError: 'return' outside function");
        assert_eq!(out["ok"], false);
    }

    #[test]
    fn delete_reports_attachments_and_has_a_dry_run() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows).with_registry_key("HKCU\\Software\\Hedge"));
        ctx.store.create_profile("p", "").unwrap();
        let plain = COPY.replace(", \"requires\": {\"HOOK\": {\"type\": \"secret\"}}", "");
        call(&ctx, "write_script", json!({"name": "copy.py", "source": plain})).unwrap();
        ctx.hedge.attach_script(&ctx.store, "p", "copy.py", false).unwrap();
        let dry = call(&ctx, "delete_script", json!({"name": "copy.py", "dry_run": true})).unwrap();
        assert_eq!(dry["attached_to"], json!([{"app": "offshoot", "event": "FileCopyCompleted"}]));
        assert!(ctx.store.script_path("p", "copy.py").is_file());
        let done = call(&ctx, "delete_script", json!({"name": "copy.py"})).unwrap();
        assert_eq!(done["left_attached"][0]["event"], "FileCopyCompleted");
        assert!(!ctx.store.script_path("p", "copy.py").exists());
    }
}
```

`crate::tools::profiles::ProfileArg` must be reachable: make the `profiles` module `pub(crate) mod profiles;` in `tools/mod.rs` (and do the same for later groups so types can be shared).

Note: `hedgebuddy_core::host::CommandOutput` — `host` is a public module in core; `CommandOutput` is not re-exported at the crate root, so the module path is required.

- [ ] **Step 2: Register and run**

In `tools/mod.rs`: `pub(crate) mod scripts;` and `tools.extend(scripts::tools());`. Change `mod profiles;` and `mod variables;` to `pub(crate) mod`.

```bash
cargo test -p hedgebuddy-cli
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 4 new tests pass (record a RED run with the `extend` line commented out, as in Task 3).

- [ ] **Step 3: Commit**

```bash
git add crates/cli
git commit -m "feat(cli): script tools with catalog validation and compile checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Attachment tools

**Files:**
- Create: `crates/cli/src/tools/attachments.rs`
- Modify: `crates/cli/src/tools/mod.rs`

**Interfaces:**
- Consumes: `ScriptDry` (Task 4), `ProfileArg` (Task 2); `Hedge::{attachments, attach_script, detach_script, sync_attachments, clear_stale_attachment}` (core, Task 1 for the last two).
- Produces: `list_attachments`, `attach_script`, `detach_script`, `sync_attachments`, `clear_stale_attachment`.

- [ ] **Step 1: Write the module with tests**

`crates/cli/src/tools/attachments.rs`:
```rust
//! Attaching scripts to Hedge app events.

use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;

use super::{tool, to_json, Context, ToolDef, ToolResult, DESTRUCTIVE, READ};
use crate::tools::scripts::ScriptDry;

const APPLY_NOTE: &str = "On macOS the change is staged in the OffShoot Helper workspace HedgeBuddy.json; the operator applies it from the OffShoot Helper menu. The Hedge app may need a restart to pick up the change (unverified).";

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

/// The attachment tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_attachments",
            "Show what every event of a Hedge app is attached to: attached (a HedgeBuddy script), external (the operator's own file), stale (a file that no longer exists), staged (macOS, waiting to be applied in OffShoot Helper), detached, manual, or unsupported.",
            READ,
            AppArg,
            list_attachments
        ),
        tool!(
            "attach_script",
            "Attach a script to the app event its manifest names. Changes the Hedge app's settings: run with dry_run first and show the operator the planned change, including `replaces` if something else was attached. Refuses scripts with unmet requirements.",
            DESTRUCTIVE,
            ScriptDry,
            attach_script
        ),
        tool!(
            "detach_script",
            "Detach a script from its app event, only if that event is attached to this script. Run with dry_run first.",
            DESTRUCTIVE,
            ScriptDry,
            detach_script
        ),
        tool!(
            "sync_attachments",
            "Make the Hedge apps run this profile's scripts: attach every script whose manifest names an app event, and detach other profiles' HedgeBuddy scripts from events this profile does not use. The operator's own (external) scripts are never detached. Run with dry_run first and show the report.",
            DESTRUCTIVE,
            ProfileDry,
            sync_attachments
        ),
        tool!(
            "clear_stale_attachment",
            "Detach an app event that points at a script file that no longer exists (state stale). Refuses any other state. Run with dry_run first.",
            DESTRUCTIVE,
            AppEventDry,
            clear_stale_attachment
        ),
    ]
}

fn list_attachments(ctx: &Context, p: AppArg) -> ToolResult {
    Ok(json!({ "app": p.app, "events": to_json(&ctx.hedge.attachments(&p.app, &ctx.store)?)? }))
}

fn attach_script(ctx: &Context, p: ScriptDry) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    let plan = ctx.hedge.attach_script(&ctx.store, &profile, &p.name, p.dry_run)?;
    let mut out = to_json(&plan)?;
    out["applied"] = json!(!p.dry_run);
    out["note"] = json!(APPLY_NOTE);
    Ok(out)
}

fn detach_script(ctx: &Context, p: ScriptDry) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    let actions = ctx.hedge.detach_script(&ctx.store, &profile, &p.name, p.dry_run)?;
    Ok(json!({ "profile": profile, "script": p.name, "actions": to_json(&actions)?, "applied": !p.dry_run, "note": APPLY_NOTE }))
}

fn sync_attachments(ctx: &Context, p: ProfileDry) -> ToolResult {
    let profile = ctx.profile(p.profile.as_deref())?;
    let mut out = to_json(&ctx.hedge.sync_attachments(&ctx.store, &profile, p.dry_run)?)?;
    out["note"] = json!(APPLY_NOTE);
    Ok(out)
}

fn clear_stale_attachment(ctx: &Context, p: AppEventDry) -> ToolResult {
    let actions = ctx.hedge.clear_stale_attachment(&p.app, &p.event, &ctx.store, p.dry_run)?;
    Ok(json!({ "app": p.app, "event": p.event, "actions": to_json(&actions)?, "applied": !p.dry_run }))
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::RegValue;
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::tools::{call, test_ctx};

    const KEY: &str = "HKCU\\Software\\Hedge";
    const COPY: &str = "\"\"\"\n{\"hedgebuddy\": 1, \"app\": \"offshoot\", \"event\": \"FileCopyCompleted\"}\n---\n\"\"\"\n";

    #[test]
    fn attach_detach_and_list() {
        let (_d, fake, ctx) = test_ctx(FakeHost::new(Os::Windows).with_registry_key(KEY));
        ctx.store.create_profile("p", "").unwrap();
        ctx.store.write_script("p", "copy.py", COPY).unwrap();
        let dry = call(&ctx, "attach_script", json!({"name": "copy.py", "dry_run": true})).unwrap();
        assert_eq!(dry["applied"], false);
        assert_eq!(dry["event"], "FileCopyCompleted");
        assert!(fake.registry_value(KEY, "EventScriptFileCopyCompleted").is_none());
        call(&ctx, "attach_script", json!({"name": "copy.py"})).unwrap();
        assert!(fake.registry_value(KEY, "EventScriptFileCopyCompleted").is_some());
        let list = call(&ctx, "list_attachments", json!({"app": "offshoot"})).unwrap();
        let fcc = list["events"].as_array().unwrap().iter().find(|e| e["event"] == "FileCopyCompleted").unwrap().clone();
        assert_eq!(fcc["state"], "attached");
        assert_eq!(fcc["script"], "copy.py");
        call(&ctx, "detach_script", json!({"name": "copy.py"})).unwrap();
        assert!(fake.registry_value(KEY, "EventScriptFileCopyCompleted").is_none());
        assert!(call(&ctx, "detach_script", json!({"name": "copy.py"})).is_err());
    }

    #[test]
    fn sync_and_clear_stale() {
        let (_d, fake, ctx) = test_ctx(
            FakeHost::new(Os::Windows)
                .with_registry_value(KEY, "EventScriptDiskAdded", RegValue::String("E:\\gone\\old.py".into())),
        );
        ctx.store.create_profile("p", "").unwrap();
        ctx.store.write_script("p", "copy.py", COPY).unwrap();
        let dry = call(&ctx, "sync_attachments", json!({"dry_run": true})).unwrap();
        assert_eq!(dry["attach"][0]["script"], "copy.py");
        assert_eq!(dry["applied"], false);
        call(&ctx, "sync_attachments", json!({})).unwrap();
        assert!(fake.registry_value(KEY, "EventScriptFileCopyCompleted").is_some());
        assert!(call(&ctx, "clear_stale_attachment", json!({"app": "offshoot", "event": "DiskBusy"})).is_err());
        call(&ctx, "clear_stale_attachment", json!({"app": "offshoot", "event": "DiskAdded", "dry_run": true})).unwrap();
        assert!(fake.registry_value(KEY, "EventScriptDiskAdded").is_some());
        call(&ctx, "clear_stale_attachment", json!({"app": "offshoot", "event": "DiskAdded"})).unwrap();
        assert!(fake.registry_value(KEY, "EventScriptDiskAdded").is_none());
    }
}
```

`hedgebuddy_core::host::RegValue` is reachable through the public `host` module.

- [ ] **Step 2: Register and run**

`pub(crate) mod attachments;` and `tools.extend(attachments::tools());` in `tools/mod.rs`.

```bash
cargo test -p hedgebuddy-cli
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 2 new tests pass (record a RED run with the `extend` line commented out).

- [ ] **Step 3: Commit**

```bash
git add crates/cli
git commit -m "feat(cli): attachment tools (attach, detach, sync, clear stale, list)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hedge app tools

**Files:**
- Create: `crates/cli/src/tools/apps.rs`
- Modify: `crates/cli/src/tools/mod.rs`

**Interfaces:**
- Consumes: `AppArg` (Task 5); `Hedge::{apps, describe_app, plan_commands, run_commands, read_app_log, list_presets, selected_preset, plan_write_preset, plan_select_preset, apply}`, `hedge::{CommandCall, LogKind, Preset}`; `Context::command_lock`.
- Produces: `list_apps`, `describe_app`, `run_app_command`, `read_app_log`, `list_presets`, `write_preset`, `select_preset`.
- Behaviour of `run_app_command`: plans first (validation errors surface without side effects); `dry_run` → `{executed: false, dry_run: true, plan}`; commands needing confirmation without `confirmed: true` → `{executed: false, requires_confirmation: [...], plan, message}`; otherwise holds `command_lock`, runs with `wait_seconds` (default 5, capped at 30; 0 = do not wait) → `{executed: true, outcome}`.

- [ ] **Step 1: Write the module with tests**

`crates/cli/src/tools/apps.rs`:
```rust
//! Hedge app tools: status, commands, presets, logs.

use std::time::Duration;

use hedgebuddy_core::hedge::{CommandCall, LogKind, Preset};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Map, Value};

use super::{tool, to_json, Context, NoParams, ToolDef, ToolError, ToolResult, DESTRUCTIVE, READ};
use crate::tools::attachments::AppArg;

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

/// The Hedge app tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_apps",
            "List Hedge apps: installed or not, version, whether scripting is enabled, and warnings (for example an app newer than HedgeBuddy's catalog).",
            READ,
            NoParams,
            list_apps
        ),
        tool!(
            "describe_app",
            "Everything about one Hedge app: status, events with the exact payload keys scripts receive, commands with parameter types, file locations, and the documentation URL.",
            READ,
            AppArg,
            describe_app
        ),
        tool!(
            "run_app_command",
            "Run Hedge app URL commands in order (for OffShoot: reset, setSource, setDestination, addTransfers, reloadPresets...). Run with dry_run first and show the operator the plan. Commands listed in requires_confirmation run only when called again with confirmed: true after the operator agrees. Returns the app's callback-log responses.",
            DESTRUCTIVE,
            RunCommand,
            run_app_command
        ),
        tool!(
            "read_app_log",
            "Read the last lines of a Hedge app's callback log (URL command responses) or event log.",
            READ,
            ReadLog,
            read_app_log
        ),
        tool!(
            "list_presets",
            "List the app's presets (folder pattern, label pattern, counter) and which one is selected.",
            READ,
            AppArg,
            list_presets
        ),
        tool!(
            "write_preset",
            "Create or update a preset file. Run with dry_run first. Afterwards run run_app_command with reloadPresets so the app sees it.",
            DESTRUCTIVE,
            WritePreset,
            write_preset
        ),
        tool!(
            "select_preset",
            "Make a preset the selected one (Windows). Whether a running app picks up the change is unverified; a restart may be needed.",
            DESTRUCTIVE,
            SelectPreset,
            select_preset
        ),
    ]
}

fn list_apps(ctx: &Context, _: NoParams) -> ToolResult {
    Ok(json!({ "apps": to_json(&ctx.hedge.apps()?)? }))
}

fn describe_app(ctx: &Context, p: AppArg) -> ToolResult {
    to_json(&ctx.hedge.describe_app(&p.app)?)
}

fn run_app_command(ctx: &Context, p: RunCommand) -> ToolResult {
    let calls: Vec<CommandCall> = p
        .commands
        .into_iter()
        .map(|c| CommandCall { command: c.command, params: c.params })
        .collect();
    let plan = ctx.hedge.plan_commands(&p.app, &calls)?;
    if p.dry_run {
        return Ok(json!({ "executed": false, "dry_run": true, "plan": to_json(&plan)? }));
    }
    if !plan.confirm.is_empty() && !p.confirmed {
        return Ok(json!({
            "executed": false,
            "requires_confirmation": plan.confirm.clone(),
            "plan": to_json(&plan)?,
            "message": "Ask the operator to approve these commands, then call run_app_command again with confirmed: true.",
        }));
    }
    let wait = Duration::from_secs(p.wait_seconds.unwrap_or(5).min(30));
    let _guard = ctx.command_lock.lock().map_err(|_| ToolError::new("command lock poisoned"))?;
    let outcome = ctx.hedge.run_commands(&p.app, &calls, wait)?;
    Ok(json!({ "executed": true, "outcome": to_json(&outcome)? }))
}

fn read_app_log(ctx: &Context, p: ReadLog) -> ToolResult {
    let kind = match p.log.as_str() {
        "callback" => LogKind::Callback,
        "event" => LogKind::Event,
        other => return Err(ToolError::new(format!("log must be \"callback\" or \"event\", not \"{other}\""))),
    };
    let lines = ctx.hedge.read_app_log(&p.app, kind, p.lines.unwrap_or(50).min(500))?;
    Ok(json!({ "app": p.app, "log": p.log, "lines": lines }))
}

fn list_presets(ctx: &Context, p: AppArg) -> ToolResult {
    let presets = ctx.hedge.list_presets(&p.app)?;
    let selected = ctx.hedge.selected_preset(&p.app).ok().flatten();
    Ok(json!({ "app": p.app, "presets": to_json(&presets)?, "selected": selected }))
}

fn write_preset(ctx: &Context, p: WritePreset) -> ToolResult {
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
    Ok(json!({
        "preset": to_json(&preset)?,
        "actions": to_json(&actions)?,
        "applied": !p.dry_run,
        "next": "Run run_app_command with reloadPresets so the app sees the preset.",
    }))
}

fn select_preset(ctx: &Context, p: SelectPreset) -> ToolResult {
    let actions = ctx.hedge.plan_select_preset(&p.app, &p.name)?;
    if !p.dry_run {
        ctx.hedge.apply(&actions)?;
    }
    Ok(json!({ "app": p.app, "selected": p.name, "actions": to_json(&actions)?, "applied": !p.dry_run }))
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::RegValue;
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::tools::{call, test_ctx};

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
        assert!(d["manifest"]["events"].as_array().unwrap().iter().any(|e| e["id"] == "FileCopyCompleted"));
    }

    #[test]
    fn run_app_command_dry_run_and_confirmation_gate() {
        let appdata = tempfile::tempdir().unwrap();
        let (_d, fake, ctx) = test_ctx(windows(appdata.path()));
        let cmds = json!([
            {"command": "setSource", "params": {"paths": ["/Volumes/A003"], "label": "A003"}},
            {"command": "addTransfers"}
        ]);
        let dry = call(&ctx, "run_app_command", json!({"app": "offshoot", "commands": cmds, "dry_run": true})).unwrap();
        assert_eq!(dry["executed"], false);
        assert_eq!(dry["plan"]["urls"].as_array().unwrap().len(), 2);
        let gated = call(&ctx, "run_app_command", json!({"app": "offshoot", "commands": cmds})).unwrap();
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
        let open = call(&ctx, "run_app_command", json!({"app": "offshoot", "commands": [{"command": "open"}], "wait_seconds": 0})).unwrap();
        assert_eq!(open["executed"], true, "open needs no confirmation");
        assert!(call(&ctx, "run_app_command", json!({"app": "offshoot", "commands": [{"command": "activate"}]})).is_err());
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
        call(&ctx, "select_preset", json!({"app": "offshoot", "name": "A cam"})).unwrap();
        assert_eq!(fake.registry_value(KEY, "SessionVariableSelectedPreset"), Some(RegValue::String("A cam".into())));
        let log = call(&ctx, "read_app_log", json!({"app": "offshoot", "log": "event", "lines": 2})).unwrap();
        assert_eq!(log["lines"], json!(["b", "c"]));
        assert!(call(&ctx, "read_app_log", json!({"app": "offshoot", "log": "other"})).is_err());
    }
}
```

- [ ] **Step 2: Register and run**

`pub(crate) mod apps;` and `tools.extend(apps::tools());` in `tools/mod.rs`.

```bash
cargo test -p hedgebuddy-cli
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 3 new tests pass (record a RED run with the `extend` line commented out).

- [ ] **Step 3: Commit**

```bash
git add crates/cli
git commit -m "feat(cli): Hedge app tools with a confirmation gate on commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Run and system tools

**Files:**
- Create: `crates/cli/src/tools/system.rs`
- Modify: `crates/cli/src/tools/mod.rs`

**Interfaces:**
- Consumes: `Store::{list_recent_runs, get_run, root, active_profile_name}` (core, Task 1), `RunFilter`, `volumes::inspect_volume`, `python_env::find_python`, `Host::{volumes, os}`, `Context::catalog_error`, `Catalog::overridden`.
- Produces: `list_runs`, `get_run`, `list_volumes`, `inspect_volume`, `environment`.
- `inspect_volume` returns `{report, volume}` where `volume` is the `VolumeInfo` whose `mount_point` equals the path (compared after trimming trailing separators), or `null`.
- `environment` returns `{version, os, data_dir, active_profile, catalog: {overridden, error}, python, python_package_matches, apps: [{id, installed, version, warnings}]}` where `python_package_matches` is `python.hedgebuddy == CARGO_PKG_VERSION`.

- [ ] **Step 1: Write the module with tests**

`crates/cli/src/tools/system.rs`:
```rust
//! Run records, volumes, and the environment.

use std::path::{Path, PathBuf};

use hedgebuddy_core::{python_env, volumes, RunFilter};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;

use super::{tool, to_json, Context, NoParams, ToolDef, ToolError, ToolResult, READ};

/// Arguments of `list_runs`.
#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ListRuns {
    /// Only runs of this profile.
    #[serde(default)]
    pub profile: Option<String>,
    /// Only runs of this script file.
    #[serde(default)]
    pub script: Option<String>,
    /// Only runs triggered by this app.
    #[serde(default)]
    pub app: Option<String>,
    /// How many runs, newest first (default 20).
    #[serde(default)]
    pub limit: Option<usize>,
}

/// A run id.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RunId {
    /// Run id from list_runs.
    pub run_id: String,
}

/// A folder or mount point.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PathArg {
    /// Mount point from list_volumes, or any folder.
    pub path: PathBuf,
}

/// The run and system tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_runs",
            "List recent script runs (newest first) with status, exit code, and log lines. Runs older than 30 days are pruned.",
            READ,
            ListRuns,
            list_runs
        ),
        tool!("get_run", "Show one script run with its log lines and traceback, if any.", READ, RunId, get_run),
        tool!(
            "list_volumes",
            "List mounted volumes with name, mount point, file system, size, free space, and whether the OS reports them removable (many card readers report false).",
            READ,
            NoParams,
            list_volumes
        ),
        tool!(
            "inspect_volume",
            "Look inside a volume or folder: camera-card guess (sony, canon, panasonic, red, arri, blackmagic, avchd, dcim, audio) with evidence, clip count, media size, and top-level folders.",
            READ,
            PathArg,
            inspect_volume
        ),
        tool!(
            "environment",
            "HedgeBuddy's environment: version, data directory, active profile, catalog overrides and errors, the Python interpreter Hedge apps use and whether the hedgebuddy package there matches, and Hedge app status.",
            READ,
            NoParams,
            environment
        ),
    ]
}

fn list_runs(ctx: &Context, p: ListRuns) -> ToolResult {
    let filter = RunFilter { profile: p.profile, script: p.script, app: p.app, limit: Some(p.limit.unwrap_or(20)) };
    Ok(json!({ "runs": to_json(&ctx.store.list_recent_runs(&filter)?)? }))
}

fn get_run(ctx: &Context, p: RunId) -> ToolResult {
    let run = ctx
        .store
        .get_run(&p.run_id)?
        .ok_or_else(|| ToolError::new(format!("run '{}' not found", p.run_id)))?;
    to_json(&run)
}

fn list_volumes(ctx: &Context, _: NoParams) -> ToolResult {
    Ok(json!({ "volumes": to_json(&ctx.hedge.host().volumes()?)? }))
}

fn trimmed(p: &Path) -> String {
    p.to_string_lossy().trim_end_matches(['/', '\\']).to_string()
}

fn inspect_volume(ctx: &Context, p: PathArg) -> ToolResult {
    let report = volumes::inspect_volume(&p.path)?;
    let volume = ctx
        .hedge
        .host()
        .volumes()
        .unwrap_or_default()
        .into_iter()
        .find(|v| trimmed(&v.mount_point) == trimmed(&p.path));
    Ok(json!({ "report": to_json(&report)?, "volume": to_json(&volume)? }))
}

fn environment(ctx: &Context, _: NoParams) -> ToolResult {
    let host = ctx.hedge.host();
    let python = python_env::find_python(host)?;
    let matches = python.as_ref().and_then(|p| p.hedgebuddy.as_deref()) == Some(env!("CARGO_PKG_VERSION"));
    let apps: Vec<serde_json::Value> = ctx
        .hedge
        .apps()?
        .into_iter()
        .map(|a| json!({ "id": a.id, "installed": a.installed, "version": a.version, "warnings": a.warnings }))
        .collect();
    Ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "os": host.os().as_str(),
        "data_dir": ctx.store.root(),
        "active_profile": ctx.store.active_profile_name()?,
        "catalog": { "overridden": ctx.hedge.catalog().overridden(), "error": ctx.catalog_error },
        "python": to_json(&python)?,
        "python_package_matches": matches,
        "apps": apps,
    }))
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::host::VolumeInfo;
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use crate::tools::{call, test_ctx};

    #[test]
    fn runs_are_listed_newest_first_and_missing_runs_are_errors() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let today = jiff::Zoned::now().date().to_string();
        std::fs::create_dir_all(ctx.store.runs_dir()).unwrap();
        std::fs::write(
            ctx.store.runs_dir().join(format!("{today}.jsonl")),
            format!(
                "{{\"ts\":\"{today}T10:00:00Z\",\"run_id\":\"a\",\"phase\":\"start\",\"script\":\"x.py\",\"profile\":\"p\"}}\n{{\"ts\":\"{today}T11:00:00Z\",\"run_id\":\"b\",\"phase\":\"start\",\"script\":\"y.py\",\"profile\":\"p\"}}\n"
            ),
        )
        .unwrap();
        let runs = call(&ctx, "list_runs", json!({})).unwrap();
        assert_eq!(runs["runs"][0]["run_id"], "b");
        assert_eq!(call(&ctx, "list_runs", json!({"script": "x.py"})).unwrap()["runs"].as_array().unwrap().len(), 1);
        assert_eq!(call(&ctx, "get_run", json!({"run_id": "a"})).unwrap()["script"], "x.py");
        assert!(call(&ctx, "get_run", json!({"run_id": "zzz"})).unwrap_err().0.contains("not found"));
    }

    #[test]
    fn volumes_are_listed_and_inspected_with_their_info() {
        let card = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(card.path().join("PRIVATE/M4ROOT/CLIP")).unwrap();
        std::fs::write(card.path().join("PRIVATE/M4ROOT/CLIP/C0001.MP4"), [0u8; 4]).unwrap();
        let info = VolumeInfo {
            name: "A003".into(),
            mount_point: card.path().to_path_buf(),
            file_system: "exFAT".into(),
            total_bytes: 1000,
            available_bytes: 10,
            removable: true,
        };
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows).with_volume(info));
        assert_eq!(call(&ctx, "list_volumes", json!({})).unwrap()["volumes"][0]["name"], "A003");
        let out = call(&ctx, "inspect_volume", json!({"path": card.path()})).unwrap();
        assert_eq!(out["report"]["card"]["kind"], "sony");
        assert_eq!(out["report"]["clip_count"], 1);
        assert_eq!(out["volume"]["file_system"], "exFAT");
    }

    #[test]
    fn environment_reports_version_catalog_and_apps() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let env = call(&ctx, "environment", json!({})).unwrap();
        assert_eq!(env["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(env["os"], "windows");
        assert_eq!(env["catalog"]["error"], serde_json::Value::Null);
        assert_eq!(env["python"], serde_json::Value::Null);
        assert_eq!(env["python_package_matches"], false);
        assert_eq!(env["apps"].as_array().unwrap().len(), 4);
    }
}
```

Add `jiff = "0.2"` to `[dev-dependencies]` of `crates/cli/Cargo.toml` (the run test builds today's file name).

- [ ] **Step 2: Register and run**

`pub(crate) mod system;` and `tools.extend(system::tools());` in `tools/mod.rs`.

```bash
cargo test -p hedgebuddy-cli
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: 3 new tests pass (record a RED run with the `extend` line commented out). `tools::all()` now has 31 tools.

- [ ] **Step 3: Commit**

```bash
git add crates/cli Cargo.lock
git commit -m "feat(cli): run, volume, and environment tools

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Resources, the `author_script` prompt, and the MCP server

**Files:**
- Create: `crates/cli/src/resources.rs`, `crates/cli/src/mcp.rs`, `crates/cli/tests/mcp_contract.rs`
- Modify: `crates/cli/Cargo.toml`, `crates/cli/src/lib.rs`, `crates/cli/src/main.rs`

**Interfaces:**
- Consumes: `tools::{all, call, Context, Hints, ToolDef}` (Tasks 2–7).
- Produces:
  - `resources::ResourceInfo { uri, name, description, mime_type }`, `resources::list(&Context) -> Vec<ResourceInfo>`, `resources::read(&Context, &str) -> Option<(&'static str, String)>`, `resources::author_script(&Context, app, event) -> Result<String, ToolError>`.
  - `mcp::serve(Arc<Context>) -> Result<(), Box<dyn std::error::Error + Send + Sync>>` (blocks until the client disconnects).
  - `hedgebuddy mcp` subcommand.
- Behaviour: `tools/list` returns every `ToolDef` with its schema and annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint: false`); `tools/call` runs the tool on a blocking thread and returns its JSON as pretty text content, or `isError: true` with the error text; an unknown tool name is a JSON-RPC `invalid_params` error. Resources: `hedgebuddy://catalog/<id>` (JSON), `hedgebuddy://schema/<name>` (the five JSON Schemas), `hedgebuddy://docs/hedge-llms` (text). Prompt: `author_script` with required arguments `app` and `event`. Server instructions describe masking, dry runs, and the confirmation gate.

- [ ] **Step 1: Write `resources.rs` with tests**

`crates/cli/src/resources.rs`:
```rust
//! MCP resources and the `author_script` prompt, as plain functions so they
//! can be tested without a server.

use crate::tools::{Context, ToolError};

const SCHEMAS: [(&str, &str); 5] = [
    ("hedgebuddy", include_str!("../../../schema/hedgebuddy.schema.json")),
    ("profile", include_str!("../../../schema/profile.schema.json")),
    ("secrets", include_str!("../../../schema/secrets.schema.json")),
    ("run-record", include_str!("../../../schema/run-record.schema.json")),
    ("script-manifest", include_str!("../../../schema/script-manifest.schema.json")),
];

const HEDGE_LLMS: &str = "Hedge's own documentation for AI agents: https://docs.hedge.video/llms.txt\nOffShoot automation: https://docs.hedge.video/offshoot/features/automation\n";

/// One readable resource.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceInfo {
    pub uri: String,
    pub name: String,
    pub description: String,
    pub mime_type: &'static str,
}

/// Every resource: one per catalog app, the five schemas, and the Hedge docs pointer.
pub fn list(ctx: &Context) -> Vec<ResourceInfo> {
    let mut out: Vec<ResourceInfo> = ctx
        .hedge
        .catalog()
        .apps()
        .map(|m| ResourceInfo {
            uri: format!("hedgebuddy://catalog/{}", m.app.id),
            name: format!("{} catalog entry", m.app.name),
            description: format!("Events, payload keys, commands and files HedgeBuddy knows for {}.", m.app.name),
            mime_type: "application/json",
        })
        .collect();
    out.extend(SCHEMAS.iter().map(|(name, _)| ResourceInfo {
        uri: format!("hedgebuddy://schema/{name}"),
        name: format!("{name} schema"),
        description: format!("JSON Schema of HedgeBuddy's {name} format."),
        mime_type: "application/schema+json",
    }));
    out.push(ResourceInfo {
        uri: "hedgebuddy://docs/hedge-llms".into(),
        name: "Hedge documentation".into(),
        description: "Where Hedge publishes documentation for AI agents.".into(),
        mime_type: "text/plain",
    });
    out
}

/// The content of a resource, or `None` for an unknown URI.
pub fn read(ctx: &Context, uri: &str) -> Option<(&'static str, String)> {
    if let Some(id) = uri.strip_prefix("hedgebuddy://catalog/") {
        let m = ctx.hedge.catalog().app(id).ok()?;
        return Some(("application/json", serde_json::to_string_pretty(m).ok()?));
    }
    if let Some(name) = uri.strip_prefix("hedgebuddy://schema/") {
        return SCHEMAS
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, text)| ("application/schema+json", (*text).to_owned()));
    }
    (uri == "hedgebuddy://docs/hedge-llms").then(|| ("text/plain", HEDGE_LLMS.to_owned()))
}

/// A starting point for a script handling `app`'s `event`.
pub fn author_script(ctx: &Context, app: &str, event: &str) -> Result<String, ToolError> {
    let m = ctx.hedge.catalog().app(app)?;
    let e = m.event(event)?;
    let prefix = format!("{}_", e.id);
    let mut fields = String::new();
    for key in &e.payload {
        let attr = key.strip_prefix(&prefix).unwrap_or(key);
        let json = if e.json_fields.contains(key) { "  (JSON, decoded for you)" } else { "" };
        fields.push_str(&format!("#   event.{attr:<28} <- {key}{json}\n"));
    }
    if fields.is_empty() {
        fields.push_str("#   (this event has no payload)\n");
    }
    Ok(format!(
        "Write a HedgeBuddy script for {name} event {event}: {description}\n\n\
Save it with write_script, set any required variables with set_var, check it with check_script, \
then attach it with attach_script (dry_run first). Template:\n\n\
```python\n\"\"\"\n{{\"hedgebuddy\": 1, \"app\": \"{app}\", \"event\": \"{event}\", \"requires\": {{}}}}\n---\n\
Describe what this script does.\n\"\"\"\nimport hedgebuddy as hb\n\n\n@hb.script\ndef main(event, vars):\n\
    # Payload fields for {name} {event}:\n{fields}\
    # Variables declared in \"requires\" are available as vars.NAME, typed.\n\
    hb.log(\"started\")\n    return 0\n```\n\n\
List every variable the script reads in \"requires\" as {{\"NAME\": {{\"type\": \"string\"}}}} \
(types: string, secret, int, float, bool, path, url, string[], path[]; add \"default\" to make one optional).\n",
        name = m.app.name,
        description = e.description,
    ))
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::{FakeHost, Os};

    use super::*;
    use crate::tools::test_ctx;

    #[test]
    fn resources_cover_catalog_schemas_and_docs() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let all = list(&ctx);
        assert_eq!(all.len(), 10);
        let (mime, text) = read(&ctx, "hedgebuddy://catalog/offshoot").unwrap();
        assert_eq!(mime, "application/json");
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["app"]["id"], "offshoot");
        assert!(read(&ctx, "hedgebuddy://schema/profile").unwrap().1.contains("HedgeBuddy profile"));
        assert!(read(&ctx, "hedgebuddy://docs/hedge-llms").unwrap().1.contains("llms.txt"));
        assert!(read(&ctx, "hedgebuddy://schema/nope").is_none());
        assert!(read(&ctx, "https://example.com").is_none());
        for r in &all {
            assert!(read(&ctx, &r.uri).is_some(), "{} does not read", r.uri);
        }
    }

    #[test]
    fn author_script_template_lists_payload_fields() {
        let (_d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        let t = author_script(&ctx, "offshoot", "FileCopyCompleted").unwrap();
        assert!(t.contains("\"app\": \"offshoot\", \"event\": \"FileCopyCompleted\""));
        assert!(t.contains("event.destinationPath"));
        assert!(t.contains("FileCopyCompleted_sourceInfo  (JSON, decoded for you)"));
        assert!(t.contains("@hb.script"));
        assert!(author_script(&ctx, "offshoot", "OffShootStarted").unwrap().contains("no payload"));
        assert!(author_script(&ctx, "offshoot", "Nope").is_err());
    }
}
```

Add `pub mod resources;` to `lib.rs`.

- [ ] **Step 2: Run the resource tests**

Run: `cargo test -p hedgebuddy-cli resources`
Expected: 2 tests pass.

- [ ] **Step 3: Write the MCP contract test (failing)**

`crates/cli/tests/mcp_contract.rs`:
```rust
//! Speaks raw JSON-RPC (newline-delimited, MCP stdio transport) to
//! `hedgebuddy mcp`, so the test depends on the protocol, not on any SDK's
//! client API. Only tools that touch the data directory or the catalog are
//! called, so the test never changes the real machine.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use serde_json::{json, Value};

struct Client {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
    next_id: u64,
}

impl Client {
    fn start(data_dir: &std::path::Path) -> Client {
        let mut child = Command::new(env!("CARGO_BIN_EXE_hedgebuddy"))
            .arg("mcp")
            .env("HEDGEBUDDY_DATA_DIR", data_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("hedgebuddy mcp starts");
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, lines) = channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Client { child, stdin, lines, next_id: 1 }
    }

    fn send(&mut self, msg: Value) {
        writeln!(self.stdin, "{msg}").unwrap();
        self.stdin.flush().unwrap();
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}));
        loop {
            let line = self.lines.recv_timeout(Duration::from_secs(20)).expect("server answered in time");
            let msg: Value = serde_json::from_str(&line).unwrap_or_else(|e| panic!("stdout is not JSON-RPC ({e}): {line}"));
            if msg["id"] == json!(id) {
                return msg;
            }
        }
    }

    fn call_tool(&mut self, name: &str, args: Value) -> Value {
        let msg = self.request("tools/call", json!({"name": name, "arguments": args}));
        msg["result"].clone()
    }
}

fn text_json(result: &Value) -> Value {
    serde_json::from_str(result["content"][0]["text"].as_str().expect("text content")).expect("JSON text")
}

#[test]
fn mcp_server_speaks_the_protocol() {
    let dir = tempfile::tempdir().unwrap();
    let mut c = Client::start(dir.path());

    let init = c.request(
        "initialize",
        json!({"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "contract-test", "version": "0"}}),
    );
    let result = &init["result"];
    assert!(result["serverInfo"]["name"].as_str().unwrap().contains("hedgebuddy"), "{init}");
    for cap in ["tools", "resources", "prompts"] {
        assert!(result["capabilities"].get(cap).is_some(), "missing capability {cap}: {init}");
    }
    assert!(result["instructions"].as_str().unwrap_or_default().contains("dry_run"));
    c.send(json!({"jsonrpc": "2.0", "method": "notifications/initialized"}));

    let listed = c.request("tools/list", json!({}));
    let tools = listed["result"]["tools"].as_array().unwrap();
    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    let expected: Vec<&str> = hedgebuddy_cli::tools::all().iter().map(|t| t.name).collect();
    assert_eq!(names, expected);
    let by_name = |n: &str| tools.iter().find(|t| t["name"] == n).unwrap().clone();
    assert_eq!(by_name("delete_profile")["annotations"]["destructiveHint"], true);
    assert_eq!(by_name("list_profiles")["annotations"]["readOnlyHint"], true);
    assert_eq!(by_name("set_var")["inputSchema"]["type"], "object");

    let created = c.call_tool("create_profile", json!({"name": "p"}));
    assert_ne!(created["isError"], true, "{created}");
    assert_eq!(text_json(&created)["active"], true);
    c.call_tool("set_var", json!({"name": "HOOK", "type": "secret", "value": "https://hook"}));
    let vars = text_json(&c.call_tool("list_vars", json!({})));
    assert_eq!(vars["variables"][0]["value"], "********");

    let missing = c.call_tool("get_var", json!({"name": "NOPE"}));
    assert_eq!(missing["isError"], true, "{missing}");
    let unknown = c.request("tools/call", json!({"name": "nope", "arguments": {}}));
    assert!(unknown.get("error").is_some() || unknown["result"]["isError"] == true, "{unknown}");

    let resources = c.request("resources/list", json!({}));
    let uris: Vec<&str> = resources["result"]["resources"].as_array().unwrap().iter().map(|r| r["uri"].as_str().unwrap()).collect();
    assert!(uris.contains(&"hedgebuddy://catalog/offshoot"), "{uris:?}");
    let schema = c.request("resources/read", json!({"uri": "hedgebuddy://schema/profile"}));
    assert!(schema["result"]["contents"][0]["text"].as_str().unwrap().contains("HedgeBuddy profile"));

    let prompts = c.request("prompts/list", json!({}));
    assert!(prompts["result"]["prompts"].as_array().unwrap().iter().any(|p| p["name"] == "author_script"));
    let prompt = c.request("prompts/get", json!({"name": "author_script", "arguments": {"app": "offshoot", "event": "DiskAdded"}}));
    let text = prompt["result"]["messages"][0]["content"]["text"].as_str().unwrap();
    assert!(text.contains("DiskAdded_rootFilePath"), "{text}");

    drop(c.stdin);
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    loop {
        if c.child.try_wait().unwrap().is_some() {
            break;
        }
        assert!(std::time::Instant::now() < deadline, "server did not exit after stdin closed");
        std::thread::sleep(Duration::from_millis(100));
    }
}
```

Run: `cargo test -p hedgebuddy-cli --test mcp_contract` → FAILS (no `mcp` subcommand yet).

- [ ] **Step 4: Write the MCP adapter**

Add to `crates/cli/Cargo.toml` `[dependencies]`:
```toml
rmcp = { version = "3", features = ["server", "transport-io"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "io-std"] }
```

`crates/cli/src/mcp.rs` — the only file that depends on `rmcp`. Implement `ServerHandler` by hand (not with `#[tool_router]`), because the tools are data in `tools::all()`. The type and method names below follow rmcp's documented `ServerHandler` trait; **verify every name against the installed crate** (`~/.cargo/registry/src/*/rmcp-3.*/src/handler/server.rs` and `src/model/*.rs`, or `cargo doc -p rmcp --open`) and adapt the spelling — for example request-parameter types may be `CallToolRequestParams` or `CallToolRequestParam`, and results may be wrapped in response enums (`CallToolResponse`, `ReadResourceResponse`, `GetPromptResponse`) whose plain-result variant you must construct. The contract test is the source of truth for behaviour; record every adaptation in the report.

```rust
//! The MCP server: an `rmcp` `ServerHandler` over [`crate::tools`] and
//! [`crate::resources`]. Nothing here contains HedgeBuddy logic.

use std::sync::Arc;

use rmcp::model::*; // adapt: import the exact types used below
use rmcp::service::RequestContext;
use rmcp::{ErrorData as McpError, RoleServer, ServerHandler, ServiceExt};

use crate::resources;
use crate::tools::{self, Context};

const INSTRUCTIONS: &str = "HedgeBuddy manages variables, profiles and Python scripts for Hedge apps (OffShoot, FoolCat, EditReady, Canister) and drives those apps through their URL commands. Secret values are masked; pass reveal only when the operator explicitly asks to see one. Every tool that changes the machine accepts dry_run: run it first and show the operator the result before applying. run_app_command refuses commands that need confirmation until it is called with confirmed: true after the operator agrees. Start with environment and list_apps; describe_app lists each app's events, payload keys and commands; the author_script prompt gives a script template.";

/// The HedgeBuddy MCP server.
#[derive(Clone)]
pub struct Server {
    ctx: Arc<Context>,
}

impl Server {
    /// A server over a tool context.
    pub fn new(ctx: Arc<Context>) -> Server {
        Server { ctx }
    }
}

fn tool_list() -> Vec<Tool> {
    tools::all()
        .into_iter()
        .map(|t| {
            let schema = match (t.schema)() {
                serde_json::Value::Object(map) => map,
                _ => serde_json::Map::new(),
            };
            let mut tool = Tool::new(t.name, t.description, Arc::new(schema));
            tool.annotations = Some(
                ToolAnnotations::new()
                    .read_only(t.hints.read_only)
                    .destructive(t.hints.destructive)
                    .idempotent(t.hints.idempotent)
                    .open_world(false),
            );
            tool
        })
        .collect()
}

impl ServerHandler for Server {
    fn get_info(&self) -> ServerInfo {
        // adapt: build ServerInfo with tools, resources and prompts enabled,
        // server_info name "hedgebuddy" and version CARGO_PKG_VERSION, and
        // instructions INSTRUCTIONS.
        ServerInfo {
            capabilities: ServerCapabilities::builder().enable_tools().enable_resources().enable_prompts().build(),
            server_info: Implementation { name: "hedgebuddy".into(), version: env!("CARGO_PKG_VERSION").into(), ..Default::default() },
            instructions: Some(INSTRUCTIONS.into()),
            ..Default::default()
        }
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(tool_list()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        let name = request.name.to_string();
        if !tools::all().iter().any(|t| t.name == name) {
            return Err(McpError::invalid_params(format!("unknown tool '{name}'"), None));
        }
        let args = request.arguments.map(serde_json::Value::Object).unwrap_or(serde_json::Value::Null);
        let ctx = self.ctx.clone();
        let result = tokio::task::spawn_blocking(move || tools::call(&ctx, &name, args))
            .await
            .map_err(|e| McpError::internal_error(format!("tool panicked: {e}"), None))?;
        Ok(match result {
            Ok(value) => CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&value).expect("JSON values serialize"),
            )]),
            Err(e) => CallToolResult::error(vec![Content::text(e.0)]),
        })
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        let items = resources::list(&self.ctx)
            .into_iter()
            .map(|r| {
                let mut raw = RawResource::new(r.uri, r.name);
                raw.description = Some(r.description);
                raw.mime_type = Some(r.mime_type.into());
                raw.no_annotation()
            })
            .collect();
        Ok(ListResourcesResult::with_all_items(items))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, McpError> {
        let (mime, text) = resources::read(&self.ctx, &request.uri)
            .ok_or_else(|| McpError::resource_not_found(format!("unknown resource {}", request.uri), None))?;
        let mut contents = ResourceContents::text(text, request.uri.clone());
        if let ResourceContents::TextResourceContents { mime_type, .. } = &mut contents {
            *mime_type = Some(mime.into());
        }
        Ok(ReadResourceResult { contents: vec![contents] })
    }

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, McpError> {
        let arg = |name: &str, description: &str| PromptArgument {
            name: name.into(),
            description: Some(description.into()),
            required: Some(true),
            ..Default::default()
        };
        Ok(ListPromptsResult::with_all_items(vec![Prompt::new(
            "author_script",
            Some("A template for a HedgeBuddy script handling one Hedge app event, with its payload fields."),
            Some(vec![arg("app", "Catalog app id, e.g. offshoot"), arg("event", "Event id, e.g. FileCopyCompleted")]),
        )]))
    }

    async fn get_prompt(
        &self,
        request: GetPromptRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<GetPromptResult, McpError> {
        if request.name != "author_script" {
            return Err(McpError::invalid_params(format!("unknown prompt '{}'", request.name), None));
        }
        let args = request.arguments.unwrap_or_default();
        let get = |k: &str| args.get(k).and_then(|v| v.as_str()).map(str::to_owned);
        let (Some(app), Some(event)) = (get("app"), get("event")) else {
            return Err(McpError::invalid_params("author_script needs app and event", None));
        };
        let text = resources::author_script(&self.ctx, &app, &event)
            .map_err(|e| McpError::invalid_params(e.0, None))?;
        Ok(GetPromptResult {
            description: Some(format!("Script template for {app} {event}")),
            messages: vec![PromptMessage::new_text(PromptMessageRole::User, text)],
        })
    }
}

/// Serve MCP over stdin/stdout until the client disconnects.
pub async fn serve(ctx: Arc<Context>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let service = Server::new(ctx).serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}
```

Add `pub mod mcp;` to `lib.rs`.

In `main.rs` add the subcommand and its arm:
```rust
    /// Serve MCP over stdio (for Claude Desktop, Claude Code, and other MCP clients)
    Mcp,
```
```rust
        Command::Mcp => {
            let ctx = match Context::real() {
                Ok(c) => std::sync::Arc::new(c),
                Err(e) => {
                    eprintln!("error: {e}");
                    return ExitCode::FAILURE;
                }
            };
            let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("error: cannot start the async runtime: {e}");
                    return ExitCode::FAILURE;
                }
            };
            match runtime.block_on(hedgebuddy_cli::mcp::serve(ctx)) {
                Ok(()) => ExitCode::SUCCESS,
                Err(e) => {
                    eprintln!("error: {e}");
                    ExitCode::FAILURE
                }
            }
        }
```
Nothing in the `mcp` path may print to stdout.

- [ ] **Step 5: Run the contract test and the suite**

```bash
cargo test -p hedgebuddy-cli --test mcp_contract -- --nocapture
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```
Expected: the contract test passes; everything else green. If the server's supported protocol version differs from `2025-06-18`, rmcp negotiates; the test does not assert the version.

- [ ] **Step 6: Commit**

```bash
git add crates/cli Cargo.lock
git commit -m "feat(cli): MCP server over stdio with tools, resources, and the author_script prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Setup documentation, smoke checklist, spec, changelog

**Files:**
- Create: `docs/smoke-checklist.md`
- Modify: `README.md`, `docs/superpowers/specs/2026-09-15-hedgebuddy-v0.11-overhaul-design.md`, `CHANGELOG.md`

**Interfaces:** documentation only.

- [ ] **Step 1: README**

Add a section after "Layout" in `README.md`:
````markdown
## Use it from Claude (MCP)

Build and install the binary (it lands in `~/.cargo/bin`, which rustup puts on PATH):

```bash
cargo install --path crates/cli
hedgebuddy tools
```

**Claude Code:**

```bash
claude mcp add hedgebuddy -- hedgebuddy mcp
```

**Claude Desktop:** add this to `claude_desktop_config.json` (`%APPDATA%\Claude\` on Windows, `~/Library/Application Support/Claude/` on macOS), using the full path to the binary if `hedgebuddy` is not on the PATH Claude Desktop sees, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "hedgebuddy": { "command": "hedgebuddy", "args": ["mcp"] }
  }
}
```

**From a shell:** every MCP tool also runs as `hedgebuddy call <tool> '<json arguments>'` (or `-` to read the arguments from stdin), for example `hedgebuddy call list_apps`.

Tools that change a Hedge app's settings or start transfers take `dry_run`, and commands that start transfers need `confirmed: true`, so the agent shows you the plan first.
````

- [ ] **Step 2: Smoke checklist**

`docs/smoke-checklist.md`:
```markdown
# Manual smoke checklist (phase 3)

These steps change real Hedge app settings and need a machine with OffShoot Pro (and optionally FoolCat Pro). Run them from Claude Desktop or Claude Code with the HedgeBuddy MCP server connected, or with `hedgebuddy call`. Record results in the boxes.

## 1. Environment
- [ ] `environment` shows the version, data directory, and the Python interpreter OffShoot uses. Result:
- [ ] `list_apps` shows OffShoot (and FoolCat) installed with the right versions and scripting enabled. Result:

## 2. Clean up stale attachments
- [ ] `list_attachments` for offshoot shows `stale` entries pointing at deleted files (on the development machine: the old Quills scripts).
- [ ] For each: `clear_stale_attachment` with `dry_run: true`, then without. Afterwards `list_attachments` shows `detached`. Result:

## 3. Attach a real script
- [ ] `create_profile` `smoke`, then `write_script` `log_copy.py` with manifest app offshoot, event FileCopyCompleted, whose body appends `sys.argv[1]` to a text file in your home folder (plain Python; the hedgebuddy package is phase 4).
- [ ] `attach_script` with `dry_run`, then for real. `list_attachments` shows `attached`.
- [ ] Copy a small folder with OffShoot **without restarting it**. Did the script run? (If not, restart OffShoot and repeat.) Result — do attachments apply live or only after a restart?:

## 4. Commands
- [ ] `run_app_command` offshoot `open` with `wait_seconds: 5`: OffShoot comes to the front and `outcome.responses` shows the callback-log lines. Result:
- [ ] Card scenario with a card or any folder: `inspect_volume` → `write_preset` (dry run, then real) → `run_app_command reloadPresets` → `select_preset` → `run_app_command` `[reset {type: destinations}, setSource, setDestination × 2, addTransfers]` dry run, then without `confirmed` (refused), then `confirmed: true`. Did the transfer start with the right label, destinations, and folder pattern? Result:
- [ ] Did OffShoot pick up the selected preset without a restart? Result:
- [ ] Optional: with a catalog override (`<data>/catalog/offshoot.toml`) changing `reset` and `addTransfers` to `form = "action"`, does the whole scenario work as one `actions` URL? Result:

## 5. macOS (when available)
- [ ] `attach_script` writes `~/Library/Preferences/Hedge/Workspaces/HedgeBuddy.json`; applying it from the OffShoot Helper menu attaches the script. Result:
- [ ] `read_app_log` callback shows responses from `~/Library/Logs/Hedge/urlSchemeResponseLog.txt`; note whether that file is appended to or rewritten. Result:
```

- [ ] **Step 3: Spec**

In section 4, replace the **cli** bullet with:
```markdown
- **cli** is a thin layer over core. `hedgebuddy mcp` serves MCP over stdio using the official Rust MCP SDK (`rmcp`). Every MCP tool is defined once in the crate's tool layer and also runs from the shell as `hedgebuddy call <tool> <json>`; `hedgebuddy tools` lists them.
```

In section 8, replace the tools table with the table from this plan's "Tool list" section (tools and hints), and add these rules after the existing ones:
```markdown
- **`detach_script`** only detaches an event currently attached to that very script. **`clear_stale_attachment`** only detaches an event whose file no longer exists. External (operator-owned) attachments are changed only by `attach_script`/`sync_attachments` replacing them, and those report what they replace.
- **`run_app_command`** returns `requires_confirmation` and runs nothing when a command the catalog marks `confirm` is present and `confirmed: true` was not passed.
- **`list_runs`** prunes run files older than 30 days before listing.
```

- [ ] **Step 4: Changelog**

Under `## Unreleased` → `### Added` in `CHANGELOG.md`, append:
```markdown
- `hedgebuddy mcp`: an MCP server over stdio with 31 tools (profiles, variables, scripts, attachments, Hedge app commands and presets, runs, volumes, environment), catalog and schema resources, and an `author_script` prompt.
- `hedgebuddy tools` and `hedgebuddy call <tool> <json>` run the same tools from a shell.
- Manual smoke checklist for real Hedge apps (`docs/smoke-checklist.md`).
```

- [ ] **Step 5: Verification and commit**

```bash
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
(cd python && uv run pytest -q)
python scripts/sync_version.py --check
git add README.md docs CHANGELOG.md
git commit -m "docs: MCP setup, smoke checklist, spec and changelog for the CLI and MCP server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (section 13 item 3: "`hedgebuddy` binary, all subcommands, `mcp` over stdio, dry runs, contract tests"):** tool layer and `call`/`tools` → Task 2; every section 8 tool → Tasks 2–7 (plus `list_attachments`, `clear_stale_attachment`, `select_preset` added from phase 2B findings); masking → Task 3; `write_script`/`check_script` validation and compile check → Task 4; dry runs → every destructive tool; confirm gate → Task 6; `inspect_volume` with label/filesystem/size/removable → Task 7 (joined `VolumeInfo`); `environment` → Task 7; resources and prompt → Task 8; MCP over stdio with annotations → Task 8; contract test → Task 8; "connecting" (GUI part is phase 5) → README in Task 9. The milestone "card scenario from Claude Desktop" is covered by the tools plus the smoke checklist; it is verified manually by the operator.

**Placeholders:** the rmcp adapter (Task 8 Step 4) is complete code that must be checked against the installed crate's type names; the step says exactly where to look and what the contract test asserts. Core names used by the tests (`FakeHost::{with_registry_key, with_registry_value, with_env, with_volume, with_run_response, registry_value, opened_urls}`, `VarType::as_str`/`FromStr`, `RequirementIssue` tagged `kind`, `EventAttachment` flattened `state`, `SyncReport.applied`, `AppDescription.manifest.events`, `CardGuess.kind`) were checked against `main` at `4d42f36`.

**Type consistency:** `Context`, `ToolError`, `ToolResult`, `ToolDef`, `Hints`, `READ`/`WRITE`/`DESTRUCTIVE`, `NoParams`, `to_json`, `parse_args`, `schema_of`, `tool!`, `test_ctx` (Task 2) are used unchanged in Tasks 3–8. Shared parameter types: `ProfileArg` (profiles) used by scripts; `ScriptDry` (scripts) used by attachments; `AppArg` (attachments) used by apps. Core additions (Task 1) `list_recent_runs`, `detach_script`, `clear_stale_attachment`, `PROBE`, `SYNTAX_CHECK` are used in Tasks 4, 5, 7 with the same signatures.
