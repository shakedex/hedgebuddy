//! What the app keeps for its whole run.

use std::sync::{Arc, Mutex, RwLock};

use hedgebuddy_core::WatchHandle;
use hedgebuddy_tools::app::{start_session, PythonCache};
use hedgebuddy_tools::Context;

/// Managed Tauri state.
pub struct AppState {
    /// The tool context over the real machine and data folder; replaced
    /// when the catalog overrides change (see [`AppState::reload_catalog`]).
    ctx: RwLock<Arc<Context>>,
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
            ctx: RwLock::new(ctx),
            since: session.since,
            python: Arc::new(PythonCache::default()),
            watch: Mutex::new(None),
        })
    }

    /// The current tool context. Callers clone the Arc and release the lock
    /// at once, so a reload never waits for a running command.
    pub fn ctx(&self) -> Arc<Context> {
        self.ctx.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Rebuild the context so catalog overrides in `<data>/catalog/` apply.
    /// A command still running on the old context finishes on it; the new
    /// context shares the old one's in-process write lock, so a write on
    /// each queues rather than one reporting busy.
    pub fn reload_catalog(&self) {
        match Context::real() {
            Ok(fresh) => {
                let fresh = Arc::new(fresh.with_write_lock_of(&self.ctx()));
                *self.ctx.write().unwrap_or_else(|e| e.into_inner()) = fresh;
            }
            Err(e) => eprintln!("hedgebuddy: could not reload the catalog: {}", e.0),
        }
    }
}
