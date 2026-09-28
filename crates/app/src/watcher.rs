//! Tell the UI what changed in the data folder, so it reloads only that.

use std::path::PathBuf;

use hedgebuddy_core::{categories, watch_batched, WatchHandle, BATCH_WINDOW};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

/// Payload of the `data-changed` event.
#[derive(Debug, Clone, Serialize)]
struct DataChanged {
    categories: Vec<String>,
}

/// Start watching `root`; each batch of changes becomes one `data-changed`
/// event naming the categories it touched. A batch that touches the catalog
/// overrides rebuilds the tool context first, so the UI's reload sees them.
pub fn start(app: AppHandle, root: PathBuf) -> Result<WatchHandle, String> {
    let (handle, batches) = watch_batched(&root, BATCH_WINDOW).map_err(|e| e.to_string())?;
    std::thread::Builder::new()
        .name("hedgebuddy-data-changed".into())
        .spawn(move || {
            for batch in batches {
                let categories = categories(&root, &batch);
                if categories.is_empty() {
                    continue;
                }
                if categories.iter().any(|c| c == "catalog") {
                    // The state is managed right after the watcher starts;
                    // a batch that somehow comes first only misses a reload.
                    if let Some(state) = app.try_state::<AppState>() {
                        state.reload_catalog();
                    }
                }
                let _ = app.emit("data-changed", DataChanged { categories });
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(handle)
}
