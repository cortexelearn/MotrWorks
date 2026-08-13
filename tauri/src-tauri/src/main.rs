// Prevents an extra console window alongside the app on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        // No invoke_handler is registered — the frontend is the whole app and
        // nothing native is exposed to it. The app's own file IO (design JSON
        // import/export, DXF, FEMM Lua) is browser-native and WebView2 handles
        // it: <input type=file> opens the OS picker, blob a[download] clicks
        // go through the WebView2 download flow.
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("MotrWorks — Motor Design Workbench")
                .resizable(true)
                .center()
                .inner_size(1560.0, 950.0)
                .min_inner_size(1100.0, 720.0)
                .build()?;

            #[cfg(debug_assertions)]
            window.open_devtools();
            let _ = &window;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("MotrWorks failed to start");
}
