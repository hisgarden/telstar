/**
 * <telstar-app> — the application shell.
 *
 * A pure view over the signals store: it reads `currentSource` and
 * `playbackState` in render() via the SignalWatcher mixin. It also hosts the
 * playlist load affordance (open a local file or load a URL), parses the result
 * into the channel store, and renders the selectable channel list.
 */
import { LitElement, html, css } from "lit";
import {
  SignalWatcher,
  setChannels,
  scanProgress,
  setLoaded,
  loadedSource,
  loadedRegion,
  setSelectedLanguages,
  setCountryFilter,
  fillMode,
  setFillMode,
  syncEnabled,
  setSyncEnabled,
  channelQuery,
  setChannelQuery,
} from "./state/signals";
import { saveSelectedLanguages } from "./state/language-pref";
import { saveSyncEnabled } from "./state/view-pref";
import { hydrateFromSync } from "./sync-hydrate";
import { pickPlaylistFile, fetchPlaylistText, isTauriAvailable } from "./ingest";
import { parseM3U } from "./model/m3u";
import { languageFromSourceUrl, tagChannelsLanguage } from "./model/language";
import { countryOfId } from "./model/country";
import { t } from "./i18n";
import type { Channel } from "./model/channel";
import { loadCachedScan, saveCachedScan, cacheKey } from "./persistence";
import { pullVerdicts } from "./sync";
import { mergeVerdicts, decodeVerdicts } from "./model/verdicts";
import { runEnrich } from "./enrich-runner";
import { runScan } from "./scan-runner";
import { loadPackFrom, BASELINE_PACK_URL, FIFA_PACK_URL } from "./pack/baseline";
import { packToChannels } from "./pack/ingest";
import { WORLD_NEWS_PACK_KEY, FIFA_PACK_KEY } from "./sources";

/** The bundled manifest URL backing each curated pack key. */
const PACK_URL: Record<string, string> = {
  [WORLD_NEWS_PACK_KEY]: BASELINE_PACK_URL,
  [FIFA_PACK_KEY]: FIFA_PACK_URL,
};
import "./components/player";
import "./components/now-playing";
import "./components/hotbar";
import "./components/channel-list";
import "./components/source-picker";
import "./components/locale-picker";
import "./components/viewer-bar";

/** One browse source to load: its playlist URL(s) and an optional region slice. */
interface LoadSpec {
  urls: string[];
  idCountries?: string[];
}

export class TelstarApp extends SignalWatcher(LitElement) {
  static properties = {
    _settingsOpen: { state: true },
  };

  _settingsOpen = false;

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      color: #e8e8ea;
      font: 16px/1.5 system-ui, -apple-system, sans-serif;
    }
    main {
      max-width: 48rem;
      margin: 0 auto;
      /* Respect notch / home-indicator safe areas on iPad/iOS. */
      padding: max(1.25rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) 0
        max(1.5rem, env(safe-area-inset-left));
      height: 100dvh;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }
    /* Touch: finger-sized load controls. */
    @media (pointer: coarse) {
      .load button,
      .load input {
        padding: 0.7rem 1rem;
        font-size: 1rem;
      }
    }
    /* Header + load region stay put; the panes fill the rest. */
    .header,
    .load,
    .controls,
    .status,
    .msg,
    .hint,
    .scan,
    .progress {
      flex: none;
    }
    /* Two regions: viewer (player) + browse (controls + list). */
    .panes {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .viewer {
      flex: none;
      position: relative;
    }
    .browse {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    /* Search sits between the Recent strip and the channel list, keeping the
       scrollable list low in the thumb-reachable area on touch devices. */
    .browse .search {
      flex: none;
      margin: 0 0 0.4rem;
      padding: 0.35rem 0.6rem;
      border: 1px solid #2a2a30;
      border-radius: 0.4rem;
      background: #0d0d10;
      color: #e8e8ea;
      font: inherit;
    }
    @media (pointer: coarse) {
      .browse .search {
        padding: 0.6rem 0.7rem;
        font-size: 1rem;
      }
    }
    /* Fill mode: maximize the player within the app; hide the browse chrome and
       overlay a Recent strip + exit button so you can still switch channels. */
    .filling .header,
    .filling .controls,
    .filling .status,
    .filling .msg,
    .filling .scan,
    .filling .progress,
    .filling .viewer telstar-viewer-bar,
    .filling .viewer telstar-now-playing,
    .filling .browse {
      display: none;
    }
    .filling .panes {
      gap: 0;
    }
    .filling .viewer {
      flex: 1;
    }
    .fill-exit {
      position: absolute;
      top: 0.6rem;
      right: 0.6rem;
      z-index: 5;
      width: 2.2rem;
      height: 2.2rem;
      border: none;
      border-radius: 0.4rem;
      background: rgba(13, 13, 16, 0.65);
      color: #e8e8ea;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
    }
    .fill-exit:hover {
      background: rgba(27, 42, 58, 0.9);
    }
    /* Landscape (wide): side-by-side — player left, browse/list right,
       using the full width and keeping the list scrollable. */
    @media (orientation: landscape) and (min-width: 48rem) {
      /* Landscape: the player is a full-height hero on the LEFT (its size is no
         longer capped by a header row), with the header, the language control,
         and the Recent+list stacked in a right sidebar. .panes
         dissolves (display:contents) so .viewer/.browse place onto the grid.
         Refresh + clock ride at the top of the viewer (telstar-viewer-bar).
         Portrait never matches this rule. */
      main {
        max-width: none;
        display: grid;
        grid-template-columns: minmax(0, 1fr) clamp(13rem, 26%, 22rem);
        grid-template-rows: auto auto 1fr;
        grid-template-areas:
          "viewer header"
          "viewer controls"
          "viewer browse";
        column-gap: 0.75rem;
        row-gap: 0.4rem;
      }
      /* Compact wordmark; the header sits in the narrow sidebar, so let it wrap. */
      .header {
        grid-area: header;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.4rem 0.5rem;
      }
      .header h1 {
        font-size: 1.2rem;
      }
      .header h1 .logo {
        width: 1.4rem;
        height: 1.4rem;
      }
      .tagline {
        display: none;
      }
      /* Transient status is dropped in the landscape sidebar layout. */
      .status {
        display: none;
      }
      /* Dropdowns stack in the narrow sidebar so each gets the full width. */
      .controls {
        grid-area: controls;
        flex-direction: column;
        gap: 0.4rem;
        margin: 0;
      }
      .panes {
        display: contents;
      }
      /* Viewer spans the full height on the left; the player fills it at 16:9
         (1080p perspective), top-aligned, width derived from the height (see
         player.ts). The now-playing strip stays visible directly under the clock
         so the live channel (logo/name/funding) is shown, not just implied by
         the RECENT row and the highlighted list row. */
      .viewer {
        grid-area: viewer;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
      }
      .viewer telstar-player {
        flex: 1 1 auto;
        min-height: 0;
      }
      .browse {
        grid-area: browse;
        min-width: 0;
        max-width: none;
        margin: 0;
      }
      /* Maximize: collapse to one column so the player fills the full width. */
      main.filling {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr;
        grid-template-areas: "viewer";
        row-gap: 0;
      }
    }
    h1 {
      margin: 0;
      font-size: 2.25rem;
      letter-spacing: 0.02em;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    h1 .logo {
      width: 2rem;
      height: 2rem;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }
    telstar-locale-picker {
      flex: none;
    }
    .header-actions {
      flex: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .gear {
      width: 2.2rem;
      height: 2.2rem;
      flex: none;
      border: 1px solid #2a2a30;
      border-radius: 0.4rem;
      background: #16161a;
      color: #c7c7cd;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
    }
    .gear:hover {
      border-color: #3a6ea5;
      color: #cfe5ff;
    }
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: rgba(0, 0, 0, 0.6);
    }
    .dialog {
      width: min(34rem, 100%);
      max-height: 85vh;
      overflow-y: auto;
      padding: 1.25rem 1.5rem 1.5rem;
      border: 1px solid #2a2a30;
      border-radius: 0.6rem;
      background: #16161a;
    }
    .dialog-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .dialog-head h2 {
      margin: 0;
      font-size: 1.3rem;
    }
    .setting h3 {
      margin: 0 0 0.25rem;
      font-size: 1rem;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .toggle input {
      width: 1rem;
      height: 1rem;
      cursor: pointer;
    }
    .tagline {
      margin: 0;
      color: #8a8a92;
      font-size: 0.85rem;
    }
    .load {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    .load input {
      flex: 1;
      min-width: 12rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid #2a2a30;
      border-radius: 0.4rem;
      background: #0d0d10;
      color: #e8e8ea;
      font: inherit;
    }
    .load button {
      padding: 0.5rem 1rem;
      border: 1px solid #3a6ea5;
      border-radius: 0.4rem;
      background: #1b2a3a;
      color: #cfe5ff;
      font: inherit;
      cursor: pointer;
    }
    .load button:hover {
      background: #244055;
    }
    .msg {
      margin: 0 0 1rem;
      color: #d98a8a;
      min-height: 1.2em;
    }
    .hint {
      margin: 0 0 1rem;
      color: #8a8a92;
      font-size: 0.875rem;
    }
    .hint code {
      color: #9ecbff;
    }
    .scan {
      margin: 0 0 0.4rem;
      color: #9ecbff;
      font-size: 0.875rem;
    }
    .progress {
      height: 4px;
      border-radius: 2px;
      background: #1b1b21;
      overflow: hidden;
      margin: 0 0 1rem;
    }
    .progress > i {
      display: block;
      height: 100%;
      background: #3a6ea5;
      transition: width 0.2s ease;
    }
    .load button[disabled],
    .load input[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    telstar-viewer-bar {
      display: block;
      margin-bottom: 0.5rem;
    }
    telstar-player {
      display: block;
      margin-bottom: 0.75rem;
    }
    telstar-now-playing {
      display: block;
      margin-bottom: 1rem;
    }
    telstar-hotbar {
      display: block;
      flex: none;
      margin-bottom: 0.75rem;
    }
    /* The two language dropdowns sit in a row; each takes half the width. */
    .controls {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      margin-bottom: 1rem;
    }
    .controls > * {
      flex: 1 1 0;
      min-width: 0;
    }
    telstar-channel-list {
      flex: 1 1 auto;
      min-height: 6rem;
      padding-bottom: 1rem;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, monospace;
      color: #9ecbff;
    }

    /* =======================================================================
       Compact width (iPhone portrait, <= 30rem) — iOS HIG adaptation.

       Every rule here is gated on the compact breakpoint, which is a proxy for
       UIKit's compact-width size class (all iPhones in portrait are 320–430px;
       iPad portrait is 768px and never matches). iPad/macOS — wider and/or
       fine-pointer — never see these rules, so their layout is untouched.

       Three moves: (1) edge-to-edge content inside safe areas with a compact
       header, (2) the frequent browse controls lifted into a bottom control bar
       within thumb reach, (3) Settings presented as a bottom sheet.
       ======================================================================= */
    @media (max-width: 30rem) {
      main {
        max-width: none;
        /* HIG layout margins ~16pt; the top honors the status bar / Dynamic
           Island. Bottom stays 0 — the control bar owns the home-indicator
           inset so it sits flush with the screen edge. */
        padding: max(0.5rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 0
          max(1rem, env(safe-area-inset-left));
      }

      /* Compact header: shrink the wordmark, drop the tagline, center the row. */
      .header {
        align-items: center;
        gap: 0.5rem;
      }
      h1 {
        font-size: 1.4rem;
      }
      h1 .logo {
        width: 1.5rem;
        height: 1.5rem;
      }
      .tagline {
        display: none;
      }

      /* 44pt minimum touch targets. */
      .gear,
      .fill-exit {
        width: 2.75rem;
        height: 2.75rem;
      }

      /* --- Portrait stack order (operator layout) ----------------------------
         Flatten .panes + .browse (display:contents) so every region lives on
         main's flex column, then order it: the RECENT quick-switch rides at the
         TOP of the viewer (inside it, above the player + clock), the channel
         dropdown sits BELOW the viewer, then search, then the scrolling channel
         list claims the remaining height (held above the home indicator by the
         safe-area inset). */
      .panes,
      .browse {
        display: contents;
      }
      .header {
        order: 0;
      }
      .status {
        order: 1;
      }
      .viewer {
        order: 3;
      }
      .controls {
        order: 4;
        margin: 0.5rem 0 0;
      }
      .browse .search {
        order: 5;
        margin-top: 0.6rem;
      }
      telstar-channel-list {
        order: 6;
        flex: 1 1 auto;
        min-height: 6rem;
        margin-top: 0.6rem;
        padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
      }

      /* --- Settings: iOS bottom sheet (HIG favors sheets over centered modals).
         Same markup as the regular-width dialog; only the framing changes. */
      .overlay {
        align-items: flex-end;
        padding: 0;
      }
      .dialog {
        width: 100%;
        max-width: none;
        max-height: 90vh;
        border-radius: 1rem 1rem 0 0;
        border-bottom: none;
        border-left: none;
        border-right: none;
        padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
        animation: telstar-sheet-up 0.22s ease-out;
      }
      /* Grabber handle. */
      .dialog::before {
        content: "";
        display: block;
        width: 2.25rem;
        height: 0.3rem;
        margin: -0.25rem auto 0.85rem;
        border-radius: 999px;
        background: #3a3a42;
      }
    }
    @keyframes telstar-sheet-up {
      from {
        transform: translateY(100%);
      }
      to {
        transform: translateY(0);
      }
    }
  `;

  #message = "";
  #url = "";
  /** The sources behind the current load, so Refresh re-applies them exactly. */
  #loadedSpecs: LoadSpec[] | null = null;

  async #loadFromFile() {
    try {
      const picked = await pickPlaylistFile();
      if (!picked) return; // cancelled
      const { channels, rejected } = parseM3U(picked.text);
      const tagged = tagChannelsLanguage(channels, languageFromSourceUrl(picked.path));
      this.#ingestChannels(tagged, picked.path, null, rejected);
    } catch (err) {
      this.#fail(err);
    }
  }

  async #loadFromUrl() {
    await this.#loadUrls([this.#url.trim()]);
  }

  /**
   * Load one or more playlist URLs — shared by the URL box and the source
   * picker. Multiple URLs are fetched, each tagged with its own language, then
   * merged + de-duplicated (so "Chinese" = Mandarin + Cantonese + Chinese, with
   * the chips still distinguishing them). `idCountries` slices by region
   * (English → US/UK/AP).
   *
   * Cache-first: a previously scanned source loads from cache instantly; `force`
   * (Refresh) bypasses the cache and re-fetches + re-scans.
   */
  /** Load a single source (one or more URLs, one optional region slice). */
  async #loadUrls(urls: string[], idCountries: string[] | null = null, force = false) {
    await this.#loadSources([{ urls, idCountries: idCountries ?? undefined }], force);
  }

  /**
   * Load one or more browse sources at once and merge them. Each source keeps
   * its OWN region slice (so English (US) stays US even when checked alongside
   * an unsliced language like Chinese), then all results merge + de-dup by
   * stream URL. The combined set caches under a key derived from every URL and
   * region, and the specs are remembered so Refresh re-applies them exactly.
   */
  async #loadSources(specs: LoadSpec[], force = false) {
    const valid = specs
      .map((s) => ({
        urls: s.urls.filter((u) => u.trim().length > 0),
        region: s.idCountries && s.idCountries.length > 0 ? s.idCountries : null,
      }))
      .filter((s) => s.urls.length > 0);
    if (valid.length === 0) return;

    const source = valid.flatMap((s) => s.urls).join("|");
    const regionAll = valid.flatMap((s) => s.region ?? []);
    const region = regionAll.length > 0 ? regionAll : null;
    const key = cacheKey(source, region);
    this.#loadedSpecs = specs;

    if (!force) {
      const cached = await loadCachedScan(key).catch(() => null);
      if (cached && cached.channels.length > 0) {
        setChannels(cached.channels);
        setLoaded(source, region);
        void saveCachedScan(key, cached).catch(() => {}); // bump most-recent
        this.#message = "";
        this.requestUpdate();
        return;
      }
    }

    try {
      // Fetch each source independently so its region slice applies only to it.
      const perSource = await Promise.all(
        valid.map(async (s) => {
          const lists = await Promise.all(
            s.urls.map(async (u) => {
              const { channels, rejected } = parseM3U(await fetchPlaylistText(u));
              return { channels: tagChannelsLanguage(channels, languageFromSourceUrl(u)), rejected };
            }),
          );
          let merged = lists.flatMap((l) => l.channels);
          if (s.region) {
            merged = merged.filter((c) => {
              const cc = countryOfId(c.id);
              return cc != null && s.region!.includes(cc);
            });
          }
          return { channels: merged, rejected: lists.reduce((sum, l) => sum + l.rejected, 0) };
        }),
      );
      const rejected = perSource.reduce((sum, p) => sum + p.rejected, 0);
      // De-dup by stream URL (a channel may appear across sources).
      const seen = new Set<string>();
      const channels = perSource
        .flatMap((p) => p.channels)
        .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
      // Pre-fill availability from any iCloud-synced verdicts — a working-first
      // hint on a fresh device. Local scan re-validates and overrides (KTD-3).
      const hinted = await this.#applyVerdictHints(channels, key);
      this.#ingestChannels(hinted, source, region, rejected);
    } catch (err) {
      this.#fail(err);
    }
  }

  /**
   * Load a curated pack (World News or FIFA+; baseline-only in v1, the
   * remote-manifest overlay is U4, deferred). Resolves the bundled manifest for
   * the given key, converts to channels, and routes through the same ingest →
   * enrich → scan path as any source. Enrichment fills-only, so the pack's
   * category tags survive. Defaults to World News (the first-run / startup load).
   */
  async #loadPack(key: string = WORLD_NEWS_PACK_KEY) {
    try {
      const pack = await loadPackFrom(PACK_URL[key] ?? BASELINE_PACK_URL);
      const channels = packToChannels(pack);
      if (channels.length === 0) {
        this.#message = t("noPlayable");
        this.requestUpdate();
        return;
      }
      this.#loadedSpecs = null;
      // Clear any stale language/country filter from a prior load — otherwise a
      // leftover country filter (e.g. "us") would hide every pack channel
      // (jp/de/fr/qa) and the grid would render empty despite a successful load.
      setSelectedLanguages([]);
      saveSelectedLanguages([]);
      setCountryFilter(null);
      this.#ingestChannels(channels, key, null);
    } catch (err) {
      this.#fail(err);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    // The curated-source picker (in this shadow tree) requests a load via a
    // bubbling, composed event; the language bar requests a re-scan via another.
    this.addEventListener("telstar-load-sources", this.#onLoadSources as EventListener);
    this.addEventListener("telstar-load-pack", this.#onLoadPack as EventListener);
    this.addEventListener("telstar-refresh", this.#onRefresh as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("telstar-load-sources", this.#onLoadSources as EventListener);
    this.removeEventListener("telstar-load-pack", this.#onLoadPack as EventListener);
    this.removeEventListener("telstar-refresh", this.#onRefresh as EventListener);
  }

  #onLoadSources = (e: CustomEvent<{ sources: LoadSpec[] }>) => {
    void this.#loadSources(e.detail.sources);
  };

  #onLoadPack = (e: CustomEvent<{ key?: string } | undefined>) => {
    void this.#loadPack(e.detail?.key ?? WORLD_NEWS_PACK_KEY);
  };

  /** Re-scan the current load, bypassing the cache; re-applies the exact specs. */
  #onRefresh = () => {
    const cur = loadedSource.get();
    if (cur && cur in PACK_URL) {
      void this.#loadPack(cur);
      return;
    }
    if (this.#loadedSpecs) {
      void this.#loadSources(this.#loadedSpecs, true);
      return;
    }
    const src = loadedSource.get();
    if (src) void this.#loadUrls(src.split("|"), loadedRegion.get(), true);
  };

  /** Fill `unknown` channels with any iCloud-synced verdict hints (best-effort). */
  async #applyVerdictHints(channels: Channel[], key: string): Promise<Channel[]> {
    try {
      const synced = await pullVerdicts(key);
      return synced ? mergeVerdicts(channels, decodeVerdicts(synced)) : channels;
    } catch {
      return channels;
    }
  }

  /** Set the loaded channels, persist intent, and kick off enrich + scan. */
  #ingestChannels(channels: Channel[], source: string, region: string[] | null, _rejected = 0) {
    setChannels(channels);
    setLoaded(source, region);
    // Success is shown by the channel list filling in, not a status line —
    // only surface a message when nothing playable loaded.
    this.#message = channels.length === 0 ? t("noPlayable") : "";
    this.requestUpdate();
    // Enrich (genre + fill missing language) then channel-scan / auto-tune;
    // both best-effort and native-only. The scan persists under the source key.
    if (channels.length > 0) {
      void runEnrich(channels)
        .then((enriched) => runScan(enriched, source, region))
        .catch(() => {});
    }
  }

  #fail(err: unknown) {
    this.#message = t("loadError", { error: err instanceof Error ? err.message : String(err) });
    this.requestUpdate();
  }

  render() {
    const tauri = isTauriAvailable();
    const fill = fillMode.get();
    return html`
      <main class=${fill ? "filling" : ""}>
        <div class="header">
          <h1><img class="logo" src="/telstar-logo.svg" alt="" />Telstar</h1>
          <div class="header-actions">
            <telstar-locale-picker></telstar-locale-picker>
            <button
              class="gear"
              title=${t("settings")}
              aria-label=${t("settings")}
              @click=${() => (this._settingsOpen = true)}
            >
              ⚙
            </button>
          </div>
        </div>
        ${tauri
          ? this.#message
            ? html`<div class="status"><p class="msg" aria-live="polite">${this.#message}</p></div>`
            : ""
          : html`<div class="status"><p class="hint">${t("browserHint", { cmd: "bun run tauri dev" })}</p></div>`}
        ${scanProgress.get() > 0 && scanProgress.get() < 1
          ? html`<div class="status">
              <div class="progress">
                <i style=${`width:${Math.round(scanProgress.get() * 100)}%`}></i>
              </div>
            </div>`
          : ""}
        <!-- Viewer (Recent + player) + Browse (search + list). The channel
             dropdown sits below the viewer; Recent rides at the top of it. -->
        <div class="panes">
          <section class="viewer">
            <telstar-hotbar></telstar-hotbar>
            <telstar-viewer-bar></telstar-viewer-bar>
            <telstar-now-playing></telstar-now-playing>
            <telstar-player></telstar-player>
            ${fill
              ? html`
                  <button
                    class="fill-exit"
                    title=${t("exitMaximize")}
                    aria-label=${t("exitMaximize")}
                    @click=${() => setFillMode(false)}
                  >
                    ⤡
                  </button>
                `
              : ""}
          </section>
          <div class="controls">
            <telstar-source-picker></telstar-source-picker>
          </div>
          <section class="browse">
            <input
              class="search"
              type="search"
              placeholder=${t("search")}
              .value=${channelQuery.get()}
              @input=${(e: Event) => setChannelQuery((e.target as HTMLInputElement).value)}
            />
            <telstar-channel-list></telstar-channel-list>
          </section>
        </div>
        ${this._settingsOpen ? this.#renderSettings(tauri) : ""}
      </main>
    `;
  }

  /** Settings overlay — advanced controls regular users don't need up front. */
  #renderSettings(tauri: boolean) {
    return html`
      <div class="overlay" @click=${() => (this._settingsOpen = false)}>
        <div class="dialog" role="dialog" aria-label=${t("settings")} @click=${(e: Event) => e.stopPropagation()}>
          <div class="dialog-head">
            <h2>${t("settings")}</h2>
            <button class="gear" aria-label=${t("close")} @click=${() => (this._settingsOpen = false)}>
              ✕
            </button>
          </div>
          <section class="setting">
            <h3>${t("loadCustom")}</h3>
            <p class="hint">${t("loadCustomHint")}</p>
            <div class="load">
              <button
                ?disabled=${!tauri}
                @click=${() => {
                  this.#loadFromFile();
                  this._settingsOpen = false;
                }}
              >
                ${t("openFile")}
              </button>
              <input
                type="text"
                placeholder=${t("urlPlaceholder")}
                ?disabled=${!tauri}
                .value=${this.#url}
                @input=${(e: Event) => {
                  this.#url = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    this.#loadFromUrl();
                    this._settingsOpen = false;
                  }
                }}
              />
              <button
                ?disabled=${!tauri}
                @click=${() => {
                  this.#loadFromUrl();
                  this._settingsOpen = false;
                }}
              >
                ${t("loadUrl")}
              </button>
            </div>
            ${tauri ? "" : html`<p class="hint">${t("browserHint", { cmd: "bun run tauri dev" })}</p>`}
          </section>
          <section class="setting">
            <h3>${t("iCloudSync")}</h3>
            <label class="toggle">
              <input
                type="checkbox"
                ?disabled=${!tauri}
                .checked=${syncEnabled.get()}
                @change=${(e: Event) => {
                  const on = (e.target as HTMLInputElement).checked;
                  setSyncEnabled(on);
                  saveSyncEnabled(on);
                  if (on) void hydrateFromSync();
                }}
              />
              <span>${t("iCloudSyncLabel")}</span>
            </label>
            <p class="hint">${t("iCloudSyncHint")}</p>
          </section>
        </div>
      </div>
    `;
  }
}

customElements.define("telstar-app", TelstarApp);
