//! Snapshot cache: store/retrieve a captured frame (a data-URL string) per
//! channel URL, on-device, in the app cache dir. No backend. The frame itself
//! is captured webview-side (see src/snapshot.ts); this is just the cache.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use tauri::Manager;

/// Cache file for a channel URL (snapshots/<hash>.txt under the app cache dir).
fn snapshot_path(app: &tauri::AppHandle, url: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("snapshots");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    Ok(dir.join(format!("{:x}.txt", hasher.finish())))
}

/// Cache a captured frame (data-URL) for a channel URL.
#[tauri::command]
pub fn save_snapshot(app: tauri::AppHandle, url: String, data_url: String) -> Result<(), String> {
    let path = snapshot_path(&app, &url)?;
    fs::write(path, data_url).map_err(|e| e.to_string())
}

/// Read the cached frame (data-URL) for a channel URL, or `None` if uncached.
#[tauri::command]
pub fn load_snapshot(app: tauri::AppHandle, url: String) -> Result<Option<String>, String> {
    let path = snapshot_path(&app, &url)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
