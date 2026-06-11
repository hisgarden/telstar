/**
 * <telstar-now-playing> — the now-playing strip under the player.
 *
 * Resolves the channel currently bound to the player (the one whose URL matches
 * `currentSource`) and shows its logo, full name, language, and country flag —
 * so you can see what's on, not just a raw URL. Renders nothing when the source
 * isn't one of the loaded channels (e.g. the demo stream).
 */
import { LitElement, html, css } from "lit";
import { SignalWatcher, channels, currentSource, setFillMode, locale } from "../state/signals";
import { fundingFootnoteKey } from "../model/pack";
import type { Channel } from "../model/channel";
import { t } from "../i18n";

export class TelstarNowPlaying extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid #2a2a30;
      border-radius: 0.5rem;
      background: #16161a;
    }
    .logo {
      width: 2rem;
      height: 2rem;
      object-fit: contain;
      flex: none;
      border-radius: 0.25rem;
      background: #0d0d10;
    }
    /* Fallback when a channel has no logo URL yet — its initials, badge-style. */
    .initial {
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      border-radius: 0.25rem;
      background: #1b1b21;
      color: #9ecbff;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .name {
      flex: 1;
      min-width: 0;
      font-weight: 600;
      color: #e8e8ea;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lang {
      color: #8a8a92;
      font-size: 0.8rem;
    }
    .maximize {
      margin-left: auto;
      flex: none;
      width: 1.9rem;
      height: 1.9rem;
      border: 1px solid #2a2a30;
      border-radius: 0.4rem;
      background: #16161a;
      color: #c7c7cd;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
    }
    .maximize:hover {
      border-color: #3a6ea5;
      color: #cfe5ff;
    }
    /* Touch: 44pt tap target. */
    @media (pointer: coarse) {
      .maximize {
        width: 2.75rem;
        height: 2.75rem;
        font-size: 1.2rem;
      }
    }
    /* Funding context footnote — small, muted, unobtrusive (YouTube-style). */
    .funding {
      margin: 0.3rem 0.2rem 0;
      color: #6a6a72;
      font-size: 0.7rem;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;

  /** YouTube-style funding footnote for the playing channel, fully localized, or null. */
  #fundingNote(ch: Channel): string | null {
    if (!ch.funding || !ch.country) return null;
    const key = fundingFootnoteKey(ch.funding);
    if (!key) return null;
    let countryName = ch.country.toUpperCase();
    try {
      countryName =
        new Intl.DisplayNames([locale.get()], { type: "region" }).of(ch.country.toUpperCase()) ??
        countryName;
    } catch {
      /* keep the code as a fallback */
    }
    return t(key, { country: countryName });
  }

  render() {
    const src = currentSource.get();
    const ch = src ? (channels.get().find((c) => c.url === src) ?? null) : null;
    if (!ch) return html``;
    const note = this.#fundingNote(ch);
    return html`
      <div class="bar">
        ${ch.logo
          ? html`<img
              class="logo"
              src=${ch.logo}
              alt=""
              @error=${(e: Event) => ((e.target as HTMLElement).style.display = "none")}
            />`
          : html`<span class="initial">${ch.name.slice(0, 2)}</span>`}
        <span class="name">${ch.name}</span>
        ${ch.language ? html`<span class="lang">${ch.language}</span>` : ""}
        <button class="maximize" title=${t("maximize")} aria-label=${t("maximize")} @click=${() => setFillMode(true)}>
          ⤢
        </button>
      </div>
      ${note ? html`<p class="funding" title=${note}>${note}</p>` : ""}
    `;
  }
}

customElements.define("telstar-now-playing", TelstarNowPlaying);
