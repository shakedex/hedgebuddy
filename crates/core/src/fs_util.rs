//! Atomic, UTF-8, schema-friendly file I/O.

use std::fs;
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{CoreError, Result};

/// Write `bytes` to `path` atomically: write to a sibling temp file, then
/// rename over the target. Creates parent directories. When `private` is
/// true the file is created with mode 0600 on Unix (no-op on Windows).
pub fn write_atomic(path: &Path, bytes: &[u8], private: bool) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| CoreError::io(parent, e))?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
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
    fs::rename(tmp, path).map_err(|e| CoreError::io(path, e))?;
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
        let parent = dir.path().join("parent_file");

        // Create a file where the parent directory should be,
        // so create_dir_all fails before the temp file is created.
        fs::write(&parent, b"obstacle").unwrap();

        let path = parent.join("testfile");

        // Attempt to write_atomic: create_dir_all should fail
        let result = write_atomic(&path, b"test", false);
        assert!(result.is_err());

        // Verify no .tmp file exists (if one were created before the error,
        // it should have been cleaned up, but in this case create_dir_all
        // fails first so no temp file is ever created)
        assert!(!path.with_extension("tmp").exists());
    }
}
