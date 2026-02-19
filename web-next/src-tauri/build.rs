use std::path::PathBuf;
use tauri_build::{try_build, Attributes};

fn main() {
  if let Ok(out_dir) = std::env::var("OUT_DIR") {
    let out_dir = PathBuf::from(out_dir);
    let release_dir = out_dir
      .parent()
      .and_then(|p| p.parent())
      .and_then(|p| p.parent());

    if let Some(release_dir) = release_dir {
      let _ = std::fs::remove_file(release_dir.join("WebView2Loader.dll"));
      let _ = std::fs::remove_file(release_dir.join("resources").join("WebView2Loader.dll"));
    }
  }

  if let Err(err) = try_build(Attributes::default()) {
    println!("cargo:warning=tauri-build skipped windows resources: {err:#}");
  }
}
