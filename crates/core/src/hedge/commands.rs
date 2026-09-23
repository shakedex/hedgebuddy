//! Hedge app URL-scheme commands (`offshoot://...`).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::Hedge;
use crate::catalog::{CommandForm, ParamSpec, ParamType};
use crate::error::{CoreError, Result};

/// One command to run, with its parameters as JSON values.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandCall {
    pub command: String,
    #[serde(default)]
    pub params: Map<String, Value>,
}

/// The URLs a list of commands turns into, and which commands the operator
/// should confirm first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandPlan {
    pub app: String,
    pub urls: Vec<String>,
    pub confirm: Vec<String>,
}

/// What happened when the URLs were opened.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandOutcome {
    pub plan: CommandPlan,
    pub responses: Vec<String>,
}

/// Percent-encode everything except RFC 3986 unreserved characters.
pub fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn type_name(ty: ParamType) -> &'static str {
    match ty {
        ParamType::String => "a string",
        ParamType::Path => "a non-empty path string",
        ParamType::PathList => "a non-empty array of non-empty path strings",
        ParamType::Int => "an integer",
        ParamType::Bool => "true or false",
        ParamType::Json => "any JSON value",
    }
}

fn check_value(command: &str, name: &str, spec: &ParamSpec, v: &Value) -> Result<()> {
    let ok = match spec.ty {
        ParamType::String => v.is_string(),
        ParamType::Path => v.as_str().is_some_and(|s| !s.is_empty()),
        ParamType::PathList => v.as_array().is_some_and(|a| {
            !a.is_empty() && a.iter().all(|i| i.as_str().is_some_and(|s| !s.is_empty()))
        }),
        ParamType::Int => v.is_i64() || v.is_u64(),
        ParamType::Bool => v.is_boolean(),
        ParamType::Json => true,
    };
    if ok {
        Ok(())
    } else {
        Err(CoreError::Validation(format!(
            "{command}: parameter '{name}' must be {}",
            type_name(spec.ty)
        )))
    }
}

fn query_value(spec: &ParamSpec, v: &Value, separator: Option<&str>) -> String {
    match (spec.ty, v, separator) {
        (ParamType::Json, other, _) => other.to_string(),
        (ParamType::PathList, Value::Array(items), Some(sep)) => items
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(sep),
        (_, Value::String(s), _) => s.clone(),
        (_, other, _) => other.to_string(),
    }
}

fn flush(pending: &mut Vec<Value>, urls: &mut Vec<String>, scheme: &str) {
    if pending.is_empty() {
        return;
    }
    let json = Value::Array(std::mem::take(pending)).to_string();
    urls.push(format!("{scheme}://actions?json={}", percent_encode(&json)));
}

fn read_new_lines(path: &Path, from: u64) -> Vec<String> {
    let bytes = fs::read(path).unwrap_or_default();
    let start = usize::try_from(from).unwrap_or(usize::MAX);
    let slice = bytes.get(start..).unwrap_or(&[]);
    String::from_utf8_lossy(slice)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect()
}

fn wait_for_growth(path: &Path, before: u64, wait: Duration) -> Vec<String> {
    let deadline = Instant::now() + wait;
    loop {
        let len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if len != before {
            // Give the writer a moment to finish its line.
            std::thread::sleep(Duration::from_millis(100));
            return read_new_lines(path, if len < before { 0 } else { before });
        }
        if Instant::now() >= deadline {
            return Vec::new();
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

impl Hedge {
    /// Validate `calls` against the catalog and build their URLs. Reads only.
    pub fn plan_commands(&self, app: &str, calls: &[CommandCall]) -> Result<CommandPlan> {
        let m = self.catalog.app(app)?;
        let scheme =
            m.app.scheme.as_deref().ok_or_else(|| {
                CoreError::Unsupported(format!("{} has no URL scheme", m.app.name))
            })?;
        if calls.is_empty() {
            return Err(CoreError::Validation("no commands given".into()));
        }
        let os = self.host.os();
        let (mut urls, mut pending, mut confirm) = (Vec::new(), Vec::new(), Vec::new());
        for call in calls {
            let spec = m.command(&call.command)?;
            if !spec.available_on(os) {
                return Err(CoreError::Unsupported(format!(
                    "{} command {} is not available on {}",
                    m.app.name,
                    spec.id,
                    os.as_str()
                )));
            }
            let specs = spec.param_specs()?;
            // A JSON `null` counts as an absent parameter (an MCP caller may
            // send explicit nulls for omitted optional fields).
            let params: Map<String, Value> = call
                .params
                .iter()
                .filter(|(_, v)| !v.is_null())
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            if let Some(unknown) = params.keys().find(|k| !specs.contains_key(*k)) {
                return Err(CoreError::Validation(format!(
                    "{}: unknown parameter '{unknown}'",
                    spec.id
                )));
            }
            for (name, ps) in &specs {
                match params.get(name) {
                    Some(v) => check_value(&spec.id, name, ps, v)?,
                    None if !ps.optional => {
                        return Err(CoreError::Validation(format!(
                            "{}: missing parameter '{name}'",
                            spec.id
                        )));
                    }
                    None => {}
                }
            }
            if spec.confirm {
                confirm.push(spec.id.clone());
            }
            match spec.form {
                CommandForm::Action => {
                    let mut obj = Map::new();
                    obj.insert(spec.id.clone(), Value::Object(params.clone()));
                    pending.push(Value::Object(obj));
                }
                CommandForm::Url => {
                    flush(&mut pending, &mut urls, scheme);
                    let query: Vec<String> = specs
                        .iter()
                        .filter_map(|(name, ps)| {
                            params.get(name).map(|v| {
                                format!(
                                    "{name}={}",
                                    percent_encode(&query_value(
                                        ps,
                                        v,
                                        spec.list_separator.as_deref()
                                    ))
                                )
                            })
                        })
                        .collect();
                    let mut url = format!("{scheme}://{}", spec.id);
                    if !query.is_empty() {
                        url.push('?');
                        url.push_str(&query.join("&"));
                    }
                    urls.push(url);
                }
            }
        }
        flush(&mut pending, &mut urls, scheme);
        Ok(CommandPlan {
            app: m.app.id.clone(),
            urls,
            confirm,
        })
    }

    /// Open the URLs of `calls` in order, then wait up to `wait` for the
    /// app's callback log to record a response.
    pub fn run_commands(
        &self,
        app: &str,
        calls: &[CommandCall],
        wait: Duration,
    ) -> Result<CommandOutcome> {
        let plan = self.plan_commands(app, calls)?;
        // Only resolve the callback log (which can fail if a path template's
        // environment variable is unset) when we will actually use it: a
        // zero wait never polls, so it should never need the log's path.
        let log = if wait.is_zero() {
            None
        } else {
            self.callback_log(app)?
        };
        let before = log
            .as_ref()
            .and_then(|p| fs::metadata(p).ok())
            .map_or(0, |m| m.len());
        for (i, url) in plan.urls.iter().enumerate() {
            if let Err(e) = self.host.open_url(url) {
                return Err(CoreError::Host(format!(
                    "opened {i} of {} URLs before failing ({e}); already opened: {}",
                    plan.urls.len(),
                    plan.urls[..i].join(" ")
                )));
            }
        }
        let responses = match &log {
            Some(path) => wait_for_growth(path, before, wait),
            None => Vec::new(),
        };
        Ok(CommandOutcome { plan, responses })
    }

    fn callback_log(&self, app: &str) -> Result<Option<PathBuf>> {
        let m = self.catalog.app(app)?;
        match m
            .files
            .get(self.host.os())
            .and_then(|f| f.callback_log.as_ref())
        {
            Some(template) => Ok(Some(self.expand(template)?)),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;

    use super::*;
    use crate::catalog::Catalog;
    use crate::host::{FakeHost, Os};

    fn call(command: &str, params: Value) -> CommandCall {
        CommandCall {
            command: command.into(),
            params: params.as_object().cloned().unwrap_or_default(),
        }
    }

    fn decode(s: &str) -> String {
        let bytes = s.as_bytes();
        let mut out = Vec::new();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'%' {
                out.push(u8::from_str_radix(&s[i + 1..i + 3], 16).unwrap());
                i += 3;
            } else {
                out.push(bytes[i]);
                i += 1;
            }
        }
        String::from_utf8(out).unwrap()
    }

    fn hedge(host: FakeHost) -> (Arc<FakeHost>, Hedge) {
        let fake = Arc::new(host);
        (fake.clone(), Hedge::new(fake, Catalog::embedded().unwrap()))
    }

    #[test]
    fn percent_encoding() {
        assert_eq!(percent_encode("aZ09-_.~"), "aZ09-_.~");
        assert_eq!(percent_encode("a b/ü|"), "a%20b%2F%C3%BC%7C");
    }

    #[test]
    fn json_params_always_encode_as_json() {
        let spec = ParamSpec {
            ty: ParamType::Json,
            optional: false,
        };
        assert_eq!(query_value(&spec, &json!("active"), None), "\"active\"");
        assert_eq!(query_value(&spec, &json!({"a": 1}), None), "{\"a\":1}");
    }

    #[test]
    fn null_params_count_as_absent() {
        let (_f, h) = hedge(FakeHost::new(Os::Windows));
        let plan = h
            .plan_commands(
                "offshoot",
                &[call("setSource", json!({"paths": ["/A"], "label": null}))],
            )
            .unwrap();
        let prefix = "offshoot://actions?json=";
        let decoded: Value = serde_json::from_str(&decode(&plan.urls[0][prefix.len()..])).unwrap();
        let obj = decoded[0]["setSource"].as_object().unwrap();
        assert!(!obj.contains_key("label"), "{decoded:?}");
        assert!(matches!(
            h.plan_commands("offshoot", &[call("setDestination", json!({"path": null}))])
                .unwrap_err(),
            CoreError::Validation(_)
        ));
    }

    #[test]
    fn action_commands_are_batched() {
        let (_f, h) = hedge(FakeHost::new(Os::Windows));
        let plan = h
            .plan_commands(
                "offshoot",
                &[
                    call(
                        "setSource",
                        json!({"paths": ["/Volumes/A003"], "label": "A003"}),
                    ),
                    call("setDestination", json!({"path": "/Volumes/RAID1"})),
                    call("setDestination", json!({"path": "/Volumes/RAID2"})),
                ],
            )
            .unwrap();
        assert_eq!(plan.urls.len(), 1);
        let prefix = "offshoot://actions?json=";
        assert!(plan.urls[0].starts_with(prefix), "{}", plan.urls[0]);
        let decoded: Value = serde_json::from_str(&decode(&plan.urls[0][prefix.len()..])).unwrap();
        assert_eq!(
            decoded,
            json!([
                {"setSource": {"label": "A003", "paths": ["/Volumes/A003"]}},
                {"setDestination": {"path": "/Volumes/RAID1"}},
                {"setDestination": {"path": "/Volumes/RAID2"}}
            ])
        );
        assert!(plan.confirm.is_empty());
    }

    #[test]
    fn url_commands_flush_batches_and_keep_order() {
        let (_f, h) = hedge(FakeHost::new(Os::Windows));
        let plan = h
            .plan_commands(
                "offshoot",
                &[
                    call("reset", json!({"type": "destinations"})),
                    call("setSource", json!({"paths": ["/Volumes/A003"]})),
                    call("addTransfers", json!({})),
                ],
            )
            .unwrap();
        assert_eq!(plan.urls.len(), 3);
        assert_eq!(plan.urls[0], "offshoot://reset?type=destinations");
        assert!(plan.urls[1].starts_with("offshoot://actions?json="));
        assert_eq!(plan.urls[2], "offshoot://addTransfers");
        assert_eq!(plan.confirm, vec!["reset", "addTransfers"]);
    }

    #[test]
    fn list_separator_and_query_encoding() {
        let (_f, h) = hedge(FakeHost::new(Os::Macos));
        let plan = h
            .plan_commands(
                "canister",
                &[call(
                    "addarchive",
                    json!({"sources": ["/A", "/B"], "destinationtape": "T 1"}),
                )],
            )
            .unwrap();
        assert_eq!(
            plan.urls,
            vec!["canister://addarchive?destinationtape=T%201&sources=%2FA%7C%2FB"]
        );
        let plan = h
            .plan_commands(
                "foolcat",
                &[call("create", json!({"source": "/S", "destination": "/D"}))],
            )
            .unwrap();
        assert_eq!(
            plan.urls,
            vec!["foolcat://create?destination=%2FD&source=%2FS"]
        );
    }

    #[test]
    fn validation_errors() {
        let (_f, h) = hedge(FakeHost::new(Os::Windows));
        assert!(matches!(
            h.plan_commands("offshoot", &[]).unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("activate", json!({"key": "x"}))])
                .unwrap_err(),
            CoreError::CommandNotFound { .. }
        ));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("setDestination", json!({}))])
                .unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            h.plan_commands(
                "offshoot",
                &[call("setSource", json!({"paths": "/Volumes/A"}))]
            )
            .unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("setSource", json!({"paths": []}))])
                .unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            h.plan_commands("offshoot", &[call("open", json!({"extra": 1}))])
                .unwrap_err(),
            CoreError::Validation(_)
        ));
        assert!(matches!(
            h.plan_commands("postlab", &[call("open", json!({}))])
                .unwrap_err(),
            CoreError::AppNotFound(_)
        ));
    }

    #[test]
    fn run_opens_urls_in_order_without_waiting() {
        let (fake, h) = hedge(FakeHost::new(Os::Windows));
        let out = h
            .run_commands(
                "offshoot",
                &[call("open", json!({})), call("reloadPresets", json!({}))],
                Duration::ZERO,
            )
            .unwrap();
        assert_eq!(
            fake.opened_urls(),
            vec!["offshoot://open", "offshoot://reloadPresets"]
        );
        assert_eq!(out.plan.urls, fake.opened_urls());
        assert!(out.responses.is_empty());
    }

    #[test]
    fn run_waits_for_the_callback_log() {
        let appdata = tempfile::tempdir().unwrap();
        let log = appdata.path().join("Hedge").join("HedgeCallback.log");
        fs::create_dir_all(log.parent().unwrap()).unwrap();
        fs::write(&log, "old line\n").unwrap();
        let (_fake, h) = hedge(
            FakeHost::new(Os::Windows).with_env("APPDATA", &appdata.path().display().to_string()),
        );
        let writer_log = log.clone();
        let writer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            use std::io::Write;
            let mut f = fs::OpenOptions::new()
                .append(true)
                .open(writer_log)
                .unwrap();
            f.write_all(b"2026-09-23 10:00:00 | 1 | open\n").unwrap();
        });
        let out = h
            .run_commands(
                "offshoot",
                &[call("open", json!({}))],
                Duration::from_secs(5),
            )
            .unwrap();
        writer.join().unwrap();
        assert_eq!(out.responses, vec!["2026-09-23 10:00:00 | 1 | open"]);
    }
}
