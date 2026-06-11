/**
 * Wires the iCloud sync layer to the signal store at startup. Kept separate
 * from sync.ts so that module stays free of any dependency on state/signals
 * (avoiding an import cycle): sync.ts is pure transport + merge helpers, this
 * file is the glue that applies a pulled snapshot to the live state.
 *
 * Flow on launch (after local prefs are hydrated):
 *   pull iCloud → union sets with local / adopt newer scalars → apply to
 *   signals + local store → push the merged sets back so both devices converge.
 *
 * Outbound: a state sink mirrors played/hidden changes as they happen.
 * All of this no-ops unless sync is active (native app + syncEnabled).
 */
import {
  setStateSink,
  favoriteLanguages,
  setFavoriteLanguages,
  hiddenUrls,
  setHiddenUrls,
  playedUrls,
  setPlayedUrls,
  locale,
  setLocale,
  showFlags,
  setShowFlags,
  playableOnly,
  setPlayableOnly,
} from "./state/signals";
import {
  saveFavoriteLanguages,
  saveHiddenUrls,
  savePlayedUrls,
  saveLocale,
  saveShowFlags,
  savePlayableOnly,
  saveCaptionsOn,
  loadCaptionsOn,
} from "./state/view-pref";
import { applyLocaleDir } from "./i18n";
import {
  pull,
  mergeSet,
  mergeScalar,
  capList,
  pushFavorites,
  pushHidden,
  pushRecents,
  syncActive,
} from "./sync";

const PLAYED_CAP = 16;

/** Mirror curation-set changes to iCloud as they happen (gated inside push*). */
export function connectSync(): void {
  setStateSink((kind, urls) => {
    if (kind === "played") void pushRecents(urls);
    else void pushHidden(urls);
  });
}

/** Pull synced state, merge it into the live store, and push merged sets back. */
export async function hydrateFromSync(): Promise<void> {
  if (!syncActive()) return;
  const snap = await pull();

  // Sets: additive union (adds propagate, removals don't). Push the union back.
  if (snap.favorites) {
    const merged = mergeSet(favoriteLanguages.get(), snap.favorites);
    setFavoriteLanguages(merged);
    saveFavoriteLanguages(merged);
    void pushFavorites(merged);
  }
  if (snap.hidden) {
    const merged = mergeSet(hiddenUrls.get(), snap.hidden);
    setHiddenUrls(merged);
    saveHiddenUrls(merged);
    void pushHidden(merged);
  }
  if (snap.recents) {
    const merged = capList(mergeSet(playedUrls.get(), snap.recents), PLAYED_CAP);
    setPlayedUrls(merged);
    savePlayedUrls(merged);
    void pushRecents(merged);
  }

  // Scalars: last-writer-wins — adopt the value iCloud currently holds.
  const nextLocale = mergeScalar(locale.get(), snap.locale);
  if (nextLocale !== locale.get()) {
    setLocale(nextLocale);
    saveLocale(nextLocale);
    applyLocaleDir(nextLocale);
  }
  const nextFlags = mergeScalar(showFlags.get(), snap.showFlags);
  if (nextFlags !== showFlags.get()) {
    setShowFlags(nextFlags);
    saveShowFlags(nextFlags);
  }
  const nextPlayable = mergeScalar(playableOnly.get(), snap.playableOnly);
  if (nextPlayable !== playableOnly.get()) {
    setPlayableOnly(nextPlayable);
    savePlayableOnly(nextPlayable);
  }
  // Captions has no signal — the player reads loadCaptionsOn() on init. Persist
  // the synced value so it takes effect; no live toggle to update mid-session.
  const nextCaptions = mergeScalar(loadCaptionsOn(), snap.captionsOn);
  if (nextCaptions !== loadCaptionsOn()) saveCaptionsOn(nextCaptions);
}
