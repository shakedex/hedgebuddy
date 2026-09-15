//! Atomic, UTF-8, schema-friendly file I/O.

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{CoreError, Result};

/// Per-process counter mixed into every temp file name so that two
/// concurrent writers of the same target file never collide.
static COUNTER: AtomicU64 = AtomicU64::new(0);

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
    fs::rename(tmp, path).map_err(|e| {
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
