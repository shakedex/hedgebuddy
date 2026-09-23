//! Watch the data directory so front ends can react to external writes
//! (for example an MCP client editing a profile while the GUI is open).

use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};

/// The kind of filesystem change a watcher event represents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChangeKind {
    /// A file or directory was created.
    Created,
    /// A file or directory was modified.
    Modified,
    /// A file or directory was removed.
    Removed,
    /// Some other kind of change (for example a rename).
    Other,
}

/// A single filesystem change reported by [`watch()`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Change {
    /// The path that changed.
    pub path: PathBuf,
    /// The kind of change.
    pub kind: ChangeKind,
}

/// Keeps the OS watcher alive. Drop it to stop watching.
pub struct WatchHandle {
    _watcher: RecommendedWatcher,
}

/// Start watching `root` recursively. The directory is created if missing.
///
/// Reported paths are expressed under `root` exactly as the caller passed
/// it, even on platforms whose watcher backend canonicalizes (macOS).
pub fn watch(root: &Path) -> Result<(WatchHandle, Receiver<Change>)> {
    std::fs::create_dir_all(root).map_err(|e| CoreError::io(root, e))?;
    let canonical = root.canonicalize().map_err(|e| CoreError::io(root, e))?;
    let root_owned = root.to_path_buf();
    let canonical_for_events = canonical.clone();
    let (tx, rx) = channel::<Change>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        let kind = match event.kind {
            EventKind::Create(_) => ChangeKind::Created,
            EventKind::Modify(_) => ChangeKind::Modified,
            EventKind::Remove(_) => ChangeKind::Removed,
            _ => ChangeKind::Other,
        };
        for path in event.paths {
            if path.extension().map(|e| e == "tmp").unwrap_or(false) {
                continue;
            }
            // The watcher backend may report a canonicalized path (notably
            // FSEvents on macOS); rebase it under the root the caller passed
            // in so paths compare equal to what the caller expects.
            let path = match path.strip_prefix(&canonical_for_events) {
                Ok(rel) => root_owned.join(rel),
                Err(_) => path,
            };
            // A closed receiver just means nobody is listening any more.
            let _ = tx.send(Change { path, kind });
        }
    })
    .map_err(|e| CoreError::Watch(format!("cannot start file watcher: {e}")))?;
    watcher
        .watch(&canonical, RecursiveMode::Recursive)
        .map_err(|e| CoreError::Watch(format!("cannot watch {}: {e}", root.display())))?;
    Ok((WatchHandle { _watcher: watcher }, rx))
}

/// Changes that arrive within this long after the first one form one batch.
pub const BATCH_WINDOW: Duration = Duration::from_millis(200);

/// Like [`watch()`], but delivers changes in batches: the first change opens
/// a window of `window`, and every change that arrives before it closes
/// joins the same batch. Bursts (an editor's save, macOS's FSEvents) become
/// one notification. Dropping the handle ends the batching thread.
pub fn watch_batched(
    root: &Path,
    window: Duration,
) -> Result<(WatchHandle, Receiver<Vec<Change>>)> {
    let (handle, changes) = watch(root)?;
    let (tx, batches) = channel();
    std::thread::Builder::new()
        .name("hedgebuddy-watch-batch".into())
        .spawn(move || batch_changes(changes, tx, window))
        .map_err(|e| CoreError::Watch(format!("cannot start the batching thread: {e}")))?;
    Ok((handle, batches))
}

/// Group `changes` into batches (see [`watch_batched`]) and send them on
/// `batches`, until the watcher stops or nobody listens any more.
pub fn batch_changes(changes: Receiver<Change>, batches: Sender<Vec<Change>>, window: Duration) {
    while let Ok(first) = changes.recv() {
        let mut batch = vec![first];
        let deadline = Instant::now() + window;
        let mut watcher_gone = false;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                break;
            }
            match changes.recv_timeout(left) {
                Ok(change) => batch.push(change),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    watcher_gone = true;
                    break;
                }
            }
        }
        if batches.send(batch).is_err() || watcher_gone {
            return;
        }
    }
}

/// What a change in the data folder affects, so a front end knows what to
/// reload.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Category {
    /// `hedgebuddy.json` or the list of profiles.
    Index,
    /// A profile's `profile.json` or `secrets.json`.
    Profile(String),
    /// A profile's scripts folder.
    Scripts(String),
    /// Run records.
    Runs,
    /// Catalog overrides.
    Catalog,
    /// The Claude activity log.
    Activity,
    /// `preferences.json`.
    Preferences,
}

impl std::fmt::Display for Category {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Category::Index => f.write_str("index"),
            Category::Profile(name) => write!(f, "profile:{name}"),
            Category::Scripts(name) => write!(f, "scripts:{name}"),
            Category::Runs => f.write_str("runs"),
            Category::Catalog => f.write_str("catalog"),
            Category::Activity => f.write_str("activity"),
            Category::Preferences => f.write_str("preferences"),
        }
    }
}

/// The category of a changed `path` under `root`, or `None` for the lock
/// file, temporary files and anything HedgeBuddy does not store.
pub fn categorize(root: &Path, path: &Path) -> Option<Category> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<&str> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect();
    match parts.as_slice() {
        ["hedgebuddy.json"] | ["profiles"] => Some(Category::Index),
        ["profiles", name, "scripts", ..] => Some(Category::Scripts((*name).to_owned())),
        ["profiles", name, ..] => Some(Category::Profile((*name).to_owned())),
        ["runs", ..] => Some(Category::Runs),
        ["catalog", ..] => Some(Category::Catalog),
        ["activity.jsonl"] => Some(Category::Activity),
        ["preferences.json"] => Some(Category::Preferences),
        _ => None,
    }
}

/// The categories a batch touches, sorted and without repeats.
pub fn categories(root: &Path, changes: &[Change]) -> Vec<String> {
    let set: BTreeSet<Category> = changes
        .iter()
        .filter_map(|c| categorize(root, &c.path))
        .collect();
    set.into_iter().map(|c| c.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;
    use std::time::Duration;

    fn change(path: &Path) -> Change {
        Change {
            path: path.to_path_buf(),
            kind: ChangeKind::Modified,
        }
    }

    #[test]
    fn paths_map_to_categories() {
        let root = Path::new("/data/HedgeBuddy");
        let cat = |rel: &str| categorize(root, &root.join(rel)).map(|c| c.to_string());
        assert_eq!(cat("hedgebuddy.json").as_deref(), Some("index"));
        assert_eq!(cat("profiles").as_deref(), Some("index"));
        assert_eq!(cat("profiles/p").as_deref(), Some("profile:p"));
        assert_eq!(cat("profiles/p/profile.json").as_deref(), Some("profile:p"));
        assert_eq!(cat("profiles/p/secrets.json").as_deref(), Some("profile:p"));
        assert_eq!(cat("profiles/p/scripts").as_deref(), Some("scripts:p"));
        assert_eq!(
            cat("profiles/p/scripts/copy.py").as_deref(),
            Some("scripts:p")
        );
        assert_eq!(cat("runs/2026-09-23.jsonl").as_deref(), Some("runs"));
        assert_eq!(cat("catalog/offshoot.toml").as_deref(), Some("catalog"));
        assert_eq!(cat("activity.jsonl").as_deref(), Some("activity"));
        assert_eq!(cat("preferences.json").as_deref(), Some("preferences"));
        assert_eq!(cat(".hedgebuddy.lock"), None);
        assert_eq!(cat("something-else.txt"), None);
        assert_eq!(categorize(root, root), None);
        assert_eq!(categorize(root, Path::new("/elsewhere/x.json")), None);
    }

    #[test]
    fn a_batch_lists_each_category_once_in_order() {
        let root = Path::new("/data/HedgeBuddy");
        let batch = [
            change(&root.join("runs/a.jsonl")),
            change(&root.join("profiles/p/profile.json")),
            change(&root.join("runs/b.jsonl")),
            change(&root.join(".hedgebuddy.lock")),
        ];
        assert_eq!(categories(root, &batch), ["profile:p", "runs"]);
    }

    #[test]
    fn changes_within_the_window_form_one_batch() {
        let (tx, rx) = channel();
        let (btx, brx) = channel();
        let worker = std::thread::spawn(move || batch_changes(rx, btx, Duration::from_millis(150)));
        let p = Path::new("/x");
        for _ in 0..3 {
            tx.send(change(p)).unwrap();
        }
        let first = brx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(first.len(), 3);
        std::thread::sleep(Duration::from_millis(300));
        tx.send(change(p)).unwrap();
        let second = brx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(second.len(), 1);
        drop(tx);
        worker.join().unwrap();
    }

    #[test]
    fn the_batched_watcher_reports_a_write() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("HedgeBuddy");
        let (_handle, batches) = watch_batched(&root, BATCH_WINDOW).unwrap();
        let target = root.join("preferences.json");
        crate::fs_util::write_atomic(&target, b"{}\n", false).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while std::time::Instant::now() < deadline {
            if let Ok(batch) = batches.recv_timeout(Duration::from_millis(500)) {
                if categories(&root, &batch).contains(&"preferences".to_owned()) {
                    return;
                }
            }
        }
        panic!("no batch for {}", target.display());
    }

    #[test]
    fn a_written_file_produces_a_change_and_tmp_files_are_hidden() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("HedgeBuddy");
        let (_handle, rx) = watch(&root).unwrap();
        assert!(root.is_dir());

        let target = root.join("hedgebuddy.json");
        crate::fs_util::write_atomic(&target, b"{}\n", false).unwrap();

        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut saw_target = false;
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(change) => {
                    assert!(
                        change.path.extension().map(|e| e != "tmp").unwrap_or(true),
                        "tmp file leaked: {}",
                        change.path.display()
                    );
                    if change.path == target {
                        saw_target = true;
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(e) => panic!("watcher channel closed: {e}"),
            }
        }
        assert!(saw_target, "no change event for {}", target.display());
    }
}
