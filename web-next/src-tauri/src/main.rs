#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WindowEvent};

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      if let Some(window) = app.get_window("main") {
        let _ = window.set_icon(tauri::Icon::Raw(
          include_bytes!("../icons/icon.png").to_vec(),
        ));
      }
      Ok(())
    })
    .on_window_event(|event| {
      if let WindowEvent::CloseRequested { api, .. } = event.event() {
        let _ = event.window().minimize();
        api.prevent_close();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
