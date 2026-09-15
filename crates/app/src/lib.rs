//! HedgeBuddy desktop app. Tauri commands call `hedgebuddy_core` directly; no
//! logic lives in this crate.

#[tauri::command]
fn data_dir() -> Result<String, String> {
    hedgebuddy_core::data_dir()
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![data_dir])
        .run(tauri::generate_context!())
        .expect("error while running HedgeBuddy");
}
