// The whole game runs in the web view (src/). This shell only opens the window.
// `mobile_entry_point` keeps the door open for Android/iOS builds later.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running ROOTFALL");
}
