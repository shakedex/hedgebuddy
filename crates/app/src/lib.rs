//! HedgeBuddy desktop app. The UI calls the same tool layer as Claude
//! through one generic `tool` command, plus a few app-only commands; all
//! logic lives in `hedgebuddy_core` and `hedgebuddy_tools`.

mod commands;
mod state;
mod watcher;

use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Open the data folder, start watching it, and run the window.
///
/// The main window is created here, after the state is managed, not by
/// Tauri at start (`create: false` in `tauri.conf.json`). So the webview
/// never exists without the state its commands need, and when the data
/// folder can't be opened the error dialog shows alone: no blank window
/// sits behind it, turning "Not responding" on Windows while
/// `blocking_show` holds the main thread. The dialog must stay without a
/// parent: with `.parent(window)`, macOS shows it as a sheet on that
/// window, which needs the main thread's event loop, and `blocking_show`
/// would wait forever.
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
            let state = match state::AppState::open() {
                Ok(state) => state,
                Err(reason) => {
                    // Without a window the error would only reach stderr,
                    // which a double-clicked app has none of.
                    app.dialog()
                        .message(format!(
                            "HedgeBuddy couldn't open its data folder: {reason}"
                        ))
                        .kind(MessageDialogKind::Error)
                        .title("HedgeBuddy can't start")
                        .blocking_show();
                    return Err(reason.into());
                }
            };
            let root = state.ctx().store.root().to_path_buf();
            match watcher::start(app.handle().clone(), root) {
                Ok(handle) => *state.watch.lock().unwrap_or_else(|e| e.into_inner()) = Some(handle),
                // The app still works; screens refresh when the window regains focus.
                Err(e) => eprintln!("hedgebuddy: live refresh is off: {e}"),
            }
            app.manage(state);
            // Only the windows deferred with `create: false`; Tauri has
            // already built any with `create: true`.
            let deferred: Vec<_> = app
                .config()
                .app
                .windows
                .iter()
                .filter(|w| !w.create)
                .cloned()
                .collect();
            for config in deferred {
                WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
            }
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
            commands::claude_desktop_status,
            commands::claude_desktop_plan,
            commands::claude_desktop_apply,
            commands::settings_overview,
            commands::pip_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HedgeBuddy");
}
