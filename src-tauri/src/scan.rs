//! Channel-scan: probe stream reachability FROM THE USER'S MACHINE so "live"
//! means "available to you, here" (R1). Bounded concurrency keeps it polite;
//! only http(s) URLs are probed (zero-trust). Reachability = a successful
//! manifest fetch, not a playback guarantee.
//!
//! Concurrency is bounded by processing URLs in fixed-size batches on Tauri's
//! existing async runtime (no new async/HTTP crate): each batch runs its
//! checks via spawn_blocking, and the next batch starts when the current one
//! drains.

use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::Emitter;

const CONCURRENCY: usize = 16;
const CONNECT_TIMEOUT_SECS: u64 = 3;
const READ_TIMEOUT_SECS: u64 = 3;
const SLOW_MS: u128 = 2500;

#[derive(Serialize, Clone)]
pub struct ScanResult {
    pub url: String,
    /// "live" | "slow" | "dead"
    pub availability: String,
}

/// Emitted after each batch so the UI can show progress and reorder live.
#[derive(Serialize, Clone)]
struct ScanProgress {
    done: usize,
    total: usize,
    results: Vec<ScanResult>,
}

/// Probe one URL. Non-http(s) and any request error classify as dead.
fn probe_one(url: String) -> ScanResult {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return ScanResult { url, availability: "dead".into() };
    }
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .timeout_read(Duration::from_secs(READ_TIMEOUT_SECS))
        .build();
    let started = Instant::now();
    let availability = match agent.get(&url).call() {
        Ok(_) => {
            if started.elapsed().as_millis() > SLOW_MS {
                "slow"
            } else {
                "live"
            }
        }
        Err(_) => "dead",
    };
    ScanResult { url, availability: availability.into() }
}

/// Probe channel URLs in bounded batches, emitting a `scan-progress` event
/// after each batch (so the UI shows progress and reorders live). Returns the
/// full result set when done.
#[tauri::command]
pub async fn scan_channels(
    app: tauri::AppHandle,
    urls: Vec<String>,
) -> Result<Vec<ScanResult>, String> {
    let total = urls.len();
    let mut all = Vec::with_capacity(total);
    for chunk in urls.chunks(CONCURRENCY) {
        let handles: Vec<_> = chunk
            .iter()
            .cloned()
            .map(|url| tauri::async_runtime::spawn_blocking(move || probe_one(url)))
            .collect();
        let mut batch = Vec::with_capacity(handles.len());
        for handle in handles {
            batch.push(handle.await.map_err(|e| e.to_string())?);
        }
        all.extend(batch.iter().cloned());
        let _ = app.emit(
            "scan-progress",
            ScanProgress { done: all.len(), total, results: batch },
        );
    }
    Ok(all)
}
