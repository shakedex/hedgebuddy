//! Run records written by the Python library (`runs/YYYY-MM-DD.jsonl`).

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use jiff::civil::Date;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::store::Store;

/// Files older than this many days are pruned.
pub const RUN_RETENTION_DAYS: i32 = 30;

/// Status of a completed run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    /// Run succeeded.
    Ok,
    /// Run failed with a non-zero exit code.
    Failed,
    /// Run encountered an error.
    Error,
}

/// One JSONL line.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "lowercase")]
pub enum RunRecord {
    /// Start of a run.
    Start {
        ts: String,
        run_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        app: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        event: Option<String>,
        script: String,
        profile: String,
    },
    /// Log message during a run.
    Log {
        ts: String,
        run_id: String,
        message: String,
    },
    /// End of a run.
    End {
        ts: String,
        run_id: String,
        status: RunStatus,
        exit_code: i32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        traceback: Option<String>,
    },
}

/// One `log` record, reassociated with its run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogLine {
    /// When the log line was written.
    pub ts: String,
    /// The log message.
    pub message: String,
}

/// A start record with its logs and (if any) its end record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Run {
    /// The run's unique ID, from the `start` record.
    pub run_id: String,
    /// Timestamp of the `start` record.
    pub started_at: String,
    /// The app that triggered the run, if any.
    pub app: Option<String>,
    /// The event that triggered the run, if any.
    pub event: Option<String>,
    /// Name of the script that ran.
    pub script: String,
    /// Name of the profile the run used.
    pub profile: String,
    /// Every `log` record for this run, in file order.
    pub logs: Vec<LogLine>,
    /// Timestamp of the `end` record, if the run has ended.
    pub ended_at: Option<String>,
    /// The run's outcome, if it has ended.
    pub status: Option<RunStatus>,
    /// The script's exit code, if the run has ended.
    pub exit_code: Option<i32>,
    /// A traceback, if the run ended with one.
    pub traceback: Option<String>,
}

/// Filter for listing runs.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunFilter {
    /// Only runs against this profile.
    pub profile: Option<String>,
    /// Only runs of this script.
    pub script: Option<String>,
    /// Only runs triggered by this app.
    pub app: Option<String>,
    /// At most this many runs (after sorting and filtering).
    pub limit: Option<usize>,
}

impl Store {
    /// All runs, newest first. Lines that do not parse are skipped; a
    /// `log`/`end` without a matching `start` is skipped.
    pub fn list_runs(&self, filter: &RunFilter) -> Result<Vec<Run>> {
        let dir = self.runs_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut files: Vec<PathBuf> = fs::read_dir(&dir)
            .map_err(|e| CoreError::io(&dir, e))?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "jsonl").unwrap_or(false))
            .collect();
        files.sort();

        // Group by run_id. Ties on started_at are broken by run_id order (BTreeMap) so the result is deterministic.
        let mut runs: BTreeMap<String, Run> = BTreeMap::new();
        for file in files {
            let text = fs::read_to_string(&file).map_err(|e| CoreError::io(&file, e))?;
            for line in text.lines().filter(|l| !l.trim().is_empty()) {
                let Ok(record) = serde_json::from_str::<RunRecord>(line) else {
                    continue;
                };
                match record {
                    RunRecord::Start {
                        ts,
                        run_id,
                        app,
                        event,
                        script,
                        profile,
                    } => {
                        runs.entry(run_id.clone()).or_insert_with(|| Run {
                            run_id,
                            started_at: ts,
                            app,
                            event,
                            script,
                            profile,
                            logs: Vec::new(),
                            ended_at: None,
                            status: None,
                            exit_code: None,
                            traceback: None,
                        });
                    }
                    RunRecord::Log {
                        ts,
                        run_id,
                        message,
                    } => {
                        if let Some(run) = runs.get_mut(&run_id) {
                            run.logs.push(LogLine { ts, message });
                        }
                    }
                    RunRecord::End {
                        ts,
                        run_id,
                        status,
                        exit_code,
                        traceback,
                    } => {
                        if let Some(run) = runs.get_mut(&run_id) {
                            run.ended_at = Some(ts);
                            run.status = Some(status);
                            run.exit_code = Some(exit_code);
                            run.traceback = traceback;
                        }
                    }
                }
            }
        }

        let mut out: Vec<Run> = runs
            .into_values()
            .filter(|r| filter.profile.as_deref().is_none_or(|p| r.profile == p))
            .filter(|r| filter.script.as_deref().is_none_or(|s| r.script == s))
            .filter(|r| {
                filter
                    .app
                    .as_deref()
                    .is_none_or(|a| r.app.as_deref() == Some(a))
            })
            .collect();
        out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        if let Some(limit) = filter.limit {
            out.truncate(limit);
        }
        Ok(out)
    }

    /// Get a single run by ID, if it exists.
    pub fn get_run(&self, run_id: &str) -> Result<Option<Run>> {
        Ok(self
            .list_runs(&RunFilter::default())?
            .into_iter()
            .find(|r| r.run_id == run_id))
    }

    /// Delete `runs/*.jsonl` whose date stem is before `today - keep_days`.
    pub fn prune_runs(&self, today: Date, keep_days: i32) -> Result<Vec<PathBuf>> {
        let dir = self.runs_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let cutoff = today
            .checked_sub(jiff::Span::new().days(keep_days))
            .map_err(|e| CoreError::Validation(format!("invalid retention window: {e}")))?;
        let mut deleted = Vec::new();
        for entry in fs::read_dir(&dir).map_err(|e| CoreError::io(&dir, e))? {
            let path = entry.map_err(|e| CoreError::io(&dir, e))?.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if path.extension().map(|x| x != "jsonl").unwrap_or(true) {
                continue;
            }
            let Ok(date) = stem.parse::<Date>() else {
                continue;
            };
            if date < cutoff {
                fs::remove_file(&path).map_err(|e| CoreError::io(&path, e))?;
                deleted.push(path);
            }
        }
        deleted.sort();
        Ok(deleted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_store() -> Store {
        Store::open(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../schema/fixtures/valid/basic"),
        )
    }

    #[test]
    fn records_round_trip_through_serde() {
        let line = r#"{"ts": "2026-09-15T18:23:48Z", "run_id": "01J", "phase": "end", "status": "ok", "exit_code": 0}"#;
        let rec: RunRecord = serde_json::from_str(line).unwrap();
        assert_eq!(
            rec,
            RunRecord::End {
                ts: "2026-09-15T18:23:48Z".into(),
                run_id: "01J".into(),
                status: RunStatus::Ok,
                exit_code: 0,
                traceback: None
            }
        );
        let back = serde_json::to_value(&rec).unwrap();
        assert_eq!(back["phase"], "end");
        assert_eq!(back["status"], "ok");
        assert!(back.get("traceback").is_none());
    }

    #[test]
    fn fixture_run_is_grouped() {
        let runs = fixture_store().list_runs(&RunFilter::default()).unwrap();
        assert_eq!(runs.len(), 1);
        let r = &runs[0];
        assert_eq!(r.run_id, "01J7ZK3Q8R");
        assert_eq!(r.script, "on_copy_complete.py");
        assert_eq!(r.app.as_deref(), Some("offshoot"));
        assert_eq!(
            r.logs,
            vec![LogLine {
                ts: "2026-09-15T18:23:48Z".to_string(),
                message: "posted to slack".to_string()
            }]
        );
        assert_eq!(r.status, Some(RunStatus::Ok));
        assert_eq!(r.exit_code, Some(0));
        assert_eq!(
            fixture_store()
                .get_run("01J7ZK3Q8R")
                .unwrap()
                .unwrap()
                .run_id,
            "01J7ZK3Q8R"
        );
        assert_eq!(fixture_store().get_run("nope").unwrap(), None);
    }

    #[test]
    fn filters_limit_and_order() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        fs::create_dir_all(store.runs_dir()).unwrap();
        fs::write(
            store.runs_dir().join("2026-09-14.jsonl"),
            concat!(
                r#"{"ts":"2026-09-14T10:00:00Z","run_id":"a","phase":"start","app":"offshoot","event":"DiskAdded","script":"x.py","profile":"p1"}"#, "\n",
                r#"{"ts":"2026-09-14T10:00:01Z","run_id":"a","phase":"end","status":"failed","exit_code":1}"#, "\n",
                "this line is garbage\n",
                r#"{"ts":"2026-09-14T11:00:00Z","run_id":"orphan","phase":"log","message":"no start"}"#, "\n",
            ),
        )
        .unwrap();
        fs::write(
            store.runs_dir().join("2026-09-15.jsonl"),
            concat!(
                r#"{"ts":"2026-09-15T10:00:00Z","run_id":"b","phase":"start","script":"y.py","profile":"p2"}"#, "\n",
                r#"{"ts":"2026-09-15T12:00:00Z","run_id":"c","phase":"start","app":"foolcat","event":"ReportCreated","script":"x.py","profile":"p1"}"#, "\n",
            ),
        )
        .unwrap();

        let all = store.list_runs(&RunFilter::default()).unwrap();
        assert_eq!(
            all.iter().map(|r| r.run_id.as_str()).collect::<Vec<_>>(),
            vec!["c", "b", "a"]
        );
        assert_eq!(all[0].status, None); // still running / never ended
        assert_eq!(all[2].status, Some(RunStatus::Failed));

        let p1 = store
            .list_runs(&RunFilter {
                profile: Some("p1".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            p1.iter().map(|r| r.run_id.as_str()).collect::<Vec<_>>(),
            vec!["c", "a"]
        );
        let x = store
            .list_runs(&RunFilter {
                script: Some("x.py".into()),
                app: Some("offshoot".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            x.iter().map(|r| r.run_id.as_str()).collect::<Vec<_>>(),
            vec!["a"]
        );
        let one = store
            .list_runs(&RunFilter {
                limit: Some(1),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(one.len(), 1);
        assert_eq!(one[0].run_id, "c");
    }

    #[test]
    fn missing_runs_dir_is_empty_and_prune_deletes_old_files_only() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        assert!(store.list_runs(&RunFilter::default()).unwrap().is_empty());
        assert!(store
            .prune_runs(Date::constant(2026, 9, 15), 30)
            .unwrap()
            .is_empty());

        fs::create_dir_all(store.runs_dir()).unwrap();
        for name in [
            "2026-08-15.jsonl",
            "2026-08-16.jsonl",
            "2026-09-15.jsonl",
            "notes.txt",
            "bad-name.jsonl",
        ] {
            fs::write(store.runs_dir().join(name), "").unwrap();
        }
        let deleted = store.prune_runs(Date::constant(2026, 9, 15), 30).unwrap();
        let deleted: Vec<String> = deleted
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into())
            .collect();
        assert_eq!(deleted, vec!["2026-08-15.jsonl"]); // 31 days old; 2026-08-16 is exactly 30 and kept
        assert!(store.runs_dir().join("2026-08-16.jsonl").exists());
        assert!(store.runs_dir().join("notes.txt").exists());
        assert!(store.runs_dir().join("bad-name.jsonl").exists());
    }

    #[test]
    fn duplicate_start_keeps_the_first_and_its_logs() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        fs::create_dir_all(store.runs_dir()).unwrap();
        fs::write(
            store.runs_dir().join("2026-09-15.jsonl"),
            concat!(
                r#"{"ts":"2026-09-15T10:00:00Z","run_id":"d","phase":"start","script":"x.py","profile":"p"}"#,
                "\n",
                r#"{"ts":"2026-09-15T10:00:01Z","run_id":"d","phase":"log","message":"first"}"#,
                "\n",
                r#"{"ts":"2026-09-15T10:00:02Z","run_id":"d","phase":"start","script":"y.py","profile":"p"}"#,
                "\n",
                r#"{"ts":"2026-09-15T10:00:03Z","run_id":"d","phase":"end","status":"ok","exit_code":0}"#,
                "\n",
            ),
        )
        .unwrap();

        let runs = store.list_runs(&RunFilter::default()).unwrap();
        assert_eq!(runs.len(), 1);
        let r = &runs[0];
        assert_eq!(r.run_id, "d");
        assert_eq!(r.script, "x.py");
        assert_eq!(r.logs.len(), 1);
        assert_eq!(r.status, Some(RunStatus::Ok));
    }
}
