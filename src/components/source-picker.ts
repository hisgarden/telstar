/**
 * <telstar-source-picker> — the single "browse by language" control (R10/R12):
 * one dropdown that both loads and filters, plus a Refresh button and (when the
 * loaded set spans countries) a region filter.
 *
 * Pick a language (named in the active UI locale so the user reads names they
 * understand): if it isn't loaded yet it is fetched; if it's already loaded the
 * list narrows to it. "All languages" (last) clears the filter to show every
 * loaded channel. English is one entry; region is narrowed with the country
 * dropdown. Native-only; disabled in the browser preview.
 */
import { LitElement, html, css } from "lit";
import {
  BROWSE_SOURCES_PRIMARY,
  WORLD_NEWS_PACK_KEY,
  languagePickAction,
  type BrowseSource,
} from "../sources";
import { isTauriAvailable } from "../ingest";
import {
  SignalWatcher,
  channels,
  locale,
  loadedSource,
  selectedLanguages,
  setSelectedLanguages,
  countryFilter,
  setCountryFilter,
  selectedCategories,
  setSelectedCategories,
} from "../state/signals";
import { availableCountries, saveSelectedLanguages } from "../state/language-pref";
import { saveSelectedCategories } from "../state/genre-pref";
import { localizedLanguageName } from "../model/language";
import { t } from "../i18n";

/** Chinese variants a single "Chinese" source/filter covers. */
const CHINESE_RE = /\b(chinese|cantonese|mandarin|hokkien|teochew|hakka|min nan|wu)\b/i;

/** Dropdown value + category for the featured FIFA+ collection (tagged sports). */
const FIFA_VALUE = "fifa-plus";
const FIFA_CATEGORY = "sports";

/** A small TV glyph — marks this as the channel selector (vs. the globe = UI language). */
const TV = html`
  <svg
    viewBox="0 0 24 24"
    width="100%"
    height="100%"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="2" y="7" width="20" height="13" rx="2" />
    <path d="M8 3l4 4 4-4" />
  </svg>
`;

export class TelstarSourcePicker extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
    }
    .field {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .tv {
      flex: none;
      width: 1.2rem;
      height: 1.2rem;
      color: #8a8a92;
    }
    .label {
      flex: none;
      color: #8a8a92;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    select {
      flex: 1 1 auto;
      min-width: 7rem;
      padding: 0.4rem 0.5rem;
      border: 1px solid #2a2a30;
      border-radius: 0.4rem;
      background: #16161a;
      color: #cfe5ff;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    select.country {
      flex: 0 1 auto;
      color: #e8e8ea;
      background: #0d0d10;
    }
    select[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .refresh {
      flex: none;
      padding: 0.4rem 0.55rem;
      border: 1px solid #2a2a30;
      border-radius: 0.4rem;
      background: #16161a;
      color: #c7c7cd;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .refresh:hover {
      border-color: #3a6ea5;
      color: #cfe5ff;
    }
    @media (pointer: coarse) {
      select {
        padding: 0.6rem 0.5rem;
        font-size: 1rem;
      }
      .refresh {
        padding: 0.6rem 0.7rem;
        font-size: 1rem;
      }
    }
  `;

  /** The channel-languages a browse source covers within the loaded set. */
  #loadedMembers(source: BrowseSource, present: Set<string>): string[] {
    if (CHINESE_RE.test(source.name)) return [...present].filter((l) => CHINESE_RE.test(l));
    return present.has(source.name) ? [source.name] : [];
  }

  /** Pick a language: filter to it if loaded, else load it; "all" clears the filter. */
  #onPick(e: Event) {
    const el = e.target as HTMLSelectElement;
    const value = el.value;
    if (value === WORLD_NEWS_PACK_KEY) {
      // The curated World News pack loads via its own path (bundled baseline).
      // Clear any FIFA+ (sports) scope so the full pack shows.
      setSelectedCategories([]);
      saveSelectedCategories([]);
      this.dispatchEvent(new CustomEvent("telstar-load-pack", { bubbles: true, composed: true }));
      return;
    }
    if (value === FIFA_VALUE) {
      // The featured FIFA+ collection lives inside the World News pack (its feeds
      // are tagged `sports`). Ensure the pack is loaded, then scope to sports —
      // same destination as the old standalone Trending link, now in the dropdown.
      if (loadedSource.get() !== WORLD_NEWS_PACK_KEY) {
        this.dispatchEvent(new CustomEvent("telstar-load-pack", { bubbles: true, composed: true }));
      }
      setSelectedCategories([FIFA_CATEGORY]);
      saveSelectedCategories([FIFA_CATEGORY]);
      return;
    }
    // Any non-FIFA selection leaves the featured collection — drop the sports scope.
    setSelectedCategories([]);
    saveSelectedCategories([]);
    if (value === "all") {
      setSelectedLanguages([]);
      saveSelectedLanguages([]);
      setCountryFilter(null);
      return;
    }
    const source = BROWSE_SOURCES_PRIMARY[Number(value)];
    if (!source) return;
    const present = new Set(channels.get().map((c) => c.language ?? ""));
    const members = this.#loadedMembers(source, present);
    if (languagePickAction(loadedSource.get(), members) === "narrow") {
      // Already loaded — narrow the list to this language (no fetch).
      setSelectedLanguages(members);
      saveSelectedLanguages(members);
      setCountryFilter(null);
    } else {
      // Not loaded (or only the pack's per-language subset is) — fetch the
      // language's full playlists, clearing filters from the previous source
      // so the fresh list shows whole.
      setSelectedLanguages([]);
      saveSelectedLanguages([]);
      setCountryFilter(null);
      this.dispatchEvent(
        new CustomEvent("telstar-load-sources", {
          detail: { sources: [{ urls: source.urls, idCountries: source.idCountries }] },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  render() {
    const enabled = isTauriAvailable();
    const loc = locale.get();
    const all = channels.get();
    const loaded = all.length > 0;
    const present = new Set(all.map((c) => c.language ?? ""));
    const selected = selectedLanguages.get();

    // Which option reflects the current filter. The curated pack wins when it's
    // the loaded source (keyed off loadedSource, not language); otherwise an
    // empty selection → "All languages".
    const packLoaded = loadedSource.get() === WORLD_NEWS_PACK_KEY;
    const fifaActive = packLoaded && selectedCategories.get().includes(FIFA_CATEGORY);
    const activeValue = packLoaded
      ? fifaActive
        ? FIFA_VALUE
        : WORLD_NEWS_PACK_KEY
      : selected.length === 0
        ? loadedSource.get() === null ? WORLD_NEWS_PACK_KEY : "all"
        : String(
            BROWSE_SOURCES_PRIMARY.findIndex((s) =>
              this.#loadedMembers(s, present).some((m) => selected.includes(m)),
            ),
          );

    const countries = availableCountries(all, selected);
    const country = countryFilter.get();

    return html`
      <div class="field">
        <span class="tv" aria-hidden="true">${TV}</span>
        <span class="label">${t("selectChannel")}</span>
        <select
          aria-label=${t("selectChannel")}
          ?disabled=${!enabled}
          @change=${(e: Event) => this.#onPick(e)}
        >
          <option value=${WORLD_NEWS_PACK_KEY} ?selected=${activeValue === WORLD_NEWS_PACK_KEY}>🌐 World News</option>
          <option value=${FIFA_VALUE} ?selected=${activeValue === FIFA_VALUE}>⚽ FIFA+</option>
          ${BROWSE_SOURCES_PRIMARY.map(
            (s, i) => html`
              <option value=${i} ?selected=${String(i) === activeValue}>
                ${localizedLanguageName(s.name, loc)}
              </option>
            `,
          )}
          <option value="all" ?selected=${activeValue === "all"}>${t("allLanguages")}</option>
        </select>
        ${loaded
          ? html`
              <button
                class="refresh"
                title=${t("rescan")}
                aria-label=${t("rescan")}
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent("telstar-refresh", { bubbles: true, composed: true }),
                  )}
              >
                ↻
              </button>
            `
          : ""}
        ${countries.length > 1
          ? html`
              <select
                class="country"
                aria-label=${t("allCountries")}
                @change=${(e: Event) => setCountryFilter((e.target as HTMLSelectElement).value || null)}
              >
                <option value="" ?selected=${country == null}>${t("allCountries")}</option>
                ${countries.map(
                  (c) => html`<option value=${c} ?selected=${country === c}>${c}</option>`,
                )}
              </select>
            `
          : ""}
      </div>
    `;
  }
}

customElements.define("telstar-source-picker", TelstarSourcePicker);
