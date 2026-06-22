/**
 * <telstar-channel-list> — a simple, reliable channel list (HDHomeRun-style).
 *
 * A vertical list of the loaded channels: availability dot, logo (or initial),
 * name, language, and country flag. Click a row to play it. The most-recently
 * selected channel sorts to the top; the rest follow working-first. Honors the
 * language/genre/country filters, with a clear-filters escape if they hide all.
 *
 * Intentionally stateless (no reactive class fields) — it derives everything
 * from the signals, so it sidesteps the class-field-shadowing pitfall.
 */
import { LitElement, html, css } from "lit";
import {
  SignalWatcher,
  channels,
  currentSource,
  selectedLanguages,
  countryFilter,
  selectedCategories,
  setSelectedLanguages,
  setCountryFilter,
  setSelectedCategories,
  channelQuery,
  hiddenUrls,
  hideChannel,
  showFlags,
} from "../state/signals";
import { sortWorkingFirst } from "../state/availability";
import { scopeChannels, saveSelectedLanguages } from "../state/language-pref";
import { scopeByCategories, saveSelectedCategories } from "../state/genre-pref";
import { selectChannel } from "../state/channels";
import { countryLabel } from "../model/country";
import { t } from "../i18n";
import type { Channel } from "../model/channel";

const DOT: Record<Channel["availability"], string> = {
  live: "#5cb85c",
  slow: "#e0a000",
  unknown: "#6a6a72",
  dead: "#a33",
};

export class TelstarChannelList extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .empty {
      color: #8a8a92;
      font-style: italic;
    }
    .empty button {
      margin-left: 0.5rem;
      padding: 0.2rem 0.6rem;
      border: 1px solid #3a6ea5;
      border-radius: 0.4rem;
      background: #1b2a3a;
      color: #cfe5ff;
      font: inherit;
      font-style: normal;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 0 0 0.4rem;
      flex: none;
    }
    .count {
      color: #8a8a92;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      border: 1px solid #2a2a30;
      border-radius: 0.5rem;
    }
    li {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.45rem 0.7rem;
      border-bottom: 1px solid #1b1b21;
      cursor: pointer;
    }
    li:last-child {
      border-bottom: none;
    }
    li:hover {
      background: #16161a;
    }
    li[aria-current="true"] {
      background: #1b2a3a;
    }
    .dot {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 50%;
      flex: none;
    }
    .logo {
      width: 2.2rem;
      height: 1.5rem;
      object-fit: contain;
      flex: none;
      border-radius: 0.2rem;
      background: #0d0d10;
    }
    .initial {
      width: 2.2rem;
      height: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      border-radius: 0.2rem;
      background: #1b1b21;
      color: #9ecbff;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .name {
      flex: 1;
      min-width: 0;
      color: #e8e8ea;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      color: #8a8a92;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    .flag {
      font-size: 1.1rem;
      line-height: 1;
    }
    .hide {
      flex: none;
      width: 1.4rem;
      height: 1.4rem;
      padding: 0;
      border: none;
      border-radius: 0.3rem;
      background: transparent;
      color: #6a6a72;
      font-size: 0.85rem;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
    }
    li:hover .hide {
      opacity: 1;
    }
    .hide:hover {
      background: #3a1b1b;
      color: #ff9b9b;
    }
    /* Touch: no hover, so the hide button is always visible; bigger tap targets. */
    @media (pointer: coarse) {
      li {
        padding: 0.7rem 0.7rem;
      }
      .hide {
        opacity: 1;
        width: 2.75rem;
        height: 2.75rem;
        font-size: 1rem;
      }
    }
  `;

  #clearFilters() {
    setSelectedLanguages([]);
    saveSelectedLanguages([]);
    setSelectedCategories([]);
    saveSelectedCategories([]);
    setCountryFilter(null);
  }

  render() {
    const hidden = new Set(hiddenUrls.get());
    const all = channels.get().filter((c) => !hidden.has(c.url));
    const query = channelQuery.get().trim().toLowerCase();

    const byName = (a: Channel, b: Channel) => a.name.localeCompare(b.name);
    let ordered: Channel[];
    if (query) {
      // Search finds by name across ALL loaded channels, ignoring the
      // language/genre/country filters — so a known channel is always findable
      // regardless of how the list is scoped. Alphabetical by name.
      ordered = all.filter((c) => c.name.toLowerCase().includes(query)).sort(byName);
    } else {
      // Alphabetical by name, working-first: the probe sinks dead channels (it
      // never hides), but the order stays predictable A-Z — no recency float.
      ordered = sortWorkingFirst(
        scopeByCategories(
          scopeChannels([...all].sort(byName), selectedLanguages.get(), countryFilter.get()),
          selectedCategories.get(),
        ),
      );
    }

    if (ordered.length === 0) {
      if (all.length === 0) {
        return html`<p class="empty">${t("noChannels")}</p>`;
      }
      if (query) {
        return html`<p class="empty">${t("noMatch", { query: channelQuery.get().trim() })}</p>`;
      }
      return html`<p class="empty">
        ${t("hiddenByFilters", { count: all.length })}
        <button @click=${() => this.#clearFilters()}>${t("clearFilters")}</button>
      </p>`;
    }

    const current = currentSource.get();
    const withFlag = showFlags.get();
    return html`
      <div class="head">
        <span class="count">
          ${query ? t("found", { count: ordered.length }) : t("ofTotal", { count: ordered.length, total: all.length })}
        </span>
      </div>
      <ul>
        ${ordered.map((c) => {
          const region = countryLabel(c.country, withFlag);
          return html`
            <li
              aria-current=${current === c.url ? "true" : "false"}
              @click=${() => selectChannel(c)}
              title=${c.url}
            >
              <span class="dot" style=${`background:${DOT[c.availability]}`}></span>
              ${c.logo
                ? html`<img
                    class="logo"
                    src=${c.logo}
                    alt=""
                    loading="lazy"
                    @error=${(e: Event) => ((e.target as HTMLElement).style.visibility = "hidden")}
                  />`
                : html`<span class="initial">${c.name.slice(0, 2)}</span>`}
              <span class="name">${c.number ? `${c.number}. ` : ""}${c.name}</span>
              <span class="meta">${c.language ?? ""}</span>
              ${region
                ? html`<span class="flag" title=${c.country ?? ""}>${region}</span>`
                : ""}
              <button
                class="hide"
                title=${t("hideChannelTitle")}
                aria-label=${t("hideChannel")}
                @click=${(e: Event) => {
                  e.stopPropagation();
                  hideChannel(c.url);
                }}
              >
                ✕
              </button>
            </li>
          `;
        })}
      </ul>
    `;
  }
}

customElements.define("telstar-channel-list", TelstarChannelList);
