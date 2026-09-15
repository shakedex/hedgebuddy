//! Variable types, values, and validation rules from spec section 5.

use std::str::FromStr;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, Result};

/// The nine variable types. Serialized names are the schema's exact strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VarType {
    #[serde(rename = "string")]
    String,
    #[serde(rename = "secret")]
    Secret,
    #[serde(rename = "int")]
    Int,
    #[serde(rename = "float")]
    Float,
    #[serde(rename = "bool")]
    Bool,
    #[serde(rename = "path")]
    Path,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "string[]")]
    StringList,
    #[serde(rename = "path[]")]
    PathList,
}

impl VarType {
    /// All nine variable types.
    pub const ALL: [VarType; 9] = [
        VarType::String,
        VarType::Secret,
        VarType::Int,
        VarType::Float,
        VarType::Bool,
        VarType::Path,
        VarType::Url,
        VarType::StringList,
        VarType::PathList,
    ];

    /// Get the serialized string representation of the type.
    pub fn as_str(self) -> &'static str {
        match self {
            VarType::String => "string",
            VarType::Secret => "secret",
            VarType::Int => "int",
            VarType::Float => "float",
            VarType::Bool => "bool",
            VarType::Path => "path",
            VarType::Url => "url",
            VarType::StringList => "string[]",
            VarType::PathList => "path[]",
        }
    }
}

impl FromStr for VarType {
    type Err = CoreError;
    fn from_str(s: &str) -> Result<Self> {
        VarType::ALL
            .into_iter()
            .find(|t| t.as_str() == s)
            .ok_or_else(|| CoreError::Validation(format!("unknown variable type '{s}'")))
    }
}

/// One entry in `profile.json`'s `variables` map.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Variable {
    #[serde(rename = "type")]
    pub ty: VarType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
    #[serde(default)]
    pub description: String,
}

/// A variable's value with its declared type applied.
#[derive(Debug, Clone, PartialEq)]
pub enum VarValue {
    Str(String),
    Int(i64),
    Float(f64),
    Bool(bool),
    Path(String),
    Url(String),
    StrList(Vec<String>),
    PathList(Vec<String>),
}

/// `^[A-Z][A-Z0-9_]*$`
pub fn validate_var_name(name: &str) -> Result<()> {
    let mut chars = name.chars();
    let ok = matches!(chars.next(), Some(c) if c.is_ascii_uppercase())
        && chars.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
    if ok {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "variable name '{name}' must match ^[A-Z][A-Z0-9_]*$"
        )))
    }
}

/// `^[a-z0-9][a-z0-9-]{0,63}$`
pub fn validate_slug(name: &str) -> Result<()> {
    let mut chars = name.chars();
    let ok = name.len() <= 64
        && matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "profile name '{name}' must match ^[a-z0-9][a-z0-9-]{{0,63}}$"
        )))
    }
}

fn err(name: &str, msg: impl AsRef<str>) -> CoreError {
    CoreError::Validation(format!("variable '{name}': {}", msg.as_ref()))
}

fn string_list(name: &str, v: &Value, non_empty: bool) -> Result<Vec<String>> {
    let arr = v
        .as_array()
        .ok_or_else(|| err(name, "value must be an array of strings"))?;
    arr.iter()
        .map(|item| {
            let s = item
                .as_str()
                .ok_or_else(|| err(name, "every list item must be a string"))?;
            if non_empty && s.is_empty() {
                return Err(err(name, "list items must be non-empty"));
            }
            Ok(s.to_owned())
        })
        .collect()
}

impl Variable {
    /// Check the value against the declared type (spec section 5 rules).
    pub fn validate(&self, name: &str) -> Result<()> {
        self.typed_inner(name).map(|_| ())
    }

    /// The typed value, or `None` for a secret (whose value lives elsewhere)
    /// or a variable with no value. Validates first.
    pub fn typed(&self) -> Result<Option<VarValue>> {
        self.typed_inner("<value>")
    }

    fn typed_inner(&self, name: &str) -> Result<Option<VarValue>> {
        if self.ty == VarType::Secret {
            return if self.value.is_some() {
                Err(err(
                    name,
                    "secret variables must not carry a value in profile.json",
                ))
            } else {
                Ok(None)
            };
        }
        let v = self.value.as_ref().ok_or_else(|| {
            err(
                name,
                format!("{} variables require a value", self.ty.as_str()),
            )
        })?;
        let typed = match self.ty {
            VarType::Secret => unreachable!(),
            VarType::String => VarValue::Str(
                v.as_str()
                    .ok_or_else(|| err(name, "value must be a string"))?
                    .to_owned(),
            ),
            VarType::Int => VarValue::Int(
                v.as_i64()
                    .ok_or_else(|| err(name, "value must be an integer"))?,
            ),
            VarType::Float => VarValue::Float(
                v.as_f64()
                    .ok_or_else(|| err(name, "value must be a number"))?,
            ),
            VarType::Bool => VarValue::Bool(
                v.as_bool()
                    .ok_or_else(|| err(name, "value must be true or false"))?,
            ),
            VarType::Path => {
                let s = v
                    .as_str()
                    .ok_or_else(|| err(name, "value must be a string path"))?;
                if s.is_empty() {
                    return Err(err(name, "path must be non-empty"));
                }
                VarValue::Path(s.to_owned())
            }
            VarType::Url => {
                let s = v
                    .as_str()
                    .ok_or_else(|| err(name, "value must be a string URL"))?;
                if !(s.starts_with("http://") || s.starts_with("https://")) {
                    return Err(err(name, "url must start with http:// or https://"));
                }
                VarValue::Url(s.to_owned())
            }
            VarType::StringList => VarValue::StrList(string_list(name, v, false)?),
            VarType::PathList => VarValue::PathList(string_list(name, v, true)?),
        };
        Ok(Some(typed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn var(ty: VarType, value: Value) -> Variable {
        Variable {
            ty,
            value: Some(value),
            description: String::new(),
        }
    }

    #[test]
    fn type_names_round_trip_through_serde() {
        for t in VarType::ALL {
            let s = serde_json::to_string(&t).unwrap();
            assert_eq!(s, format!("\"{}\"", t.as_str()));
            assert_eq!(serde_json::from_str::<VarType>(&s).unwrap(), t);
            assert_eq!(t.as_str().parse::<VarType>().unwrap(), t);
        }
        assert!("date".parse::<VarType>().is_err());
    }

    #[test]
    fn variable_names_follow_the_pattern() {
        for ok in ["A", "PROJECT_NAME", "DEST_ROOTS2", "X_"] {
            validate_var_name(ok).unwrap();
        }
        for bad in ["", "project", "1ABC", "A-B", "A B", "_A", "É"] {
            assert!(
                validate_var_name(bad).is_err(),
                "{bad:?} should be rejected"
            );
        }
    }

    #[test]
    fn slugs_follow_the_pattern() {
        for ok in ["a", "commercial-one-day", "x1-2", &"a".repeat(64)] {
            validate_slug(ok).unwrap();
        }
        for bad in ["", "-a", "A", "a_b", "a b", &"a".repeat(65)] {
            assert!(validate_slug(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn values_are_checked_against_their_type() {
        var(VarType::String, json!("x")).validate("S").unwrap();
        var(VarType::Int, json!(3)).validate("I").unwrap();
        var(VarType::Float, json!(0.5)).validate("F").unwrap();
        var(VarType::Float, json!(2)).validate("F").unwrap(); // integers are numbers
        var(VarType::Bool, json!(true)).validate("B").unwrap();
        var(VarType::Path, json!("D:/x")).validate("P").unwrap();
        var(VarType::Url, json!("https://e.com"))
            .validate("U")
            .unwrap();
        var(VarType::StringList, json!(["a", "b"]))
            .validate("L")
            .unwrap();
        var(VarType::PathList, json!(["D:/a"]))
            .validate("PL")
            .unwrap();

        assert!(var(VarType::String, json!(1)).validate("S").is_err());
        assert!(var(VarType::Int, json!(1.5)).validate("I").is_err());
        assert!(var(VarType::Int, json!("1")).validate("I").is_err());
        assert!(var(VarType::Bool, json!("true")).validate("B").is_err());
        assert!(var(VarType::Path, json!("")).validate("P").is_err());
        assert!(var(VarType::Url, json!("ftp://e.com"))
            .validate("U")
            .is_err());
        assert!(var(VarType::StringList, json!("a")).validate("L").is_err());
        assert!(var(VarType::StringList, json!([1])).validate("L").is_err());
        assert!(var(VarType::PathList, json!([""])).validate("PL").is_err());
    }

    #[test]
    fn value_presence_rules() {
        // Non-secret without a value is invalid.
        let missing = Variable {
            ty: VarType::String,
            value: None,
            description: String::new(),
        };
        assert!(missing.validate("S").is_err());
        // Secret must not carry a value.
        assert!(var(VarType::Secret, json!("leak")).validate("S").is_err());
        let secret = Variable {
            ty: VarType::Secret,
            value: None,
            description: "hook".into(),
        };
        secret.validate("S").unwrap();
        assert_eq!(secret.typed().unwrap(), None);
    }

    #[test]
    fn typed_values() {
        assert_eq!(
            var(VarType::Int, json!(3)).typed().unwrap(),
            Some(VarValue::Int(3))
        );
        assert_eq!(
            var(VarType::PathList, json!(["D:/a", "F:/b"]))
                .typed()
                .unwrap(),
            Some(VarValue::PathList(vec!["D:/a".into(), "F:/b".into()]))
        );
        assert_eq!(
            var(VarType::Float, json!(2)).typed().unwrap(),
            Some(VarValue::Float(2.0))
        );
        assert!(var(VarType::Int, json!("3")).typed().is_err());
    }

    #[test]
    fn serde_shape_matches_the_schema() {
        let v: Variable = serde_json::from_value(json!({
            "type": "path[]", "value": ["D:/Offload"], "description": "roots"
        }))
        .unwrap();
        assert_eq!(v.ty, VarType::PathList);
        let back = serde_json::to_value(&v).unwrap();
        assert_eq!(
            back,
            json!({"type": "path[]", "value": ["D:/Offload"], "description": "roots"})
        );
        let s: Variable =
            serde_json::from_value(json!({"type": "secret", "description": "d"})).unwrap();
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            json!({"type": "secret", "description": "d"})
        );
    }
}
