//! iptv-org metadata cache: fetch the channels + feeds databases once, cache
//! them on-device (app cache dir) with a timestamp, and look up only the
//! records for the channels actually loaded — so enrichment never ships the
//! full ~17 MB over IPC. The join/index logic lives in the frontend (TS); this
//! returns the matched raw records for it to consume.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CHANNELS_URL: &str = "https://iptv-org.github.io/api/channels.json";
const FEEDS_URL: &str = "https://iptv-org.github.io/api/feeds.json";

fn meta_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("metadata");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Fetch + cache channels.json and feeds.json; returns the cache timestamp (ms).
#[tauri::command]
pub fn fetch_metadata(app: tauri::AppHandle) -> Result<u64, String> {
    let dir = meta_dir(&app)?;
    for (url, name) in [(CHANNELS_URL, "channels.json"), (FEEDS_URL, "feeds.json")] {
        let body = ureq::get(url)
            .call()
            .map_err(|e| e.to_string())?
            .into_string()
            .map_err(|e| e.to_string())?;
        fs::write(dir.join(name), body).map_err(|e| e.to_string())?;
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    fs::write(dir.join("timestamp"), now.to_string()).map_err(|e| e.to_string())?;
    Ok(now)
}

/// The cache timestamp (ms), or None if the metadata hasn't been fetched.
#[tauri::command]
pub fn metadata_age(app: tauri::AppHandle) -> Result<Option<u64>, String> {
    let path = meta_dir(&app)?.join("timestamp");
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text.trim().parse::<u64>().ok()),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
pub struct MetadataLookup {
    channels: Vec<Value>,
    feeds: Vec<Value>,
}

fn read_records(dir: &PathBuf, name: &str) -> Result<Vec<Value>, String> {
    match fs::read_to_string(dir.join(name)) {
        Ok(text) => serde_json::from_str::<Vec<Value>>(&text).map_err(|e| e.to_string()),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.to_string()),
    }
}

/// Return only the cached channel/feed records whose id (channels) or channel
/// (feeds) is in `ids` — a small payload for the frontend to index + join.
#[tauri::command]
pub fn lookup_metadata(app: tauri::AppHandle, ids: Vec<String>) -> Result<MetadataLookup, String> {
    let dir = meta_dir(&app)?;
    let want: HashSet<String> = ids.into_iter().collect();
    let channels = read_records(&dir, "channels.json")?
        .into_iter()
        .filter(|c| {
            c.get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| want.contains(id))
        })
        .collect();
    let feeds = read_records(&dir, "feeds.json")?
        .into_iter()
        .filter(|f| {
            f.get("channel")
                .and_then(Value::as_str)
                .is_some_and(|ch| want.contains(ch))
        })
        .collect();
    Ok(MetadataLookup { channels, feeds })
}
