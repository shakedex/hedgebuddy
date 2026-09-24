//! The commands the UI calls: the generic tool bridge and the app-only
//! commands. Each runs on a blocking thread; no logic lives here.

use hedgebuddy_core::{Preferences, PreferencesPatch};
use hedgebuddy_tools::app::{self, ActivityArgs, ActivityList, HomeSummary};
use hedgebuddy_tools::{NoParams, ToolError};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::state::AppState;

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
    let ctx = state.ctx.clone();
    blocking(move || hedgebuddy_tools::call(&ctx, &name, args)).await
}

/// Everything Home and the sidebar badges show.
#[tauri::command]
pub async fn home_summary(
    state: State<'_, AppState>,
    args: NoParams,
) -> Result<HomeSummary, CommandError> {
    let _ = args;
    let (ctx, since, python) = (state.ctx.clone(), state.since.clone(), state.python.clone());
    blocking(move || app::home_summary(&ctx, since.as_deref(), &python)).await
}

/// Claude's latest tool calls.
#[tauri::command]
pub async fn activity(
    state: State<'_, AppState>,
    args: ActivityArgs,
) -> Result<ActivityList, CommandError> {
    let ctx = state.ctx.clone();
    blocking(move || app::activity(&ctx, args)).await
}

/// The app's preferences.
#[tauri::command]
pub async fn preferences_get(
    state: State<'_, AppState>,
    args: NoParams,
) -> Result<Preferences, CommandError> {
    let ctx = state.ctx.clone();
    blocking(move || app::preferences_get(&ctx, args)).await
}

/// Change the app's preferences.
#[tauri::command]
pub async fn preferences_set(
    state: State<'_, AppState>,
    args: PreferencesPatch,
) -> Result<Preferences, CommandError> {
    let ctx = state.ctx.clone();
    blocking(move || app::preferences_set(&ctx, args)).await
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
