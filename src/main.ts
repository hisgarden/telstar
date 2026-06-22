// Entry point: register the application shell, hydrate the last-loaded playlist
// from on-device storage (defaulting to its stored working set), re-scan it if
// stale, and seed a demo stream so the player has content before a channel is
// picked. <telstar-app> mounts from index.html.
import "./app";
import { setValidatedSource } from "./state/source";
import {
  setChannels,
  setSelectedLanguages,
  setPlayableOnly,
  setPlayedUrls,
  setHiddenUrls,
  setFavoriteLanguages,
  setLocale,
  setShowFlags,
  setLoaded,
  setSyncEnabled,
} from "./state/signals";
import {
  loadPlayableOnly,
  loadPlayedUrls,
  loadHiddenUrls,
  loadFavoriteLanguages,
  loadLocale,
  loadShowFlags,
  loadSyncEnabled,
} from "./state/view-pref";
import { applyLocaleDir } from "./i18n";
import { loadLastScan } from "./persistence";
import { WORLD_NEWS_PACK_KEY } from "./sources";
import { loadSelectedLanguages } from "./state/language-pref";
import { connectSync, hydrateFromSync } from "./sync-hydrate";

// CNA International — seeded so the player has live news content before a
// channel is picked. Replaced by loadLastScan / loadDefaultPack shortly after boot.
const DEMO_STREAM = "https://d2e1asnsl7br7b.cloudfront.net/7782e205e72f43aeb4a48ec97f66ebbe/index.m3u8";

setValidatedSource(DEMO_STREAM);

// Restore the viewer's persisted language selection + view prefs (on-device):
// language scope, playable-only toggle, the played hotbar, and hidden channels.
const initialLocale = loadLocale();
setLocale(initialLocale);
applyLocaleDir(initialLocale); // set <html dir> for RTL locales
setShowFlags(loadShowFlags());
setSelectedLanguages(loadSelectedLanguages());
setFavoriteLanguages(loadFavoriteLanguages());
setPlayableOnly(loadPlayableOnly());
setPlayedUrls(loadPlayedUrls());
setHiddenUrls(loadHiddenUrls());
setSyncEnabled(loadSyncEnabled());

// Mirror future curation-set changes to iCloud, then merge in whatever the
// user's other Apple devices have already synced (best-effort, gated on the
// per-device sync toggle). Sets union; newer scalars win.
connectSync();
void hydrateFromSync();

// The app always opens onto the curated, manually-validated World News pack —
// it's the trusted default source, and the channel dropdown selects it. A prior
// World News scan is restored from cache (no re-scan); any other last source
// (a language load, FIFA+) is not carried across launches — World News leads.
// Best-effort.
const loadDefaultPack = () =>
  document.querySelector("telstar-app")?.dispatchEvent(new CustomEvent("telstar-load-pack"));
loadLastScan()
  .then((scan) => {
    if (scan && scan.source === WORLD_NEWS_PACK_KEY && scan.channels.length > 0) {
      setChannels(scan.channels);
      setLoaded(scan.source, scan.idCountries);
    } else {
      loadDefaultPack();
    }
  })
  .catch(() => loadDefaultPack());
