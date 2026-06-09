/**
 * <telstar-hotbar> — quick-launch chips for channels that have actually played.
 *
 * Driven by `playedUrls` (a channel joins only after real playback confirms it),
 * most-recent first, persisted. Left-click a chip to re-play. Right-click opens
 * a menu to remove it from Recent or hide the channel everywhere. Renders
 * nothing until something has played.
 */
import { LitElement, html, css } from "lit";
import {
  SignalWatcher,
  channels,
  currentSource,
  playedUrls,
  hiddenUrls,
  removeFromPlayed,
  hideChannel,
  showFlags,
} from "../state/signals";
import { selectChannel } from "../state/channels";
import { countryLabel } from "../model/country";
import { shortenChannelName } from "../model/display-name";
import { t } from "../i18n";

interface MenuState {
  url: string;
  name: string;
  x: number;
  y: number;
}

export class TelstarHotbar extends SignalWatcher(LitElement) {
  static properties = {
    _menu: { state: true },
  };

  _menu: MenuState | null = null;
  #pressTimer: ReturnType<typeof setTimeout> | null = null;
  #longPressed = false;

  /** Touch/mouse press start — arm a long-press to open the menu (touch has no right-click). */
  #onPressStart(e: PointerEvent, c: { url: string; name: string }) {
    this.#longPressed = false;
    this.#endPress();
    this.#pressTimer = setTimeout(() => {
      this.#longPressed = true;
      this._menu = { url: c.url, name: c.name, x: e.clientX, y: e.clientY };
      this.#pressTimer = null;
    }, 500);
  }

  #endPress() {
    if (this.#pressTimer) {
      clearTimeout(this.#pressTimer);
      this.#pressTimer = null;
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    .bar {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .legend {
      flex: none;
      padding-top: 0.5rem;
      color: #6a6a72;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .chips {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
      gap: 0.4rem;
    }
    /* Wide layout (macOS / landscape sidebar): a fixed 2-column grid so the
       Recent strip forms a roomy block (up to 2×8) with readable channel names;
       the channel list scrolls below it. */
    @media (orientation: landscape) and (min-width: 48rem) {
      .chips {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .chip {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      min-width: 0;
      padding: 0.35rem 0.6rem;
      border: 1px solid #2a2a30;
      border-radius: 0.5rem;
      background: #16161a;
      color: #e8e8ea;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .chip:hover {
      border-color: #3a6ea5;
    }
    .chip[aria-current="true"] {
      border-color: #3a6ea5;
      background: #1b2a3a;
      color: #cfe5ff;
    }
    .logo {
      width: 1.4rem;
      height: 1rem;
      object-fit: contain;
      flex: none;
    }
    .name {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .flag {
      flex: none;
    }
    .menu {
      position: fixed;
      z-index: 50;
      min-width: 11rem;
      padding: 0.25rem;
      border: 1px solid #2a2a30;
      border-radius: 0.5rem;
      background: #1b1b21;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    }
    .menu-title {
      padding: 0.3rem 0.5rem;
      color: #8a8a92;
      font-size: 0.75rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 14rem;
    }
    .menu button {
      display: block;
      width: 100%;
      text-align: left;
      padding: 0.4rem 0.5rem;
      border: none;
      border-radius: 0.3rem;
      background: transparent;
      color: #e8e8ea;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .menu button:hover {
      background: #2a2a30;
    }
    .menu button.danger:hover {
      background: #3a1b1b;
      color: #ff9b9b;
    }
    /* Touch: bigger tap targets, roomier menu rows. */
    @media (pointer: coarse) {
      .chip {
        padding: 0.55rem 0.85rem;
      }
      .menu {
        min-width: 13rem;
      }
      .menu button {
        padding: 0.7rem 0.7rem;
      }
    }
  `;

  #onWindowClick = () => {
    if (this._menu) this._menu = null;
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("click", this.#onWindowClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("click", this.#onWindowClick);
  }

  render() {
    const order = playedUrls.get();
    if (order.length === 0) return html``;
    const hidden = new Set(hiddenUrls.get());
    const byUrl = new Map(channels.get().map((c) => [c.url, c]));
    const items = order
      .map((u) => byUrl.get(u))
      .filter((c): c is NonNullable<typeof c> => !!c && !hidden.has(c.url))
      // Cap the Recent strip at 2 columns × 8 rows so it stays a bounded, glanceable
      // block; older recents drop off (the full list is always in the channel list).
      .slice(0, 16);
    if (items.length === 0) return html``;
    const current = currentSource.get();
    const withFlag = showFlags.get();
    return html`
      <div class="bar">
        <span class="legend">${t("recent")}</span>
        <div class="chips">
          ${items.map((c) => {
            const region = countryLabel(c.country, withFlag);
            return html`
              <button
                class="chip"
                aria-current=${current === c.url ? "true" : "false"}
                @click=${(e: Event) => {
                  if (this.#longPressed) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.#longPressed = false;
                    return;
                  }
                  selectChannel(c);
                }}
                @pointerdown=${(e: PointerEvent) => this.#onPressStart(e, c)}
                @pointerup=${() => this.#endPress()}
                @pointermove=${() => this.#endPress()}
                @pointercancel=${() => this.#endPress()}
                @contextmenu=${(e: MouseEvent) => {
                  e.preventDefault();
                  this._menu = { url: c.url, name: c.name, x: e.clientX, y: e.clientY };
                }}
                title=${c.name}
              >
                ${c.logo
                  ? html`<img
                      class="logo"
                      src=${c.logo}
                      alt=""
                      @error=${(e: Event) => ((e.target as HTMLElement).style.display = "none")}
                    />`
                  : ""}
                <span class="name">${shortenChannelName(c.name)}</span>
                ${region ? html`<span class="flag">${region}</span>` : ""}
              </button>
            `;
          })}
        </div>
      </div>
      ${this.#renderMenu()}
    `;
  }

  #renderMenu() {
    const m = this._menu;
    if (!m) return "";
    return html`
      <div class="menu" style=${`left:${m.x}px;top:${m.y}px`} @click=${(e: Event) => e.stopPropagation()}>
        <div class="menu-title">${m.name}</div>
        <button
          @click=${() => {
            removeFromPlayed(m.url);
            this._menu = null;
          }}
        >
          ${t("removeFromRecent")}
        </button>
        <button
          class="danger"
          @click=${() => {
            hideChannel(m.url);
            this._menu = null;
          }}
        >
          ${t("hideChannel")}
        </button>
      </div>
    `;
  }
}

customElements.define("telstar-hotbar", TelstarHotbar);
