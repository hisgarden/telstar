//! Native iCloud key-value store bridge (`NSUbiquitousKeyValueStore`).
//!
//! Exposes a tiny string-keyed / string-valued KV surface so the frontend sync
//! layer can mirror personal state to the user's *private* iCloud. The frontend
//! owns the value shape (JSON strings); the native side is dumb storage and
//! treats keys and values as opaque. No third party is involved — this is the
//! user's own iCloud under their Apple ID.
//!
//! On non-Apple platforms (and any build without iCloud) every command is a
//! no-op so the sync layer degrades cleanly.

/// Read the string value for `key`, or `None` if unset.
#[tauri::command]
pub fn kv_get(key: String) -> Option<String> {
    imp::get(&key)
}

/// Write `value` under `key`.
#[tauri::command]
pub fn kv_set(key: String, value: String) {
    imp::set(&key, &value);
}

/// Remove any value under `key`.
#[tauri::command]
pub fn kv_remove(key: String) {
    imp::remove(&key);
}

/// List every key currently in the store.
#[tauri::command]
pub fn kv_keys() -> Vec<String> {
    imp::keys()
}

/// Push local changes and pull remote ones. Returns `false` when iCloud is
/// unavailable (e.g. not signed in). The frontend calls this on launch and on
/// returning to the foreground.
#[tauri::command]
pub fn kv_sync() -> bool {
    imp::sync()
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod imp {
    use objc2::rc::Retained;
    use objc2_foundation::{NSString, NSUbiquitousKeyValueStore};

    fn store() -> Retained<NSUbiquitousKeyValueStore> {
        NSUbiquitousKeyValueStore::defaultStore()
    }

    pub fn get(key: &str) -> Option<String> {
        store()
            .stringForKey(&NSString::from_str(key))
            .map(|s| s.to_string())
    }

    pub fn set(key: &str, value: &str) {
        store().setString_forKey(Some(&NSString::from_str(value)), &NSString::from_str(key));
    }

    pub fn remove(key: &str) {
        store().removeObjectForKey(&NSString::from_str(key));
    }

    pub fn keys() -> Vec<String> {
        store()
            .dictionaryRepresentation()
            .allKeys()
            .iter()
            .map(|k| k.to_string())
            .collect()
    }

    pub fn sync() -> bool {
        store().synchronize()
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
mod imp {
    pub fn get(_key: &str) -> Option<String> {
        None
    }
    pub fn set(_key: &str, _value: &str) {}
    pub fn remove(_key: &str) {}
    pub fn keys() -> Vec<String> {
        Vec::new()
    }
    pub fn sync() -> bool {
        false
    }
}
