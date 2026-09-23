//! The one error type for the crate.

use std::path::PathBuf;

/// Every fallible core operation returns this.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    /// Reading, writing, or removing a filesystem path failed.
    #[error("i/o error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    /// A file's contents were not valid JSON, or did not match the shape
    /// `serde` expected.
    #[error("invalid JSON in {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    /// A value failed one of core's own validation rules (a slug, a
    /// variable name, a typed value, a storage-format version, and so on).
    #[error("{0}")]
    Validation(String),
    /// No profile with this name exists.
    #[error("profile '{0}' not found")]
    ProfileNotFound(String),
    /// A profile with this name already exists.
    #[error("profile '{0}' already exists")]
    ProfileExists(String),
    /// No variable with this name exists in the profile.
    #[error("variable '{0}' not found")]
    VariableNotFound(String),
    /// No script with this name exists in the profile.
    #[error("script '{0}' not found")]
    ScriptNotFound(String),
    /// A script's manifest block failed to parse or did not satisfy the
    /// manifest's own rules (version, `event` requiring `app`, variable
    /// names).
    #[error("invalid script manifest: {0}")]
    Manifest(String),
    /// The file watcher could not be started or could not watch the data directory.
    #[error("file watcher: {0}")]
    Watch(String),
    /// The operation is not available on this platform, or for this app.
    #[error("not supported: {0}")]
    Unsupported(String),
    /// An operating-system call (registry, app bundle, URL handler, external
    /// program, volume list) failed.
    #[error("host error: {0}")]
    Host(String),
    /// A catalog file failed to parse or broke one of the catalog's rules.
    #[error("catalog: {0}")]
    Catalog(String),
    /// No app with this id is in the catalog.
    #[error("app '{0}' is not in the catalog")]
    AppNotFound(String),
    /// The app has no event with this id.
    #[error("{app} has no event '{event}'")]
    EventNotFound { app: String, event: String },
    /// The app has no command with this id.
    #[error("{app} has no command '{command}'")]
    CommandNotFound { app: String, command: String },
    /// The data directory's location could not be determined.
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
