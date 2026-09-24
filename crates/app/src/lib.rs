//! HedgeBuddy desktop app. The UI calls the same tool layer as Claude
//! through one generic `tool` command, plus a few app-only commands; all
//! logic lives in `hedgebuddy_core` and `hedgebuddy_tools`.

mod commands;
mod state;
mod watcher;

use tauri::Manager;

/// Open the data folder, start watching it, and run the window.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = state::AppState::open()?;
            let root = state.ctx.store.root().to_path_buf();
            match watcher::start(app.handle().clone(), root) {
                Ok(handle) => *state.watch.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle),
                // The app still works; screens refresh when the window regains focus.
                Err(e) => eprintln!("hedgebuddy: live refresh is off: {e}"),
            }
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::tool,
            commands::home_summary,
            commands::activity,
            commands::preferences_get,
            commands::preferences_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HedgeBuddy");
}
