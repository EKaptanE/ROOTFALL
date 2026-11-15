// The whole game runs in the web view (src/). This shell opens the window and lets the
// menu's "ÇIKIŞ" item close the app.
// `mobile_entry_point` keeps the door open for Android/iOS builds later.

/// Called from the main menu (src/main.ts, quitApp).
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![quit])
        .run(tauri::generate_context!())
        .expect("error while running ROOTFALL");
}
