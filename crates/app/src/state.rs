//! What the app keeps for its whole run.

use std::sync::{Arc, Mutex};

use hedgebuddy_core::WatchHandle;
use hedgebuddy_tools::app::{start_session, PythonCache};
use hedgebuddy_tools::Context;

/// Managed Tauri state.
pub struct AppState {
    /// The tool context over the real machine and data folder.
    pub ctx: Arc<Context>,
    /// `last_opened` as stored before this session started.
    pub since: Option<String>,
    /// The Python check behind the home summary, reused for 60 seconds.
    pub python: Arc<PythonCache>,
    /// Keeps the data-folder watcher alive.
    pub watch: Mutex<Option<WatchHandle>>,
}

impl AppState {
    /// Open the data folder and start a session.
    pub fn open() -> Result<AppState, String> {
        let ctx = Arc::new(Context::real().map_err(|e| e.0)?);
        let session = start_session(&ctx);
        if let Some(warning) = &session.warning {
            eprintln!("hedgebuddy: could not record this launch: {warning}");
        }
        Ok(AppState {
            ctx,
            since: session.since,
            python: Arc::new(PythonCache::default()),
            watch: Mutex::new(None),
        })
    }
}
