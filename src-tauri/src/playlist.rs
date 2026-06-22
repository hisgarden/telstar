//! Native ingestion: pick + read a local playlist file, or fetch one from an
//! http(s) URL (bypassing browser CORS). All I/O lives in the native core; the
//! frontend never reaches the filesystem or network directly.
//!
//! Zero-trust: the fetch path refuses any non-http(s) scheme before making a
//! request, mirroring the frontend's scheme-allowlist validator (defense in
//! depth). Playlist bytes are returned verbatim as untrusted text for the
//! frontend parser to handle.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

/// A playlist file the user picked: its path and raw text.
#[derive(Serialize)]
pub struct PlaylistFile {
    pub path: String,
    pub text: String,
}

/// Open the native file picker for `.m3u`/`.m3u8`, read the chosen file, and
/// return its path + text. Returns `None` if the user cancels.
///
/// Async so it runs off the main thread — `blocking_pick_file()` must not be
/// called on the main thread (it blocks the UI run loop and beachballs).
#[tauri::command]
pub async fn pick_playlist_file(app: tauri::AppHandle) -> Result<Option<PlaylistFile>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Playlists", &["m3u", "m3u8"])
        .blocking_pick_file();

    match picked {
        Some(file_path) => {
            let path = file_path.into_path().map_err(|e| e.to_string())?;
            let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            Ok(Some(PlaylistFile {
                path: path.to_string_lossy().into_owned(),
                text,
            }))
        }
        None => Ok(None),
    }
}

/// Fetch playlist text from an http(s) URL. Refuses any other scheme.
#[tauri::command]
pub fn fetch_playlist(url: String) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(format!("refused: only http(s) playlist URLs are allowed: {url}"));
    }
    let body = ureq::get(&url)
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())?;
    Ok(body)
}

/// Path to the persisted playlist store (created on demand).
fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("playlist.json"))
}

/// Persist the playlist store JSON to the app data directory.
#[tauri::command]
pub fn save_store(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let path = store_path(&app)?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// Read the persisted playlist store JSON; `None` if it doesn't exist yet.
#[tauri::command]
pub fn load_store(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = store_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
