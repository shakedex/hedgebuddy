//! The one error type for the crate.

use std::path::PathBuf;

/// Every fallible core operation returns this.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("i/o error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("invalid JSON in {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("{0}")]
    Validation(String),
    #[error("profile '{0}' not found")]
    ProfileNotFound(String),
    #[error("profile '{0}' already exists")]
    ProfileExists(String),
    #[error("variable '{0}' not found")]
    VariableNotFound(String),
    #[error("script '{0}' not found")]
    ScriptNotFound(String),
    #[error("invalid script manifest: {0}")]
    Manifest(String),
    /// The file watcher could not be started or could not watch the data directory.
    #[error("file watcher: {0}")]
    Watch(String),
    #[error(transparent)]
    Path(#[from] crate::paths::PathError),
}

impl CoreError {
    pub(crate) fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        CoreError::Io {
            path: path.into(),
            source,
        }
    }
}

/// Core operation result type.
pub type Result<T> = std::result::Result<T, CoreError>;
