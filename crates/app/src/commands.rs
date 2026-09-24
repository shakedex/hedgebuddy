//! The commands the UI calls: the generic tool bridge and the app-only
//! commands. Each runs on a blocking thread; no logic lives here beyond
//! handing checked results to the OS (the editor, the opener, the dialogs).

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use hedgebuddy_core::{Preferences, PreferencesPatch};
use hedgebuddy_tools::app::{
    self, ActivityArgs, ActivityList, AppsOverview, ExportArgs, ExportResult, HomeSummary,
    ImportArgs, ImportSummary, OpenAppDocsArgs, OpenInEditorArgs, Opened, PathStatusArgs,
    PathStatusList, PickExportArgs, PickFolderArgs, PickedPath, ProfileArgs, RevealArgs,
    ScriptTemplate, ScriptTemplateArgs, ScriptsOverview, VariablesOverview,
};
use hedgebuddy_tools::{NoParams, ToolError};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State, Window};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};
use tauri_plugin_opener::OpenerExt;

use crate::state::AppState;

/// The file-type filter of the export and import dialogs.
const PROFILE_FILTER: &str = "HedgeBuddy profile";

/// What `reveal_path` shows a path in.
const FILE_MANAGER: &str = if cfg!(target_os = "macos") {
    "Finder"
} else if cfg!(windows) {
    "File Explorer"
} else {
    "the file manager"
};

/// How a command fails, as the UI sees it.
#[derive(Debug, Serialize)]
pub struct CommandError {
    /// `busy` when another HedgeBuddy holds the data folder (the UI offers
    /// Try again), otherwise `error`.
    kind: &'static str,
    /// The message to show.
    message: String,
}

impl From<ToolError> for CommandError {
    fn from(e: ToolError) -> CommandError {
        let kind = if e.is_busy() { "busy" } else { "error" };
        CommandError { kind, message: e.0 }
    }
}

/// Run `f` on a blocking thread.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, ToolError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| CommandError {
            kind: "error",
            message: format!("the command stopped unexpectedly: {e}"),
        })?
        .map_err(CommandError::from)
}

/// Run any tool, exactly as Claude and `hedgebuddy call` do. App calls are
/// not written to the Claude activity log.
#[tauri::command]
pub async fn tool(
    state: State<'_, AppState>,
    name: String,
    args: Value,
) -> Result<Value, CommandError> {
    let ctx = state.ctx();
    blocking(move || hedgebuddy_tools::call(&ctx, &name, args)).await
}

/// Everything Home and the sidebar badges show.
#[tauri::command]
pub async fn home_summary(
    state: State<'_, AppState>,
    args: NoParams,
) -> Result<HomeSummary, CommandError> {
    let _ = args;
    let (ctx, since, python) = (state.ctx(), state.since.clone(), state.python.clone());
    blocking(move || app::home_summary(&ctx, since.as_deref(), &python)).await
}

/// Claude's latest tool calls.
#[tauri::command]
pub async fn activity(
    state: State<'_, AppState>,
    args: ActivityArgs,
) -> Result<ActivityList, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::activity(&ctx, args)).await
}

/// The app's preferences.
#[tauri::command]
pub async fn preferences_get(
    state: State<'_, AppState>,
    args: NoParams,
) -> Result<Preferences, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::preferences_get(&ctx, args)).await
}

/// Change the app's preferences.
#[tauri::command]
pub async fn preferences_set(
    state: State<'_, AppState>,
    args: PreferencesPatch,
) -> Result<Preferences, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::preferences_set(&ctx, args)).await
}

/// Every variable of a profile with its problems, for the Variables screen.
#[tauri::command]
pub async fn variables_overview(
    state: State<'_, AppState>,
    args: ProfileArgs,
) -> Result<VariablesOverview, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::variables_overview(&ctx, args)).await
}

/// Every script of a profile with its attachments, for the Scripts screen.
#[tauri::command]
pub async fn scripts_overview(
    state: State<'_, AppState>,
    args: ProfileArgs,
) -> Result<ScriptsOverview, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::scripts_overview(&ctx, args)).await
}

/// Every catalog app with its status, for the Hedge apps screen.
#[tauri::command]
pub async fn apps_overview(
    state: State<'_, AppState>,
    args: NoParams,
) -> Result<AppsOverview, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::apps_overview(&ctx, args)).await
}

/// Whether paths exist and their drives are mounted.
#[tauri::command]
pub async fn path_status(
    state: State<'_, AppState>,
    args: PathStatusArgs,
) -> Result<PathStatusList, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::path_status(&ctx, args)).await
}

/// A new script's source and a free name for it.
#[tauri::command]
pub async fn script_template(
    state: State<'_, AppState>,
    args: ScriptTemplateArgs,
) -> Result<ScriptTemplate, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::script_template(&ctx, args)).await
}

/// Write a profile to an export file outside the data folder.
#[tauri::command]
pub async fn export_profile(
    state: State<'_, AppState>,
    args: ExportArgs,
) -> Result<ExportResult, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::export_profile(&ctx, args)).await
}

/// Create a profile from an export file.
#[tauri::command]
pub async fn import_profile(
    state: State<'_, AppState>,
    args: ImportArgs,
) -> Result<ImportSummary, CommandError> {
    let ctx = state.ctx();
    blocking(move || app::import_profile(&ctx, args)).await
}

/// Open a profile script with the editor command from preferences, or the
/// system's default app for .py files.
#[tauri::command]
pub async fn open_in_editor(
    app: AppHandle,
    state: State<'_, AppState>,
    args: OpenInEditorArgs,
) -> Result<Opened, CommandError> {
    let ctx = state.ctx();
    blocking(move || {
        let file = app::script_file(&ctx, args.profile.as_deref(), &args.script)?;
        match ctx.store.preferences()?.editor_command {
            Some(command) => {
                let argv = app::editor_argv(&command, &file)?;
                let program = program_path(&argv[0])?;
                spawn_detached(&program, &argv[1..])
                    .map_err(|e| ToolError::new(format!("could not start {}: {e}", argv[0])))?;
                Ok(Opened {
                    path: file.display().to_string(),
                    with: command,
                })
            }
            None => {
                app.opener()
                    .open_path(file.display().to_string(), None::<&str>)
                    .map_err(|e| {
                        ToolError::new(format!("could not open {}: {e}", file.display()))
                    })?;
                Ok(Opened {
                    path: file.display().to_string(),
                    with: "the default app".into(),
                })
            }
        }
    })
    .await
}

/// The program to start for the editor command's first word. On Windows it
/// is found through `PATH` and `PATHEXT` (so `code` finds `code.cmd`), never
/// in the current folder; a name not found there is left to the OS. A name
/// with a relative folder (`bin/ed`) is refused on every platform: it would
/// resolve against the app's current folder, which the operator never chose.
fn program_path(name: &str) -> Result<PathBuf, ToolError> {
    #[cfg(windows)]
    let (path_var, pathext) = (
        std::env::var("PATH").unwrap_or_default(),
        std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into()),
    );
    // Elsewhere the OS searches PATH itself; with an empty PATH the call
    // only refuses a relative folder.
    #[cfg(not(windows))]
    let (path_var, pathext) = (String::new(), String::new());
    Ok(app::find_in_path(name, &path_var, &pathext)?.unwrap_or_else(|| PathBuf::from(name)))
}

/// Start `program` with `args` and do not wait for it. No shell runs it
/// (the standard library quotes arguments for a `.cmd` or `.bat` file
/// safely), its standard streams are closed, and on Windows it gets no
/// console window.
fn spawn_detached(program: &Path, args: &[String]) -> std::io::Result<()> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let child = command.spawn()?;
    // On Unix a child that exits stays a zombie until it is waited for; a
    // thread waits, so editors opened during a session do not pile up.
    #[cfg(unix)]
    {
        let mut child = child;
        let _ = std::thread::Builder::new()
            .name("hedgebuddy-editor".into())
            .spawn(move || {
                let _ = child.wait();
            });
    }
    #[cfg(not(unix))]
    drop(child);
    Ok(())
}

/// Show a file or folder in the file manager: only the data folder and
/// Hedge app files (see `reveal_target`).
#[tauri::command]
pub async fn reveal_path(
    app: AppHandle,
    state: State<'_, AppState>,
    args: RevealArgs,
) -> Result<Opened, CommandError> {
    let ctx = state.ctx();
    blocking(move || {
        // The opener gets the checked, canonical path, never the UI's text.
        let target = app::reveal_target(&ctx, &args.path)?;
        app.opener()
            .reveal_item_in_dir(&target)
            .map_err(|e| ToolError::new(format!("could not show {}: {e}", args.path)))?;
        Ok(Opened {
            path: args.path,
            with: FILE_MANAGER.into(),
        })
    })
    .await
}

/// Open a catalog app's docs page (`https://` only) in the browser.
#[tauri::command]
pub async fn open_app_docs(
    app: AppHandle,
    state: State<'_, AppState>,
    args: OpenAppDocsArgs,
) -> Result<Opened, CommandError> {
    let ctx = state.ctx();
    blocking(move || {
        let url = app::app_docs_url(&ctx, &args.app)?;
        app.opener()
            .open_url(url.clone(), None::<&str>)
            .map_err(|e| ToolError::new(format!("could not open {url}: {e}")))?;
        Ok(Opened {
            path: url,
            with: "the browser".into(),
        })
    })
    .await
}

/// Ask the operator for a folder.
#[tauri::command]
pub async fn pick_folder(window: Window, args: PickFolderArgs) -> Result<PickedPath, CommandError> {
    blocking(move || {
        let mut dialog = file_dialog(&window);
        if let Some(title) = args.title {
            dialog = dialog.set_title(title);
        }
        picked(dialog.blocking_pick_folder())
    })
    .await
}

/// Ask the operator where to save a profile export.
#[tauri::command]
pub async fn pick_export_path(
    window: Window,
    args: PickExportArgs,
) -> Result<PickedPath, CommandError> {
    blocking(move || {
        let dialog = file_dialog(&window)
            .set_title("Export profile")
            .add_filter(PROFILE_FILTER, &["json"])
            .set_file_name(args.default_name);
        picked(dialog.blocking_save_file())
    })
    .await
}

/// Ask the operator for a profile export to import.
#[tauri::command]
pub async fn pick_import_file(window: Window, args: NoParams) -> Result<PickedPath, CommandError> {
    let _ = args;
    blocking(move || {
        let dialog = file_dialog(&window)
            .set_title("Import profile")
            .add_filter(PROFILE_FILTER, &["json"]);
        picked(dialog.blocking_pick_file())
    })
    .await
}

/// A file dialog in front of `window`. Its blocking calls wait for the
/// operator, so they run only inside [`blocking`], never on the main thread.
fn file_dialog(window: &Window) -> FileDialogBuilder<tauri::Wry> {
    window.dialog().file().set_parent(window)
}

/// A dialog's answer: the chosen path, or none when it was cancelled.
fn picked(choice: Option<FilePath>) -> Result<PickedPath, ToolError> {
    let Some(choice) = choice else {
        return Ok(PickedPath { path: None });
    };
    let path = choice
        .simplified()
        .into_path()
        .map_err(|e| ToolError::new(format!("the chosen item is not a file path: {e}")))?;
    let path = path.into_os_string().into_string().map_err(|p| {
        ToolError::new(format!(
            "the chosen path {} is not valid Unicode",
            Path::new(&p).display()
        ))
    })?;
    Ok(PickedPath { path: Some(path) })
}

#[cfg(test)]
mod tests {
    use hedgebuddy_tools::ToolError;

    use super::CommandError;

    #[test]
    fn busy_errors_are_marked_so_the_ui_can_offer_try_again() {
        let busy = CommandError::from(ToolError::new(hedgebuddy_core::BUSY_MESSAGE));
        assert_eq!(
            serde_json::to_value(&busy).unwrap(),
            serde_json::json!({"kind": "busy", "message": hedgebuddy_core::BUSY_MESSAGE})
        );
        let other = CommandError::from(ToolError::new("profile 'x' not found"));
        assert_eq!(serde_json::to_value(&other).unwrap()["kind"], "error");
    }
}
