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
        // Both plugins are used only from the Rust commands below; the
        // webview's capabilities grant none of their JavaScript commands.
        // The opener's link-click script would only call a command the
        // webview may not use, so it is left out.
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .setup(|app| {
            let state = state::AppState::open()?;
            let root = state.ctx().store.root().to_path_buf();
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
            commands::variables_overview,
            commands::scripts_overview,
            commands::apps_overview,
            commands::path_status,
            commands::script_template,
            commands::export_profile,
            commands::import_profile,
            commands::open_in_editor,
            commands::reveal_path,
            commands::open_app_docs,
            commands::pick_folder,
            commands::pick_export_path,
            commands::pick_import_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HedgeBuddy");
}
