//! Background-audio session (iOS).
//!
//! WKWebView won't keep media audio alive once the app is backgrounded or the
//! screen locks unless the *app's* shared `AVAudioSession` is in the `.playback`
//! category and active — the default (`.soloAmbient`) is silenced by the lock
//! screen and the ringer switch and isn't background-eligible. Combined with the
//! `audio` entry in `UIBackgroundModes` (Info.plist) and native HLS playback,
//! this is what lets a tuned channel keep playing audio in the background, the
//! way a podcast app does.
//!
//! This is the audio sibling of `icloud.rs`: a few lines of `objc2`, scoped to
//! Apple, no new Tauri capability. On every non-iOS target it's a no-op so the
//! shared `setup` wiring stays platform-clean.

/// Put the process audio session into background-eligible playback mode.
///
/// Called once from the Tauri `setup` hook (after launch, on the main thread).
/// Best-effort: if the device refuses the category/activation we leave the
/// session as-is rather than failing app startup — playback still works in the
/// foreground, only background audio is forfeited.
#[cfg(target_os = "ios")]
pub fn configure_for_background_playback() {
    use objc2_avf_audio::{AVAudioSession, AVAudioSessionCategoryPlayback};

    // SAFETY: `sharedInstance` returns the process-wide audio singleton; setting
    // its category and activating it from the main thread at setup is the
    // documented use. The category constant is a framework global (`Option` in
    // case the symbol is unavailable on the running OS), so we guard it.
    unsafe {
        let session = AVAudioSession::sharedInstance();
        if let Some(category) = AVAudioSessionCategoryPlayback {
            let _ = session.setCategory_error(category);
        }
        let _ = session.setActive_error(true);
    }
}

/// No-op on platforms without `AVAudioSession` (macOS, Windows): desktop apps
/// already keep playing when backgrounded, so there's nothing to configure.
#[cfg(not(target_os = "ios"))]
pub fn configure_for_background_playback() {}
