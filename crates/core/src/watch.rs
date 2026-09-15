//! Watch the data directory so front ends can react to external writes
//! (for example an MCP client editing a profile while the GUI is open).

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::error::{CoreError, Result};

/// The kind of filesystem change a watcher event represents.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Created,
    Modified,
    Removed,
    Other,
}

/// A single filesystem change reported by [`watch`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Change {
    pub path: PathBuf,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

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
