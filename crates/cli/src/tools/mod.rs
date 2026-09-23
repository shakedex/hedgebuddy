//! Every HedgeBuddy tool, defined once. A tool is a plain function from JSON
//! arguments to a JSON result over a [`Context`]; the MCP server and
//! `hedgebuddy call` both dispatch through [`call`].

use std::sync::{Arc, Mutex};

use hedgebuddy_core::{Catalog, CoreError, Hedge, Host, RealHost, Store};
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

// `mod profiles` (and each later task's `mod <group>`) is declared here,
// above `tool!`'s definition, so it must reach the macro through the
// `pub(crate) use tool;` re-export below rather than through `macro_rules!`
// legacy textual scoping (which would otherwise make that re-export, or the
// group modules' own `use super::tool;`, look unused to `unused_imports`).
pub(crate) mod apps;
pub(crate) mod attachments;
pub(crate) mod profiles;
pub(crate) mod scripts;
pub(crate) mod system;
pub(crate) mod variables;

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

/// Everything a tool call needs.
pub struct Context {
    pub store: Store,
    pub hedge: Hedge,
    /// Set when `<data>/catalog/` has an invalid override; the embedded
    /// catalog is used instead and `environment` reports this text.
    pub catalog_error: Option<String>,
    /// Held while `run_app_command` executes, so two concurrent calls don't
    /// run Hedge app commands at the same time.
    pub(crate) command_lock: Mutex<()>,
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
                ToolError::new(
                    "no active profile; create one with create_profile or pass `profile`",
                )
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
    tools.extend(apps::tools());
    tools.extend(attachments::tools());
    tools.extend(profiles::tools());
    tools.extend(scripts::tools());
    tools.extend(system::tools());
    tools.extend(variables::tools());
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
}
