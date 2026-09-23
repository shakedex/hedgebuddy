//! The cross-process write lock, `<data>/.hedgebuddy.lock`.

use std::fs::{File, OpenOptions, TryLockError};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::error::{CoreError, Result};
use crate::store::Store;

/// How long a writer waits for another HedgeBuddy process.
pub const LOCK_TIMEOUT: Duration = Duration::from_secs(10);

/// What a writer reports when the lock stays taken (`CoreError::Busy`).
pub const BUSY_MESSAGE: &str = "another HedgeBuddy is busy; try again";

/// How often a waiting writer tries again.
const RETRY_EVERY: Duration = Duration::from_millis(25);

/// The exclusive write lock on a data folder. Released when dropped.
#[derive(Debug)]
#[must_use = "the lock is released as soon as this value is dropped"]
pub struct DataLock {
    file: File,
}

impl Drop for DataLock {
    fn drop(&mut self) {
        // Closing the file releases the lock too; unlocking first makes the
        // release immediate on every platform.
        let _ = self.file.unlock();
    }
}

impl Store {
    /// `<root>/.hedgebuddy.lock`, the file writers lock.
    pub fn lock_path(&self) -> PathBuf {
        self.root().join(".hedgebuddy.lock")
    }

    /// Take the write lock, waiting up to [`LOCK_TIMEOUT`] for another
    /// HedgeBuddy process (an MCP server, the app, `hedgebuddy call`).
    pub fn lock(&self) -> Result<DataLock> {
        self.lock_within(LOCK_TIMEOUT)
    }

    /// Take the write lock, waiting up to `timeout`. Fails with
    /// [`CoreError::Busy`] when another holder keeps it that long. Creates
    /// the data folder and the lock file when missing.
    pub fn lock_within(&self, timeout: Duration) -> Result<DataLock> {
        std::fs::create_dir_all(self.root()).map_err(|e| CoreError::io(self.root(), e))?;
        let path = self.lock_path();
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&path)
            .map_err(|e| CoreError::io(&path, e))?;
        let deadline = Instant::now() + timeout;
        loop {
            match file.try_lock() {
                Ok(()) => return Ok(DataLock { file }),
                Err(TryLockError::WouldBlock) if Instant::now() < deadline => {
                    std::thread::sleep(RETRY_EVERY)
                }
                Err(TryLockError::WouldBlock) => return Err(CoreError::Busy),
                Err(TryLockError::Error(e)) => return Err(CoreError::io(&path, e)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::*;
    use crate::error::CoreError;
    use crate::store::Store;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("HedgeBuddy"));
        (dir, store)
    }

    #[test]
    fn a_second_writer_waits_then_reports_busy() {
        let (_d, store) = temp_store();
        let held = store.lock().unwrap();
        assert!(store.lock_path().is_file());
        let started = Instant::now();
        let err = store.lock_within(Duration::from_millis(300)).unwrap_err();
        let waited = started.elapsed();
        assert!(matches!(err, CoreError::Busy), "{err}");
        assert_eq!(err.to_string(), BUSY_MESSAGE);
        assert!(
            waited >= Duration::from_millis(300),
            "gave up after {waited:?}"
        );
        assert!(waited < Duration::from_secs(3), "waited {waited:?}");
        drop(held);
        drop(store.lock_within(Duration::from_millis(300)).unwrap());
    }

    #[test]
    fn a_waiting_writer_gets_the_lock_once_it_is_released() {
        let (_d, store) = temp_store();
        let held = store.lock().unwrap();
        let other = store.clone();
        let waiter = std::thread::spawn(move || {
            let lock = other.lock_within(Duration::from_secs(5));
            (lock.is_ok(), Instant::now())
        });
        std::thread::sleep(Duration::from_millis(200));
        let released = Instant::now();
        drop(held);
        let (ok, acquired) = waiter.join().unwrap();
        assert!(ok, "the waiter never got the lock");
        assert!(acquired >= released);
    }

    #[test]
    fn the_default_lock_gives_up_after_ten_seconds() {
        assert_eq!(LOCK_TIMEOUT, Duration::from_secs(10));
        let (_d, store) = temp_store();
        let _held = store.lock().unwrap();
        let started = Instant::now();
        assert!(matches!(store.lock(), Err(CoreError::Busy)));
        let waited = started.elapsed();
        assert!(
            waited >= Duration::from_secs(10) && waited < Duration::from_secs(13),
            "waited {waited:?}"
        );
    }
}
