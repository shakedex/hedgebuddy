//! Hedge app URL-scheme commands (`offshoot://...`).

use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

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

/// How often the callback log is polled while waiting for a response.
const POLL: Duration = Duration::from_millis(100);
/// How long the callback log must stay unchanged before a response counts
/// as complete.
const QUIET: Duration = Duration::from_millis(400);
/// Pause between URLs when there is no response to wait for.
const URL_GAP: Duration = Duration::from_millis(500);
/// The most of a rewritten (or hugely grown) callback log that is read back.
const MAX_RESPONSE_BYTES: u64 = 1_048_576;

/// Length and modification time of a log file; a missing file is `(0, None)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct LogState {
    len: u64,
    modified: Option<SystemTime>,
}

impl LogState {
    fn of(path: &Path) -> LogState {
        match fs::metadata(path) {
            Ok(m) => LogState {
                len: m.len(),
                modified: m.modified().ok(),
            },
            Err(_) => LogState {
                len: 0,
                modified: None,
            },
        }
    }
}

/// The non-empty, trimmed lines of `path` from byte `from` to the end,
/// reading at most the last `max` bytes. When that cap cuts into a line, the
/// partial line is dropped. A `from` past the end (the file shrank) reads
/// from the start. Unreadable files have no lines.
fn read_lines_from(path: &Path, from: u64, max: u64) -> Vec<String> {
    let Ok(mut file) = fs::File::open(path) else {
        return Vec::new();
    };
    let len = file.metadata().map_or(0, |m| m.len());
    let from = if from > len { 0 } else { from };
    let capped = len.saturating_sub(max) > from;
    // When capped, start one byte early: if that byte is the newline ending
    // the previous line, only it is dropped and no line is lost.
    let start = if capped { len - max - 1 } else { from };
    if start > 0 && file.seek(SeekFrom::Start(start)).is_err() {
        return Vec::new();
    }
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }
    if capped {
        match bytes.iter().position(|&b| b == b'\n') {
            Some(nl) => {
                bytes.drain(..=nl);
            }
            None => bytes.clear(),
        }
    }
    String::from_utf8_lossy(&bytes)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Wait for the app's response in its callback log: up to `wait` for the log
/// to differ from `before`, then until it has been unchanged for `QUIET`
/// (still within `wait`). Returns the new lines: what was appended when the
/// log grew, else (it shrank, or was rewritten at the same length) the whole
/// log, capped to its last `MAX_RESPONSE_BYTES`.
fn wait_for_response(path: &Path, before: LogState, wait: Duration) -> Vec<String> {
    let deadline = Instant::now() + wait;
    let mut current = LogState::of(path);
    while current == before {
        if Instant::now() >= deadline {
            return Vec::new();
        }
        thread::sleep(POLL);
        current = LogState::of(path);
    }
    let mut quiet_since = Instant::now();
    while quiet_since.elapsed() < QUIET && Instant::now() < deadline {
        thread::sleep(POLL);
        let next = LogState::of(path);
        if next != current {
            current = next;
            quiet_since = Instant::now();
        }
    }
    let from = if current.len > before.len {
        before.len
    } else {
        0
    };
    read_lines_from(path, from, MAX_RESPONSE_BYTES)
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

    /// Open the URLs of `calls` one at a time, in order.
    ///
    /// When `wait` is non-zero and the app has a callback log on this
    /// platform, each URL's response is awaited before the next URL opens:
    /// up to `wait` (per URL) for the log to change, then until it has been
    /// unchanged for 400 ms. The new log lines of every URL are collected in
    /// `responses`, in order. Without a callback log, or with a zero `wait`,
    /// URLs open 500 ms apart and `responses` is empty.
    ///
    /// If a URL cannot be opened, the error says how many were opened before it.
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
        let mut responses = Vec::new();
        for (i, url) in plan.urls.iter().enumerate() {
            if i > 0 && log.is_none() {
                thread::sleep(URL_GAP);
            }
            let before = log.as_deref().map(LogState::of);
            if let Err(e) = self.host.open_url(url) {
                return Err(CoreError::Host(format!(
                    "opened {i} of {} URLs before failing ({e}); already opened: {}",
                    plan.urls.len(),
                    plan.urls[..i].join(" ")
                )));
            }
            if let (Some(path), Some(before)) = (&log, before) {
                responses.extend(wait_for_response(path, before, wait));
            }
        }
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

    /// A Windows host whose OffShoot callback log exists with `initial`.
    fn with_callback_log(initial: &str) -> (tempfile::TempDir, PathBuf, Arc<FakeHost>, Hedge) {
        let appdata = tempfile::tempdir().unwrap();
        let log = appdata.path().join("Hedge").join("HedgeCallback.log");
        fs::create_dir_all(log.parent().unwrap()).unwrap();
        fs::write(&log, initial).unwrap();
        let (fake, h) = hedge(
            FakeHost::new(Os::Windows).with_env("APPDATA", &appdata.path().display().to_string()),
        );
        (appdata, log, fake, h)
    }

    fn append(path: &Path, line: &str) {
        use std::io::Write;
        let mut f = fs::OpenOptions::new().append(true).open(path).unwrap();
        f.write_all(format!("{line}\n").as_bytes()).unwrap();
    }

    #[test]
    fn run_waits_for_the_callback_log() {
        let (_appdata, log, _fake, h) = with_callback_log("old line\n");
        let writer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            append(&log, "2026-09-23 10:00:00 | 1 | open");
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

    #[test]
    fn run_sequences_urls_and_collects_each_response() {
        let (_appdata, log, fake, h) = with_callback_log("old line\n");
        let writer_fake = fake.clone();
        // Answer each URL ~200 ms after it opens, noting how many URLs were
        // open at the time: the second must not open before the first answer.
        let writer = std::thread::spawn(move || {
            let mut opened_when_answering = Vec::new();
            for (n, line) in ["line one", "line two"].into_iter().enumerate() {
                let deadline = Instant::now() + Duration::from_secs(10);
                while writer_fake.opened_urls().len() <= n {
                    assert!(Instant::now() < deadline, "URL {} never opened", n + 1);
                    thread::sleep(Duration::from_millis(10));
                }
                thread::sleep(Duration::from_millis(200));
                opened_when_answering.push(writer_fake.opened_urls().len());
                append(&log, line);
            }
            opened_when_answering
        });
        let out = h
            .run_commands(
                "offshoot",
                &[call("open", json!({})), call("reloadPresets", json!({}))],
                Duration::from_secs(3),
            )
            .unwrap();
        let opened_when_answering = writer.join().unwrap();
        assert_eq!(out.responses, vec!["line one", "line two"]);
        assert_eq!(
            fake.opened_urls(),
            vec!["offshoot://open", "offshoot://reloadPresets"]
        );
        assert_eq!(opened_when_answering, vec![1, 2]);
    }

    #[test]
    fn run_detects_a_same_length_rewrite() {
        let (_appdata, log, _fake, h) = with_callback_log("aaaa\n");
        let writer = std::thread::spawn(move || {
            thread::sleep(Duration::from_millis(200));
            fs::write(&log, "bbbb\n").unwrap();
        });
        let out = h
            .run_commands(
                "offshoot",
                &[call("open", json!({}))],
                Duration::from_secs(3),
            )
            .unwrap();
        writer.join().unwrap();
        assert_eq!(out.responses, vec!["bbbb"]);
    }

    #[test]
    fn run_reads_a_shrunken_log_from_the_start() {
        let (_appdata, log, _fake, h) = with_callback_log("old one\nold two\n");
        let writer = std::thread::spawn(move || {
            thread::sleep(Duration::from_millis(200));
            fs::write(&log, "new\n").unwrap();
        });
        let out = h
            .run_commands(
                "offshoot",
                &[call("open", json!({}))],
                Duration::from_secs(3),
            )
            .unwrap();
        writer.join().unwrap();
        assert_eq!(out.responses, vec!["new"]);
    }

    #[test]
    fn run_without_a_response_returns_after_the_wait() {
        let (_appdata, _log, _fake, h) = with_callback_log("old line\n");
        let started = Instant::now();
        let out = h
            .run_commands(
                "offshoot",
                &[call("open", json!({}))],
                Duration::from_millis(300),
            )
            .unwrap();
        assert!(out.responses.is_empty());
        assert!(started.elapsed() >= Duration::from_millis(300));
    }

    #[test]
    fn reading_lines_caps_and_drops_the_partial_first_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("log.txt");
        // 24 bytes: "first line\n" (0..11), "second\n" (11..18), "third\n" (18..24).
        fs::write(&path, "first line\nsecond\nthird\n").unwrap();
        assert_eq!(read_lines_from(&path, 11, 100), vec!["second", "third"]);
        assert_eq!(read_lines_from(&path, 0, 10), vec!["third"]);
        assert_eq!(read_lines_from(&path, 0, 13), vec!["second", "third"]);
        assert_eq!(read_lines_from(&path, 0, 100).len(), 3);
        assert_eq!(
            read_lines_from(&path, 99, 100).len(),
            3,
            "shrank: from start"
        );
        assert!(read_lines_from(&dir.path().join("missing"), 0, 100).is_empty());
    }
}
