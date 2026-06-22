/**
 * <telstar-channel-cell> — one grid cell.
 *
 * - Inactive: shows the cached snapshot, else the logo, else the channel name
 *   (never a blank cell — AE7), with a country badge.
 * - Active (hovered): mounts a single muted hls.js preview. The grid marks
 *   exactly one cell active, so at most one live decode runs at a time.
 *
 * Loads its cached snapshot when the bound channel changes (cells are reused
 * across grid pages, so state must reset). Once the preview has played past the
 * black warm-up, it captures one frame to cache so the cell comes alive next
 * time. Live preview decode + capture need native verification.
 */
import { LitElement, html, css, type PropertyValues } from "lit";
import Hls from "hls.js";
import { captureFromVideo, cellVisual, loadSnapshot } from "../snapshot";
import { countryFlag } from "../model/country";
import type { Channel } from "../model/channel";

/** Skip the first second of playback so a still-decoding black frame is never cached. */
const CAPTURE_MIN_PLAYBACK_S = 1;

export class TelstarChannelCell extends LitElement {
  static properties = {
    channel: { attribute: false },
    active: { attribute: false },
    _snapshot: { state: true },
    _logoFailed: { state: true },
  };

  channel!: Channel;
  active = false;
  _snapshot: string | null = null;
  _logoFailed = false;
  #hls: Hls | null = null;
  #capturedFor: string | null = null;

  static styles = css`
    :host {
      display: block;
      aspect-ratio: 16 / 9;
      border-radius: 0.4rem;
      overflow: hidden;
      background: #0d0d10;
      border: 1px solid #2a2a30;
      cursor: pointer;
    }
    :host(:hover) {
      border-color: #3a6ea5;
    }
    .snap,
    .preview,
    .fallback {
      width: 100%;
      height: 100%;
    }
    .snap,
    .preview {
      object-fit: cover;
    }
    .fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .logo {
      max-width: 70%;
      max-height: 70%;
      object-fit: contain;
    }
    .name {
      padding: 0 0.4rem;
      font-size: 0.8rem;
      line-height: 1.25;
      text-align: center;
      color: #c7c7cd;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    .country {
      position: absolute;
      bottom: 0.25rem;
      right: 0.35rem;
      font: 0.7rem ui-monospace, monospace;
      color: #cfe5ff;
      background: rgba(0, 0, 0, 0.55);
      padding: 0 0.3rem;
      border-radius: 0.25rem;
    }
  `;

  willUpdate(changed: PropertyValues) {
    if (!changed.has("channel")) return;
    const prev = changed.get("channel") as Channel | undefined;
    if (prev && prev.url === this.channel.url) return;
    // New channel bound (incl. first render): reset per-channel state and load
    // its cached snapshot, guarding against an out-of-order async resolve.
    this._snapshot = null;
    this._logoFailed = false;
    this.#capturedFor = null;
    const url = this.channel.url;
    void loadSnapshot(url).then((s) => {
      if (s && this.channel.url === url) this._snapshot = s;
    });
  }

  updated() {
    const video = this.renderRoot.querySelector("video.preview") as HTMLVideoElement | null;
    if (this.active && video && !this.#hls) {
      if (Hls.isSupported()) {
        this.#hls = new Hls({ maxBufferLength: 6 });
        this.#hls.loadSource(this.channel.url);
        this.#hls.attachMedia(video);
      } else {
        video.src = this.channel.url; // native HLS fallback
      }
      void video.play?.().catch(() => {});
      this.#armCapture(video);
    } else if (!this.active && this.#hls) {
      this.#hls.destroy();
      this.#hls = null;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#hls?.destroy();
    this.#hls = null;
  }

  /**
   * Once the preview has played past the black warm-up, capture one frame to
   * cache so the cell shows a real snapshot when it goes inactive. One-shot per
   * hover; re-armed on the next hover if it didn't land. Best-effort.
   */
  #armCapture(video: HTMLVideoElement) {
    const url = this.channel.url;
    if (this._snapshot || this.#capturedFor === url) return;
    const onTime = () => {
      if (video.currentTime < CAPTURE_MIN_PLAYBACK_S) return; // skip the black warm-up frame
      video.removeEventListener("timeupdate", onTime);
      void captureFromVideo(url, video).then((snap) => {
        if (snap) {
          this.#capturedFor = url;
          this._snapshot = snap; // shown by cellVisual once inactive
        }
      });
    };
    video.addEventListener("timeupdate", onTime);
  }

  render() {
    if (this.active) {
      return html`<video class="preview" muted autoplay playsinline></video>`;
    }
    const v = cellVisual(this.channel, this._snapshot);
    if (v.kind === "snapshot") {
      return html`<img class="snap" src=${v.src} alt=${this.channel.name} />`;
    }
    const showLogo = v.logo != null && !this._logoFailed;
    return html`
      <div class="fallback">
        ${showLogo
          ? html`<img
              class="logo"
              src=${v.logo ?? ""}
              alt=""
              loading="lazy"
              @error=${() => {
                this._logoFailed = true;
              }}
            />`
          : html`<span class="name">${this.channel.name}</span>`}
        ${v.country
          ? html`<span class="country">${countryFlag(v.country) ?? v.country}</span>`
          : ""}
      </div>
    `;
  }
}

customElements.define("telstar-channel-cell", TelstarChannelCell);
