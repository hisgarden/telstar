/**
 * <telstar-viewer-bar> — the thin control strip that sits directly above the
 * player: a Refresh action (re-scan the loaded source, via the bubbling
 * `telstar-refresh` event) and the home-city clock. Renders nothing until
 * channels are loaded. The clock leads with the currently-playing broadcaster's
 * home capital, falling back to the dominant loaded language/country when idle.
 */
import { LitElement, html, css } from "lit";
import { SignalWatcher, channels, locale, currentSource } from "../state/signals";
import { resolveClock, gmtOffset, localizedCity } from "../model/timezone";
import { countryOfId } from "../model/country";
import { t } from "../i18n";

export class TelstarViewerBar extends SignalWatcher(LitElement) {
  #clockTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Keep the home-city clock current (minute resolution).
    this.#clockTimer = setInterval(() => this.requestUpdate(), 30_000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#clockTimer) clearInterval(this.#clockTimer);
  }

  /** The language with the most loaded channels (drives the home-city clock). */
  #dominantLanguage(): string | null {
    const counts = new Map<string, number>();
    for (const c of channels.get()) {
      if (c.language) counts.set(c.language, (counts.get(c.language) ?? 0) + 1);
    }
    let best: string | null = null;
    let max = 0;
    for (const [lang, n] of counts) {
      if (n > max) {
        best = lang;
        max = n;
      }
    }
    return best;
  }

  /** The most common country among loaded channels (by tvg-id suffix, then tvg-country). */
  #dominantCountry(): string | null {
    const counts = new Map<string, number>();
    for (const c of channels.get()) {
      const cc = countryOfId(c.id) ?? (c.country ? c.country.toLowerCase() : null);
      if (cc) counts.set(cc, (counts.get(cc) ?? 0) + 1);
    }
    let best: string | null = null;
    let max = 0;
    for (const [cc, n] of counts) {
      if (n > max) {
        best = cc;
        max = n;
      }
    }
    return best;
  }

  static styles = css`
    :host {
      display: block;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .clock {
      color: #8a8a92;
      font-size: 0.8rem;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .clock .label {
      color: #6a6a72;
    }
    .clock .city {
      color: #cfe5ff;
    }
  `;

  render() {
    if (channels.get().length === 0) return html``;
    return html`
      <div class="bar">
        ${this.#renderClock()}
      </div>
    `;
  }

  #renderClock() {
    const now = new Date();
    // The viewer's own local time, from the system clock, in the system's
    // preferred format (12h/24h per locale — no forced hour cycle), with its
    // GMT offset.
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Date + time, in the system's preferred format (12h/24h per locale).
    const local = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
    const localOffset = gmtOffset(now, localTz);
    const localPart = html`<span class="label">${t("localTime")}</span> ${local} (${localOffset})`;

    // Prefer the currently-playing broadcaster's clock (NHK → Tokyo); fall back
    // to the dominant loaded language/country when nothing plays or the country
    // is unknown. Order is the channel/broadcaster time first, then local time.
    const playingUrl = currentSource.get();
    const playing = playingUrl ? (channels.get().find((c) => c.url === playingUrl) ?? null) : null;
    const playingCountry = playing
      ? (countryOfId(playing.id) ?? (playing.country ? playing.country.toLowerCase() : null))
      : null;
    const { clock } = resolveClock({
      playingCountry,
      dominantLanguage: this.#dominantLanguage(),
      dominantCountry: this.#dominantCountry(),
    });
    if (!clock) {
      return html`<span class="clock">${localPart}</span>`;
    }
    const offset = gmtOffset(now, clock.timeZone);
    // The broadcast city's date + time in 24h, with its GMT offset.
    const cityDateTime = new Intl.DateTimeFormat(locale.get(), {
      timeZone: clock.timeZone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
    const cityPart = html`<span class="city">${localizedCity(clock.city, locale.get())}</span> ${cityDateTime} (${offset})`;
    // Broadcaster (channel) time leads, the viewer's local time follows.
    return html`
      <span class="clock" title=${`${clock.city} ${offset}`}>
        ${cityPart} · ${localPart}
      </span>
    `;
  }
}

customElements.define("telstar-viewer-bar", TelstarViewerBar);
