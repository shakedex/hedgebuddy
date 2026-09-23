//! The JSON manifest at the top of a script's module docstring (spec section 6).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, Result};
use crate::profile::Profile;
use crate::variable::{validate_var_name, VarType, Variable};

/// One entry of a manifest's `requires` map.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Requirement {
    #[serde(rename = "type")]
    pub ty: VarType,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
}

/// The parsed manifest block from a script's module docstring (spec section 6).
///
/// `app` and `event` are free-form strings here; the schema's stricter
/// patterns for known apps and events (`^[a-z][a-z0-9-]*$` and
/// `^[A-Za-z][A-Za-z0-9]*$`) are enforced against the phase 2B catalog, not
/// by this type.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub hedgebuddy: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    #[serde(default)]
    pub requires: BTreeMap<String, Requirement>,
}

/// Why a profile does not satisfy a manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RequirementIssue {
    /// The profile has no variable with this name.
    Missing {
        /// The missing variable's name.
        name: String,
        /// The type the manifest requires.
        ty: VarType,
    },
    /// The profile has this variable, but with the wrong type.
    TypeMismatch {
        /// The variable's name.
        name: String,
        /// The type the manifest requires.
        expected: VarType,
        /// The type the profile actually declares.
        actual: VarType,
    },
}

/// The text before the `---` line of the first `"""` or `'''` docstring, when that
/// text begins with `{`. Leading blank lines and comment lines (`#`) are skipped.
/// Trailing whitespace on the `---` line is ignored. A leading UTF-8 BOM is skipped.
pub fn extract_manifest_text(source: &str) -> Option<String> {
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);
    // The module docstring is the first statement: skip blank lines and
    // comments, then require the file to open with a triple quote.
    let body = source
        .lines()
        .skip_while(|l| l.trim().is_empty() || l.trim_start().starts_with('#'))
        .collect::<Vec<_>>()
        .join("\n");
    let quote = if body.trim_start().starts_with("\"\"\"") {
        "\"\"\""
    } else if body.trim_start().starts_with("'''") {
        "'''"
    } else {
        return None;
    };
    let start = body.find(quote)? + quote.len();
    let end = body[start..].find(quote)? + start;
    let doc = &body[start..end];
    if !doc.trim_start().starts_with('{') {
        return None;
    }
    let json_part = doc
        .lines()
        .take_while(|line| line.trim_end() != "---")
        .collect::<Vec<_>>()
        .join("\n");
    Some(json_part)
}

/// `Ok(None)` when the script has no manifest block.
pub fn parse_manifest(source: &str) -> Result<Option<Manifest>> {
    let Some(text) = extract_manifest_text(source) else {
        return Ok(None);
    };
    let manifest: Manifest =
        serde_json::from_str(text.trim()).map_err(|e| CoreError::Manifest(e.to_string()))?;
    if manifest.hedgebuddy != 1 {
        return Err(CoreError::Manifest(format!(
            "unsupported manifest version {} (expected 1)",
            manifest.hedgebuddy
        )));
    }
    if manifest.event.is_some() && manifest.app.is_none() {
        return Err(CoreError::Manifest("'event' requires 'app'".into()));
    }
    for (name, req) in &manifest.requires {
        validate_var_name(name).map_err(|e| CoreError::Manifest(e.to_string()))?;
        if let Some(default) = &req.default {
            check_default(req.ty, default)
                .map_err(|e| CoreError::Manifest(format!("default for {name}: {e}")))?;
        }
    }
    Ok(Some(manifest))
}

/// A default must be a valid value of its requirement's type, by the same
/// rules as a stored variable. A secret's default must be a string (a stored
/// secret carries no value in `profile.json`, so it is checked as a string).
/// `"default": null` deserializes to `None` and never reaches this check.
fn check_default(ty: VarType, default: &Value) -> Result<()> {
    let ty = if ty == VarType::Secret {
        VarType::String
    } else {
        ty
    };
    Variable {
        ty,
        value: Some(default.clone()),
        description: String::new(),
    }
    .typed()
    .map(|_| ())
}

/// Every requirement the profile fails, sorted by variable name.
pub fn check_requirements(manifest: &Manifest, profile: &Profile) -> Vec<RequirementIssue> {
    manifest
        .requires
        .iter()
        .filter_map(|(name, req)| match profile.variables.get(name) {
            Some(var) if var.ty == req.ty => None,
            Some(var) => Some(RequirementIssue::TypeMismatch {
                name: name.clone(),
                expected: req.ty,
                actual: var.ty,
            }),
            None if req.default.is_some() => None,
            None => Some(RequirementIssue::Missing {
                name: name.clone(),
                ty: req.ty,
            }),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variable::Variable;
    use serde_json::json;

    const FIXTURE: &str = include_str!(
        "../../../schema/fixtures/valid/basic/profiles/commercial-one-day/scripts/on_copy_complete.py"
    );

    #[test]
    fn fixture_manifest_parses() {
        let m = parse_manifest(FIXTURE).unwrap().unwrap();
        assert_eq!(m.hedgebuddy, 1);
        assert_eq!(m.app.as_deref(), Some("offshoot"));
        assert_eq!(m.event.as_deref(), Some("FileCopyCompleted"));
        assert_eq!(m.requires["SLACK_WEBHOOK"].ty, VarType::Secret);
        assert_eq!(m.requires["PROJECT_NAME"].default, Some(json!("Untitled")));
    }

    #[test]
    fn a_leading_bom_is_skipped() {
        let src = "\u{feff}\"\"\"\n{\"hedgebuddy\": 1}\n---\n\"\"\"\n";
        // The docstring text starts with the newline after the quotes, as in Python.
        assert_eq!(
            extract_manifest_text(src).as_deref(),
            Some("\n{\"hedgebuddy\": 1}")
        );
    }

    #[test]
    fn no_docstring_or_prose_docstring_means_no_manifest() {
        assert_eq!(parse_manifest("import os\n").unwrap(), None);
        assert_eq!(
            parse_manifest("\"\"\"Just prose.\"\"\"\nimport os\n").unwrap(),
            None
        );
        assert_eq!(extract_manifest_text("x = '\"\"\"'"), None);
    }

    #[test]
    fn terminator_tolerates_trailing_whitespace_and_is_optional() {
        let src = "\"\"\"\n{\"hedgebuddy\": 1}\n---   \nprose\n\"\"\"\n";
        assert_eq!(
            extract_manifest_text(src).unwrap().trim(),
            "{\"hedgebuddy\": 1}"
        );
        let no_term = "\"\"\"\n{\"hedgebuddy\": 1}\n\"\"\"\n";
        assert_eq!(parse_manifest(no_term).unwrap().unwrap().hedgebuddy, 1);
    }

    #[test]
    fn invalid_manifests_are_errors_not_none() {
        let bad_json = "\"\"\"\n{\"hedgebuddy\": 1,\n---\n\"\"\"\n";
        assert!(matches!(
            parse_manifest(bad_json).unwrap_err(),
            CoreError::Manifest(_)
        ));
        let wrong_version = "\"\"\"\n{\"hedgebuddy\": 2}\n---\n\"\"\"\n";
        assert!(matches!(
            parse_manifest(wrong_version).unwrap_err(),
            CoreError::Manifest(_)
        ));
        let event_without_app = "\"\"\"\n{\"hedgebuddy\": 1, \"event\": \"X\"}\n---\n\"\"\"\n";
        assert!(matches!(
            parse_manifest(event_without_app).unwrap_err(),
            CoreError::Manifest(_)
        ));
        let bad_name = "\"\"\"\n{\"hedgebuddy\": 1, \"requires\": {\"lower\": {\"type\": \"string\"}}}\n---\n\"\"\"\n";
        assert!(matches!(
            parse_manifest(bad_name).unwrap_err(),
            CoreError::Manifest(_)
        ));
        let bad_type = "\"\"\"\n{\"hedgebuddy\": 1, \"requires\": {\"A\": {\"type\": \"date\"}}}\n---\n\"\"\"\n";
        assert!(matches!(
            parse_manifest(bad_type).unwrap_err(),
            CoreError::Manifest(_)
        ));
    }

    fn with_requirement(requirement: &str) -> String {
        format!("\"\"\"\n{{\"hedgebuddy\": 1, \"requires\": {{\"PORT\": {requirement}}}}}\n---\n\"\"\"\n")
    }

    #[test]
    fn defaults_must_match_their_type() {
        let err =
            parse_manifest(&with_requirement(r#"{"type": "int", "default": "8080"}"#)).unwrap_err();
        assert!(
            matches!(&err, CoreError::Manifest(m) if m.starts_with("default for PORT: ")),
            "{err}"
        );
        for bad in [
            r#"{"type": "secret", "default": 5}"#,
            r#"{"type": "path", "default": ""}"#,
            r#"{"type": "url", "default": "ftp://e.com"}"#,
            r#"{"type": "string[]", "default": "a"}"#,
        ] {
            assert!(
                matches!(
                    parse_manifest(&with_requirement(bad)).unwrap_err(),
                    CoreError::Manifest(_)
                ),
                "{bad}"
            );
        }
        for good in [
            r#"{"type": "int", "default": 8080}"#,
            r#"{"type": "secret", "default": "x"}"#,
            r#"{"type": "float", "default": 2}"#,
            r#"{"type": "path[]", "default": ["D:/a"]}"#,
        ] {
            parse_manifest(&with_requirement(good)).unwrap();
        }
    }

    #[test]
    fn a_null_default_means_no_default() {
        let m = parse_manifest(&with_requirement(r#"{"type": "int", "default": null}"#))
            .unwrap()
            .unwrap();
        assert_eq!(m.requires["PORT"].default, None);
        assert_eq!(
            check_requirements(&m, &Profile::new("p", "")),
            vec![RequirementIssue::Missing {
                name: "PORT".into(),
                ty: VarType::Int
            }]
        );
    }

    #[test]
    fn manifest_rejects_unknown_keys() {
        let src = "\"\"\"\n{\"hedgebuddy\": 1, \"extra\": 1}\n---\n\"\"\"\n";
        assert!(matches!(
            parse_manifest(src).unwrap_err(),
            CoreError::Manifest(_)
        ));
    }

    #[test]
    fn requirement_check_reports_missing_and_mismatched_only() {
        let m = parse_manifest(FIXTURE).unwrap().unwrap();
        let mut p = Profile::new("p", "");
        // Nothing set: SLACK_WEBHOOK missing; PROJECT_NAME has a default so it is fine.
        assert_eq!(
            check_requirements(&m, &p),
            vec![RequirementIssue::Missing {
                name: "SLACK_WEBHOOK".into(),
                ty: VarType::Secret
            }]
        );
        p.variables.insert(
            "SLACK_WEBHOOK".into(),
            Variable {
                ty: VarType::String,
                value: Some(json!("x")),
                description: String::new(),
            },
        );
        assert_eq!(
            check_requirements(&m, &p),
            vec![RequirementIssue::TypeMismatch {
                name: "SLACK_WEBHOOK".into(),
                expected: VarType::Secret,
                actual: VarType::String
            }]
        );
        p.variables.insert(
            "SLACK_WEBHOOK".into(),
            Variable {
                ty: VarType::Secret,
                value: None,
                description: String::new(),
            },
        );
        p.variables.insert(
            "PROJECT_NAME".into(),
            Variable {
                ty: VarType::Int,
                value: Some(json!(1)),
                description: String::new(),
            },
        );
        assert_eq!(
            check_requirements(&m, &p),
            vec![RequirementIssue::TypeMismatch {
                name: "PROJECT_NAME".into(),
                expected: VarType::String,
                actual: VarType::Int
            }]
        );
    }

    #[test]
    fn requirement_issues_are_sorted_by_name() {
        let src = "\"\"\"\n{\"hedgebuddy\": 1, \"requires\": {\"ZED\": {\"type\": \"int\"}, \"ALPHA\": {\"type\": \"string\"}}}\n---\n\"\"\"\n";
        let m = parse_manifest(src).unwrap().unwrap();
        let p = Profile::new("p", "");
        assert_eq!(
            check_requirements(&m, &p),
            vec![
                RequirementIssue::Missing {
                    name: "ALPHA".into(),
                    ty: VarType::String
                },
                RequirementIssue::Missing {
                    name: "ZED".into(),
                    ty: VarType::Int
                }
            ]
        );
    }
}
