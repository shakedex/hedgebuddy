//! The Claude activity log, `<data>/activity.jsonl`: one line per MCP tool
//! call, keeping only which tool ran, on what, and how it ended. Argument
//! values, script source and error text are never written.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, Result};
use crate::fs_util;
use crate::store::Store;

/// How many records the log keeps after a trim.
pub const ACTIVITY_KEEP: usize = 200;
/// The log is trimmed once it holds more lines than this.
pub const ACTIVITY_TRIM_AT: usize = 250;
/// How long a trim waits for the data folder's lock before giving up for now.
const TRIM_WAIT: Duration = Duration::from_secs(1);
/// The arguments that name what a call acts on, in order of preference.
const TARGET_KEYS: [&str; 6] = ["name", "script", "run_id", "event", "app", "profile"];

/// How a tool call ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActivityOutcome {
    /// The tool succeeded.
    Ok,
    /// The tool returned an error.
    Error,
    /// `run_app_command` stopped to ask the operator first.
    NeedsConfirmation,
}

/// One line of `activity.jsonl`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ActivityRecord {
    /// When the call finished (UTC, RFC 3339).
    pub ts: String,
    /// The tool's name.
    pub tool: String,
    /// What it acted on: the first of `name`, `script`, `run_id`, `event`,
    /// `app`, `profile` that the call passed, or null.
    pub target: Option<String>,
    /// How it ended.
    pub outcome: ActivityOutcome,
}

impl ActivityRecord {
    /// A record stamped now.
    pub fn now(tool: &str, target: Option<String>, outcome: ActivityOutcome) -> ActivityRecord {
        ActivityRecord {
            ts: crate::clock::now_rfc3339(),
            tool: tool.to_owned(),
            target,
            outcome,
        }
    }
}

/// What a call with `args` acts on: the first of [`TARGET_KEYS`] whose value
/// is a non-empty string. Nothing else from `args` is ever kept.
pub fn activity_target(args: &Value) -> Option<String> {
    TARGET_KEYS.iter().find_map(|key| {
        args.get(key)
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    })
}

impl Store {
    /// `<root>/activity.jsonl`.
    pub fn activity_path(&self) -> PathBuf {
        self.root().join("activity.jsonl")
    }

    /// Append one record. The append is one `write_all` of one line on a
    /// file opened for appending, so it needs no lock. Past
    /// [`ACTIVITY_TRIM_AT`] lines the file is rewritten to the last
    /// [`ACTIVITY_KEEP`] under the data folder's lock; when another
    /// HedgeBuddy holds the lock for a second, the trim waits for a later
    /// append.
    pub fn append_activity(&self, record: &ActivityRecord) -> Result<()> {
        let path = self.activity_path();
        fs::create_dir_all(self.root()).map_err(|e| CoreError::io(self.root(), e))?;
        let mut line = serde_json::to_string(record).map_err(|e| CoreError::Json {
            path: path.clone(),
            source: e,
        })?;
        line.push('\n');
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| CoreError::io(&path, e))?;
        file.write_all(line.as_bytes())
            .map_err(|e| CoreError::io(&path, e))?;
        drop(file);
        if read_lines(&path)?.len() > ACTIVITY_TRIM_AT {
            match self.lock_within(TRIM_WAIT) {
                Ok(_lock) => {
                    let lines = read_lines(&path)?;
                    if lines.len() > ACTIVITY_TRIM_AT {
                        let mut kept = lines[lines.len() - ACTIVITY_KEEP..].join("\n");
                        kept.push('\n');
                        fs_util::write_atomic(&path, kept.as_bytes(), false)?;
                    }
                }
                Err(CoreError::Busy) => {}
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }

    /// Up to `limit` records, newest first. Lines that do not parse are
    /// skipped; a missing file is an empty log.
    pub fn read_activity(&self, limit: usize) -> Result<Vec<ActivityRecord>> {
        let path = self.activity_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        Ok(read_lines(&path)?
            .iter()
            .rev()
            .filter_map(|l| serde_json::from_str(l).ok())
            .take(limit)
            .collect())
    }
}

/// The file's non-empty lines, decoded lossily.
fn read_lines(path: &std::path::Path) -> Result<Vec<String>> {
    let bytes = fs::read(path).map_err(|e| CoreError::io(path, e))?;
    Ok(String::from_utf8_lossy(&bytes)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(str::to_owned)
        .collect())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::store::Store;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        (dir, store)
    }

    fn record(tool: &str, target: Option<&str>) -> ActivityRecord {
        ActivityRecord::now(tool, target.map(str::to_owned), ActivityOutcome::Ok)
    }

    #[test]
    fn the_target_is_the_first_named_argument_present() {
        assert_eq!(
            activity_target(&json!({"profile": "p", "name": "A"})).as_deref(),
            Some("A")
        );
        assert_eq!(
            activity_target(&json!({"app": "offshoot", "event": "DiskAdded"})).as_deref(),
            Some("DiskAdded")
        );
        assert_eq!(
            activity_target(&json!({"run_id": "01J", "profile": "p"})).as_deref(),
            Some("01J")
        );
        assert_eq!(
            activity_target(&json!({"name": 3, "script": "x.py"})).as_deref(),
            Some("x.py")
        );
        assert_eq!(
            activity_target(&json!({"name": "", "profile": "p"})).as_deref(),
            Some("p")
        );
        assert_eq!(activity_target(&json!({"value": "https://secret"})), None);
        assert_eq!(activity_target(&serde_json::Value::Null), None);
    }

    #[test]
    fn records_read_back_newest_first() {
        let (_d, store) = temp_store();
        assert!(store.read_activity(10).unwrap().is_empty());
        for tool in ["a", "b", "c"] {
            store.append_activity(&record(tool, None)).unwrap();
        }
        let tools: Vec<String> = store
            .read_activity(2)
            .unwrap()
            .into_iter()
            .map(|r| r.tool)
            .collect();
        assert_eq!(tools, ["c", "b"]);
    }

    #[test]
    fn the_log_is_trimmed_to_the_last_200_after_250() {
        let (_d, store) = temp_store();
        for i in 0..ACTIVITY_TRIM_AT {
            store
                .append_activity(&record(&format!("t{i}"), None))
                .unwrap();
        }
        assert_eq!(line_count(&store), ACTIVITY_TRIM_AT);
        store.append_activity(&record("last", None)).unwrap();
        assert_eq!(line_count(&store), ACTIVITY_KEEP);
        let all = store.read_activity(usize::MAX).unwrap();
        assert_eq!(all[0].tool, "last");
        assert_eq!(
            all[ACTIVITY_KEEP - 1].tool,
            format!("t{}", ACTIVITY_TRIM_AT + 1 - ACTIVITY_KEEP)
        );
    }

    #[test]
    fn trimming_waits_its_turn_and_is_skipped_while_busy() {
        let (_d, store) = temp_store();
        for i in 0..=ACTIVITY_TRIM_AT {
            if i == ACTIVITY_TRIM_AT {
                let _held = Store::open(store.root()).lock().unwrap();
                store.append_activity(&record("while-busy", None)).unwrap();
                assert_eq!(
                    line_count(&store),
                    ACTIVITY_TRIM_AT + 1,
                    "no trim while locked"
                );
            } else {
                store.append_activity(&record("t", None)).unwrap();
            }
        }
        store.append_activity(&record("after", None)).unwrap();
        assert_eq!(line_count(&store), ACTIVITY_KEEP);
    }

    #[test]
    fn a_bad_line_is_skipped() {
        let (_d, store) = temp_store();
        store.append_activity(&record("a", Some("x"))).unwrap();
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(store.activity_path())
            .unwrap();
        std::io::Write::write_all(&mut f, b"not json\n\xff\xfe\n").unwrap();
        drop(f);
        store.append_activity(&record("b", None)).unwrap();
        let tools: Vec<String> = store
            .read_activity(10)
            .unwrap()
            .into_iter()
            .map(|r| r.tool)
            .collect();
        assert_eq!(tools, ["b", "a"]);
    }

    #[test]
    fn records_hold_no_argument_values() {
        let (_d, store) = temp_store();
        let args = json!({"name": "HOOK", "type": "secret", "value": "https://secret"});
        let r = ActivityRecord::now("set_var", activity_target(&args), ActivityOutcome::Ok);
        store.append_activity(&r).unwrap();
        let text = std::fs::read_to_string(store.activity_path()).unwrap();
        assert!(!text.contains("https://secret"), "{text}");
        let line: serde_json::Value = serde_json::from_str(text.trim()).unwrap();
        assert_eq!(line["target"], "HOOK");
        assert_eq!(line["outcome"], "ok");
        assert_eq!(line.as_object().unwrap().len(), 4);
    }

    fn line_count(store: &Store) -> usize {
        std::fs::read_to_string(store.activity_path())
            .unwrap()
            .lines()
            .count()
    }
}
