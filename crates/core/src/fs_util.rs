//! Atomic, UTF-8, schema-friendly file I/O.

use std::fs;
use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{CoreError, Result};

/// Per-process counter mixed into every temp file name so that two
/// concurrent writers of the same target file never collide.
static COUNTER: AtomicU64 = AtomicU64::new(0);

/// How long `write_atomic` keeps retrying a rename that Windows refuses.
const RENAME_RETRY_FOR: Duration = Duration::from_secs(1);
/// Pause between rename attempts.
const RENAME_RETRY_EVERY: Duration = Duration::from_millis(20);

/// Run `rename` until it succeeds, fails with anything other than
/// `PermissionDenied`, or `budget` runs out. With `retry` false it runs once.
/// On Windows `PermissionDenied` usually means another process (a virus
/// scanner, the Python library, another HedgeBuddy) has the target open for
/// a moment.
pub(crate) fn rename_with_retry(
    mut rename: impl FnMut() -> io::Result<()>,
    retry: bool,
    budget: Duration,
) -> io::Result<()> {
    let deadline = Instant::now() + budget;
    loop {
        match rename() {
            Err(e)
                if retry
                    && e.kind() == io::ErrorKind::PermissionDenied
                    && Instant::now() < deadline =>
            {
                std::thread::sleep(RENAME_RETRY_EVERY)
            }
            other => return other,
        }
    }
}

/// Windows device names that cannot be used as a file name, regardless of
/// case or of what follows the first `.`.
const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Whether the part of `name` before its first `.` is a Windows device name
/// such as `CON` or `lpt1`.
pub(crate) fn is_reserved_name(name: &str) -> bool {
    let base = name.split('.').next().unwrap_or(name);
    RESERVED_NAMES.iter().any(|r| r.eq_ignore_ascii_case(base))
}

/// Whether `c` cannot appear in a file name on Windows or macOS: a control
/// character, a path separator, or one of `: * ? " < > |`.
pub(crate) fn is_forbidden_char(c: char) -> bool {
    c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
}

/// Write `bytes` to `path` atomically: write to a sibling temp file, then
/// rename over the target. Creates parent directories. When `private` is
/// true the file is created with mode 0600 on Unix (no-op on Windows).
pub fn write_atomic(path: &Path, bytes: &[u8], private: bool) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
    }
    let pid = std::process::id();
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(format!(".{pid}.{count}.tmp"));
    let tmp = Path::new(&tmp);

    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    #[cfg(not(unix))]
    let _ = private;

    {
        use std::io::Write;
        let result = (|| {
            let mut f = opts.open(tmp).map_err(|e| CoreError::io(tmp, e))?;
            f.write_all(bytes).map_err(|e| CoreError::io(tmp, e))?;
            f.sync_all().map_err(|e| CoreError::io(tmp, e))?;
            Ok::<(), CoreError>(())
        })();
        if let Err(e) = result {
            let _ = fs::remove_file(tmp);
            return Err(e);
        }
    }
    rename_with_retry(|| fs::rename(tmp, path), cfg!(windows), RENAME_RETRY_FOR).map_err(|e| {
        let _ = fs::remove_file(tmp);
        CoreError::io(path, e)
    })?;
    Ok(())
}

/// Serialize `value` as pretty JSON (two-space indent, trailing newline) and
/// write it atomically.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T, private: bool) -> Result<()> {
    let mut text = serde_json::to_string_pretty(value).map_err(|e| CoreError::Json {
        path: path.to_path_buf(),
        source: e,
    })?;
    text.push('\n');
    write_atomic(path, text.as_bytes(), private)
}

/// Read and parse a JSON file. A missing file is an `Io` error.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T> {
    let text = fs::read_to_string(path).map_err(|e| CoreError::io(path, e))?;
    serde_json::from_str(&text).map_err(|e| CoreError::Json {
        path: path.to_path_buf(),
        source: e,
    })
}

/// Like `read_json`, but a missing file yields `default`.
pub fn read_json_or<T: DeserializeOwned>(path: &Path, default: T) -> Result<T> {
    if !path.exists() {
        return Ok(default);
    }
    read_json(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;
    use std::time::{Duration, Instant};

    fn denied() -> io::Error {
        io::Error::from(io::ErrorKind::PermissionDenied)
    }

    #[test]
    fn rename_retries_permission_denied_until_it_succeeds() {
        let mut calls = 0;
        let result = rename_with_retry(
            || {
                calls += 1;
                if calls < 4 {
                    Err(denied())
                } else {
                    Ok(())
                }
            },
            true,
            Duration::from_secs(1),
        );
        assert!(result.is_ok());
        assert_eq!(calls, 4);
    }

    #[test]
    fn rename_gives_up_when_the_budget_runs_out() {
        let started = Instant::now();
        let result = rename_with_retry(|| Err(denied()), true, Duration::from_millis(150));
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
        let waited = started.elapsed();
        assert!(
            waited >= Duration::from_millis(150) && waited < Duration::from_secs(1),
            "{waited:?}"
        );
    }

    #[test]
    fn rename_does_not_retry_other_errors_or_when_retry_is_off() {
        let mut calls = 0;
        let _ = rename_with_retry(
            || {
                calls += 1;
                Err(io::Error::from(io::ErrorKind::NotFound))
            },
            true,
            Duration::from_secs(1),
        );
        assert_eq!(calls, 1);
        let mut calls = 0;
        let _ = rename_with_retry(
            || {
                calls += 1;
                Err(denied())
            },
            false,
            Duration::from_secs(1),
        );
        assert_eq!(calls, 1);
    }

    #[cfg(windows)]
    #[test]
    fn write_atomic_waits_for_a_reader_holding_the_target() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("t.json");
        fs::write(&target, b"old").unwrap();
        // A reader that does not share delete access blocks replacing the file.
        const FILE_SHARE_READ: u32 = 1;
        let reader = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(&target)
            .unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            drop(reader);
        });
        write_atomic(&target, b"new", false).unwrap();
        release.join().unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
    }

    #[test]
    fn failed_write_leaves_no_tmp_file() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("hedgebuddy.json");

        // Create a directory at the target path so that rename fails
        // (renaming a file over a directory fails on Windows and macOS)
        fs::create_dir_all(&target).unwrap();

        // Attempt to write_atomic: the temp file will be created and written,
        // but rename will fail because the target is a directory
        let result = write_atomic(&target, b"{}", false);
        assert!(result.is_err());

        // The result should be an Io error
        assert!(matches!(result.unwrap_err(), CoreError::Io { .. }));

        // Verify the temp file was cleaned up (no file ending in .tmp exists
        // in the parent directory; the exact name includes pid and counter).
        let leaked: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "tmp").unwrap_or(false))
            .collect();
        assert!(
            leaked.is_empty(),
            "temp file(s) should be removed after failed rename: {leaked:?}"
        );

        // Verify the target directory still exists
        assert!(target.exists(), "target should still exist");
    }
}
