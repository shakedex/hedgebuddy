//! Location of the HedgeBuddy data directory.

use std::path::PathBuf;

/// Environment variable that overrides the data directory. Used by tests and
/// by anyone who wants HedgeBuddy to keep its files somewhere unusual.
pub const DATA_DIR_ENV: &str = "HEDGEBUDDY_DATA_DIR";

/// Errors from resolving the data directory.
#[derive(Debug, thiserror::Error)]
pub enum PathError {
    #[error("could not determine the user's application data directory")]
    NoBaseDir,
}

/// Resolve the HedgeBuddy data directory. Does not create it.
pub fn data_dir() -> Result<PathBuf, PathError> {
    if let Some(v) = std::env::var_os(DATA_DIR_ENV) {
        if !v.is_empty() {
            return Ok(PathBuf::from(v));
        }
    }
    let base = directories::BaseDirs::new().ok_or(PathError::NoBaseDir)?;
    // `config_dir()` is %APPDATA% (Roaming) on Windows and
    // ~/Library/Application Support on macOS, which is exactly what the spec asks for.
    Ok(base.config_dir().join("HedgeBuddy"))
}

#[cfg(test)]
mod tests {
    use super::*;

    // One test, not two, because the two halves mutate the same process-wide
    // environment variable and cargo runs tests in parallel threads.
    #[test]
    fn data_dir_honours_env_override_then_falls_back_to_platform_default() {
        std::env::set_var(DATA_DIR_ENV, "Z:/hb-override");
        assert_eq!(data_dir().unwrap(), PathBuf::from("Z:/hb-override"));

        std::env::set_var(DATA_DIR_ENV, "");
        let d = data_dir().unwrap();
        assert!(d.ends_with("HedgeBuddy"), "got {}", d.display());

        std::env::remove_var(DATA_DIR_ENV);
        let d = data_dir().unwrap();
        assert!(d.ends_with("HedgeBuddy"), "got {}", d.display());

        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA").expect("APPDATA is set on Windows");
            assert!(
                d.starts_with(&appdata),
                "{} should start with {}",
                d.display(),
                appdata
            );
        }
        #[cfg(target_os = "macos")]
        {
            let s = d.to_string_lossy();
            assert!(s.contains("Library/Application Support"), "got {s}");
        }
    }
}
