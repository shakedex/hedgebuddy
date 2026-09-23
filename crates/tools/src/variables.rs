//! Variable tools. Secret values are masked unless the caller passes
//! `reveal: true`, and `set_var` never echoes a value.

use std::str::FromStr;

use hedgebuddy_core::{ResolvedVariable, VarType, VariableInput};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{tool, Context, ToolDef, ToolError, DESTRUCTIVE, READ, WRITE};

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
    /// What the variable is for. Omit it to keep the existing variable's description.
    #[serde(default)]
    pub description: Option<String>,
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

/// A variable's JSON value, for the schema only: text (string, secret,
/// path, url), a number (int, float), a flag (bool) or a list of strings
/// (string[], path[]).
#[derive(JsonSchema)]
#[serde(untagged)]
#[allow(dead_code)]
enum VarValueShape {
    Text(String),
    Number(f64),
    Flag(bool),
    List(Vec<String>),
}

/// A variable as the tools return it.
#[derive(Debug, Serialize, JsonSchema)]
pub struct VarView {
    /// Variable name.
    pub name: String,
    /// Variable type.
    #[serde(rename = "type")]
    pub ty: VarType,
    /// What the variable is for.
    pub description: String,
    /// The value; `********` for a secret unless revealed; null when not set.
    #[schemars(with = "Option<VarValueShape>")]
    pub value: Option<Value>,
    /// True when the variable has no value (a secret with nothing stored).
    pub missing: bool,
}

/// Result of `list_vars`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct ListVarsResult {
    /// Profile name.
    pub profile: String,
    /// Its variables, sorted by name.
    pub variables: Vec<VarView>,
}

/// Result of `get_var`.
#[derive(Debug, Serialize, JsonSchema)]
pub struct GetVarResult {
    /// The variable.
    #[serde(flatten)]
    pub var: VarView,
    /// Profile name.
    pub profile: String,
}

/// Result of `set_var`. Never includes the value.
#[derive(Debug, Serialize, JsonSchema)]
pub struct SetVarResult {
    /// Profile name.
    pub profile: String,
    /// Variable name.
    pub name: String,
    /// Variable type.
    #[serde(rename = "type")]
    pub ty: VarType,
    /// The description now stored.
    pub description: String,
}

/// What `delete_var` would delete.
#[derive(Debug, Serialize, JsonSchema)]
pub struct VarDeletion {
    /// Profile name.
    pub profile: String,
    /// Variable name.
    pub name: String,
    /// Variable type.
    #[serde(rename = "type")]
    pub ty: VarType,
}

/// Result of `delete_var`.
#[derive(Debug, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DeleteVarResult {
    /// With `dry_run`: what would be deleted.
    DryRun {
        /// Always true.
        dry_run: bool,
        /// The variable that would be deleted.
        would_delete: VarDeletion,
    },
    /// The variable was deleted.
    Deleted {
        /// Variable name.
        deleted: String,
        /// Profile name.
        profile: String,
    },
}

/// The variable tools.
pub fn tools() -> Vec<ToolDef> {
    vec![
        tool!(
            "list_vars",
            "List a profile's variables. Secret values are shown as ******** unless reveal is true; set reveal only when the operator explicitly asks to see a secret.",
            READ,
            ListVars,
            ListVarsResult,
            list_vars
        ),
        tool!(
            "get_var",
            "Show one variable. Secret values are masked unless reveal is true (only on the operator's explicit request).",
            READ,
            GetVar,
            GetVarResult,
            get_var
        ),
        tool!(
            "set_var",
            "Create or replace a variable. type is string, secret, int, float, bool, path, url, string[] or path[]; value must match it. Secret values are stored separately and never returned by this tool.",
            WRITE,
            SetVar,
            SetVarResult,
            set_var
        ),
        tool!(
            "delete_var",
            "Delete a variable and its secret value. Run with dry_run first.",
            DESTRUCTIVE,
            DeleteVar,
            DeleteVarResult,
            delete_var
        ),
    ]
}

/// A variable as tools return it, with secrets masked unless `reveal`.
pub(crate) fn var_view(v: &ResolvedVariable, reveal: bool) -> VarView {
    let masked = v.ty == VarType::Secret && !reveal;
    let value = match &v.value {
        Some(_) if masked => Some(json!(MASK)),
        Some(value) => Some(value.clone()),
        None => None,
    };
    VarView {
        name: v.name.clone(),
        ty: v.ty,
        description: v.description.clone(),
        value,
        missing: v.value.is_none(),
    }
}

fn list_vars(ctx: &Context, p: ListVars) -> Result<ListVarsResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let variables: Vec<VarView> = ctx
        .store
        .list_variables(&profile)?
        .iter()
        .map(|v| var_view(v, p.reveal))
        .collect();
    Ok(ListVarsResult { profile, variables })
}

fn get_var(ctx: &Context, p: GetVar) -> Result<GetVarResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let v = ctx.store.get_variable(&profile, &p.name)?;
    Ok(GetVarResult {
        var: var_view(&v, p.reveal),
        profile,
    })
}

fn set_var(ctx: &Context, p: SetVar) -> Result<SetVarResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let ty = VarType::from_str(&p.ty).map_err(ToolError::from)?;
    let description = match p.description {
        Some(d) => d,
        None => ctx
            .store
            .load_profile(&profile)?
            .variables
            .get(&p.name)
            .map(|v| v.description.clone())
            .unwrap_or_default(),
    };
    ctx.store.set_variable(
        &profile,
        &p.name,
        VariableInput {
            ty,
            value: Some(p.value),
            description: description.clone(),
        },
    )?;
    Ok(SetVarResult {
        profile,
        name: p.name,
        ty,
        description,
    })
}

fn delete_var(ctx: &Context, p: DeleteVar) -> Result<DeleteVarResult, ToolError> {
    let profile = ctx.profile(p.profile.as_deref())?;
    let v = ctx.store.get_variable(&profile, &p.name)?;
    if p.dry_run {
        return Ok(DeleteVarResult::DryRun {
            dry_run: true,
            would_delete: VarDeletion {
                profile,
                name: v.name,
                ty: v.ty,
            },
        });
    }
    ctx.store.delete_variable(&profile, &p.name)?;
    Ok(DeleteVarResult::Deleted {
        deleted: p.name,
        profile,
    })
}

#[cfg(test)]
mod tests {
    use hedgebuddy_core::{FakeHost, Os};
    use serde_json::json;

    use super::MASK;
    use crate::{call, test_ctx};

    fn ctx_with_profile() -> (tempfile::TempDir, crate::Context) {
        let (d, _f, ctx) = test_ctx(FakeHost::new(Os::Windows));
        ctx.store.create_profile("p", "").unwrap();
        (d, ctx)
    }

    #[test]
    fn secrets_are_masked_unless_revealed_and_never_echoed() {
        let (_d, ctx) = ctx_with_profile();
        let set = call(
            &ctx,
            "set_var",
            json!({"name": "HOOK", "type": "secret", "value": "https://hook"}),
        )
        .unwrap();
        assert!(
            !set.to_string().contains("https://hook"),
            "set_var echoed the secret: {set}"
        );
        call(
            &ctx,
            "set_var",
            json!({"name": "PROJECT_NAME", "type": "string", "value": "Spot"}),
        )
        .unwrap();
        let listed = call(&ctx, "list_vars", json!({})).unwrap();
        let vars = listed["variables"].as_array().unwrap();
        assert_eq!(vars[0]["name"], "HOOK");
        assert_eq!(vars[0]["value"], MASK);
        assert_eq!(vars[0]["missing"], false);
        assert_eq!(vars[1]["value"], "Spot");
        assert!(!listed.to_string().contains("https://hook"));
        let revealed = call(&ctx, "get_var", json!({"name": "HOOK", "reveal": true})).unwrap();
        assert_eq!(revealed["value"], "https://hook");
        assert_eq!(
            call(&ctx, "get_var", json!({"name": "HOOK"})).unwrap()["value"],
            MASK
        );
    }

    #[test]
    fn values_are_validated_against_types() {
        let (_d, ctx) = ctx_with_profile();
        assert!(call(
            &ctx,
            "set_var",
            json!({"name": "N", "type": "date", "value": "x"})
        )
        .unwrap_err()
        .0
        .contains("unknown variable type"));
        assert!(call(
            &ctx,
            "set_var",
            json!({"name": "N", "type": "int", "value": "3"})
        )
        .is_err());
        assert!(call(
            &ctx,
            "set_var",
            json!({"name": "lower", "type": "string", "value": "x"})
        )
        .is_err());
        call(
            &ctx,
            "set_var",
            json!({"name": "ROOTS", "type": "path[]", "value": ["D:/A", "F:/B"]}),
        )
        .unwrap();
        assert_eq!(
            call(&ctx, "get_var", json!({"name": "ROOTS"})).unwrap()["value"],
            json!(["D:/A", "F:/B"])
        );
        assert!(call(&ctx, "get_var", json!({"name": "MISSING"}))
            .unwrap_err()
            .0
            .contains("not found"));
    }

    #[test]
    fn set_var_keeps_the_description_unless_one_is_given() {
        let (_d, ctx) = ctx_with_profile();
        let desc = |ctx: &crate::Context, name: &str| {
            call(ctx, "get_var", json!({"name": name})).unwrap()["description"].clone()
        };
        call(
            &ctx,
            "set_var",
            json!({"name": "A", "type": "string", "value": "x", "description": "What A is"}),
        )
        .unwrap();
        let out = call(
            &ctx,
            "set_var",
            json!({"name": "A", "type": "string", "value": "y"}),
        )
        .unwrap();
        assert_eq!(out["description"], "What A is");
        assert_eq!(desc(&ctx, "A"), "What A is");
        assert_eq!(
            call(&ctx, "get_var", json!({"name": "A"})).unwrap()["value"],
            "y"
        );
        call(
            &ctx,
            "set_var",
            json!({"name": "A", "type": "string", "value": "z", "description": ""}),
        )
        .unwrap();
        assert_eq!(desc(&ctx, "A"), "");
        let new = call(
            &ctx,
            "set_var",
            json!({"name": "B", "type": "int", "value": 3}),
        )
        .unwrap();
        assert_eq!(new["description"], "");
        assert_eq!(desc(&ctx, "B"), "");
    }

    #[test]
    fn delete_has_a_dry_run() {
        let (_d, ctx) = ctx_with_profile();
        call(
            &ctx,
            "set_var",
            json!({"name": "A", "type": "bool", "value": true}),
        )
        .unwrap();
        let dry = call(&ctx, "delete_var", json!({"name": "A", "dry_run": true})).unwrap();
        assert_eq!(dry["would_delete"]["name"], "A");
        call(&ctx, "get_var", json!({"name": "A"})).unwrap();
        call(&ctx, "delete_var", json!({"name": "A"})).unwrap();
        assert!(call(&ctx, "get_var", json!({"name": "A"})).is_err());
    }
}
