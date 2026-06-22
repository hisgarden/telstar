/**
 * <telstar-channel-grid> — the living contact sheet (R5, R7).
 *
 * A SignalWatcher over the channels signal: orders working-first, pages at
 * 64/screen, and renders a cell per channel. Hovering a cell makes it the sole
 * live preview (the grid tracks one preview URL); clicking plays it full.
 * Layout + live hover decode are verified in the native app; the paging and
 * single-preview logic live in src/grid.ts (tested).
 */
import { LitElement, html, css } from "lit";
import {
  SignalWatcher,
  channels,
  loadedSource,
  selectedLanguages,
  countryFilter,
  selectedCategories,
  setSelectedLanguages,
  setCountryFilter,
  setSelectedCategories,
} from "../state/signals";
import { WORLD_NEWS_PACK_KEY } from "../sources";
import { sortWorkingFirst } from "../state/availability";
import { scopeChannels, saveSelectedLanguages } from "../state/language-pref";
import { scopeByCategories, saveSelectedCategories } from "../state/genre-pref";
import { selectChannel } from "../state/channels";
import { PAGE_SIZE, pageCount, pageOf, hoverEnter, hoverLeave } from "../grid";
import { appendDigit, resolveChannel } from "../state/number-nav";
import "./channel-cell";

const NUMBER_COMMIT_MS = 800;
const HIGHLIGHT_MS = 1500;

export class TelstarChannelGrid extends SignalWatcher(LitElement) {
  static properties = {
    _page: { state: true },
    _preview: { state: true },
    _highlight: { state: true },
  };

  _page = 0;
  _preview: string | null = null;
  _highlight: string | null = null;
  #buffer = "";
  #commitTimer: ReturnType<typeof setTimeout> | null = null;
  #highlightTimer: ReturnType<typeof setTimeout> | null = null;
  #onKey = (e: KeyboardEvent) => {
    // Ignore when typing in a field (e.g. the playlist URL input).
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const next = appendDigit(this.#buffer, e.key);
    if (next === null) return;
    this.#buffer = next;
    if (this.#commitTimer) clearTimeout(this.#commitTimer);
    this.#commitTimer = setTimeout(() => this.#commitNumber(), NUMBER_COMMIT_MS);
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.#onKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.#onKey);
    if (this.#commitTimer) clearTimeout(this.#commitTimer);
    if (this.#highlightTimer) clearTimeout(this.#highlightTimer);
  }

  /** Channels in the current view: scoped by language/country/genre, ordered working-first. */
  #orderedScoped() {
    const scoped = scopeChannels(
      sortWorkingFirst(channels.get()),
      selectedLanguages.get(),
      countryFilter.get(),
    );
    const catScoped = scopeByCategories(scoped, selectedCategories.get());
    // World News pack default: hide sports channels unless sports is explicitly
    // selected (i.e. ⚽ FIFA+ mode). FIFA+ channels remain reachable via the picker.
    if (loadedSource.get() === WORLD_NEWS_PACK_KEY && !selectedCategories.get().includes("sports")) {
      return catScoped.filter((c) => !c.categories.includes("sports"));
    }
    return catScoped;
  }

  /** Resolve the typed number to a channel, page to it, and flash a highlight. */
  #commitNumber() {
    const typed = this.#buffer;
    this.#buffer = "";
    const ordered = this.#orderedScoped();
    const target = resolveChannel(ordered, typed);
    if (!target) return;
    const index = ordered.findIndex((c) => c.url === target.url);
    if (index < 0) return;
    this._page = Math.floor(index / PAGE_SIZE);
    this._highlight = target.url;
    if (this.#highlightTimer) clearTimeout(this.#highlightTimer);
    this.#highlightTimer = setTimeout(() => {
      this._highlight = null;
    }, HIGHLIGHT_MS);
  }

  static styles = css`
    :host {
      display: block;
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
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
      gap: 0.5rem;
    }
    .cellwrap {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .cellwrap.highlighted telstar-channel-cell {
      outline: 2px solid #9ecbff;
      outline-offset: 2px;
      border-radius: 0.4rem;
    }
    .label {
      font-size: 0.75rem;
      color: #c7c7cd;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .num {
      color: #8a8a92;
      font-family: ui-monospace, monospace;
    }
    .pager {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1rem;
      color: #8a8a92;
    }
    .pager button {
      padding: 0.35rem 0.75rem;
      border: 1px solid #2a2a30;
      border-radius: 0.4rem;
      background: #16161a;
      color: #cfe5ff;
      font: inherit;
      cursor: pointer;
    }
    .pager button[disabled] {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `;

  /** Reset all browse filters (and their persisted state) so nothing is hidden. */
  #clearFilters() {
    setSelectedLanguages([]);
    saveSelectedLanguages([]);
    setSelectedCategories([]);
    saveSelectedCategories([]);
    setCountryFilter(null);
    this._page = 0;
  }

  render() {
    const ordered = this.#orderedScoped();
    if (ordered.length === 0) {
      const total = channels.get().length;
      if (total === 0) {
        return html`<p class="empty">No channels loaded — open a playlist file or load a URL.</p>`;
      }
      // Channels are loaded but the active language/genre/country filters hide
      // them all — offer a one-click way out (no dead-end).
      return html`<p class="empty">
        ${total} channels loaded, but the current filters hide them all.
        <button @click=${() => this.#clearFilters()}>Clear filters</button>
      </p>`;
    }
    const pages = pageCount(ordered.length, PAGE_SIZE);
    const page = Math.min(this._page, pages - 1);
    const cells = pageOf(ordered, page, PAGE_SIZE);
    return html`
      <div class="grid">
        ${cells.map(
          (c) => html`
            <div
              class="cellwrap ${this._highlight === c.url ? "highlighted" : ""}"
              @mouseenter=${() => {
                this._preview = hoverEnter(this._preview, c.url);
              }}
              @mouseleave=${() => {
                this._preview = hoverLeave(this._preview, c.url);
              }}
              @click=${() => selectChannel(c)}
              title=${c.url}
            >
              <telstar-channel-cell
                .channel=${c}
                .active=${this._preview === c.url}
              ></telstar-channel-cell>
              <span class="label">
                ${c.number ? html`<span class="num">${c.number}</span> ` : ""}${c.name}
              </span>
            </div>
          `,
        )}
      </div>
      ${pages > 1
        ? html`
            <div class="pager">
              <button ?disabled=${page === 0} @click=${() => (this._page = Math.max(0, page - 1))}>
                ‹ Prev
              </button>
              <span>${page + 1} / ${pages}</span>
              <button
                ?disabled=${page >= pages - 1}
                @click=${() => (this._page = Math.min(pages - 1, page + 1))}
              >
                Next ›
              </button>
            </div>
          `
        : ""}
    `;
  }
}

customElements.define("telstar-channel-grid", TelstarChannelGrid);
