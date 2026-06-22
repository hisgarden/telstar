mod audio_session;
mod icloud;
mod metadata;
mod playlist;
mod scan;
mod snapshot;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Put iOS into background-eligible playback so a tuned channel keeps
            // playing audio when backgrounded / screen-locked (no-op elsewhere).
            audio_session::configure_for_background_playback();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            playlist::pick_playlist_file,
            playlist::fetch_playlist,
            playlist::save_store,
            playlist::load_store,
            scan::scan_channels,
            snapshot::save_snapshot,
            snapshot::load_snapshot,
            metadata::fetch_metadata,
            metadata::metadata_age,
            metadata::lookup_metadata,
            icloud::kv_get,
            icloud::kv_set,
            icloud::kv_remove,
            icloud::kv_keys,
            icloud::kv_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
