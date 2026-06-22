/**
 * <telstar-player> — a Lit wrapper around the Vidstack <media-player>.
 *
 * The player is a pure view over the signals store: its `src` is bound to
 * `currentSource`, and playback lifecycle events are written back into
 * `playbackState`. It owns no stream state of its own — setting the source
 * signal is the only way to change what plays (the agent-native seam).
 *
 * hls.js is supplied locally to the HLS provider. Vidstack would otherwise
 * fetch hls.js from a CDN at runtime; loading it from the bundle keeps the app
 * free of implicit network calls (zero-trust / privacy — R12).
 */
import { LitElement, html, css } from "lit";
import "vidstack/player";
import { isHLSProvider } from "vidstack";
import type { MediaProviderChangeEvent } from "vidstack";
import Hls from "hls.js";
import {
  SignalWatcher,
  channels,
  currentSource,
  setCurrentSource,
  playbackState,
  setPlaybackState,
  markUnplayable,
  markPlayable,
  confirmLive,
} from "../state/signals";
import { loadSnapshot } from "../snapshot";
import { loadCaptionsOn, saveCaptionsOn } from "../state/view-pref";
import { pushCaptionsOn } from "../sync";
import type { Channel } from "../model/channel";
import { nextChannel, prevChannel } from "../state/channel-nav";
import {
  bindTransport,
  setNowPlaying,
  setCardPlaybackState,
  type MediaSessionLike,
  type MediaMetadataCtor,
} from "../media-session";
import { initialWatchdog, step, type StallAction, type WatchdogState } from "../stall-watchdog";

/** Default audio level once unmuted (25%). */
const DEFAULT_VOLUME = 0.25;

interface VdsTextTrack {
  kind: string;
  mode: "disabled" | "hidden" | "showing";
}

/** Fatal hls.js errors to try recovering before culling a channel as dead. */
const MAX_HLS_RECOVERIES = 3;

/** How often to sample the native <video> for a freeze (native-HLS path only). */
const WATCHDOG_INTERVAL_MS = 3000;

/** Seconds to sit back from the live edge after a recovery seek (avoid re-stalling at the very edge). */
const LIVE_EDGE_BACKOFF = 1;

export class TelstarPlayer extends SignalWatcher(LitElement) {
  static properties = {
    _poster: { state: true },
    _posterKind: { state: true },
    _muted: { state: true },
  };

  _poster: string | null = null;
  // Whether the current poster is the channel logo (show at natural size,
  // centered — never upscaled) or a cached snapshot (a full video frame that
  // should fill the player box).
  _posterKind: "logo" | "snapshot" = "logo";
  // Start muted so the initial (unprompted) autoplay is allowed; unmute to 25%
  // once the viewer picks a channel (a user gesture that permits sound).
  _muted = true;
  #posterFor: string | null = null;
  // WKWebView can spuriously pause a just-started live stream (it under-detects
  // the live edge and stops at the tiny initial seekable end). Track the last
  // confirmed-playing time and a per-source resume budget so we can nudge such
  // an early, non-user pause back into playback without fighting a deliberate
  // pause the viewer makes later.
  #lastPlayingAt = 0;
  #resumeAttempts = 0;
  // Captions default ON (persisted); only ticked on when a stream actually
  // carries caption/subtitle tracks — never faked when unavailable.
  #captionsOn = loadCaptionsOn();
  #captionsBound = false;
  // Fatal-error recoveries attempted for the current source; reset on sustained
  // playback. Caps how hard we try before marking a channel dead.
  #hlsRecoveryAttempts = 0;
  // Whether hls.js (MSE) is driving playback for the current source. True only
  // on platforms where Vidstack selects the HLS provider (desktop/Android); on
  // iOS/macOS WKWebView the native AVFoundation pipeline plays HLS and this stays
  // false. The freeze watchdog runs ONLY on the native path — hls.js has its own
  // recovery (#bindHlsRecovery), so they must never both fight over a stall.
  #hlsActive = false;
  // Native-HLS freeze watchdog state + timer. Native HLS exposes no recovery
  // hooks, so we sample currentTime and nudge it (seek-to-live → reload → cull).
  #watchdog: WatchdogState = initialWatchdog();
  #watchdogTimer?: ReturnType<typeof setInterval>;
  // One-time guard so the lock-screen transport handlers are bound just once.
  #transportBound = false;

  static styles = css`
    :host {
      display: block;
      position: relative;
    }
    media-player {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 0.5rem;
      overflow: hidden;
    }
    media-provider,
    media-provider video,
    video {
      width: 100%;
      height: 100%;
    }
    /* Snapshot shown while the stream isn't actually playing (loading or
       failed) — a full video frame, so fill the player box. */
    .poster {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
      border-radius: 0.5rem;
      pointer-events: none;
    }
    /* Logo "tuning card": the channel logo centered on black at its OWN size.
       Never upscaled past its native pixels (small PNGs would pixelize if
       stretched to the player box) — only shrunk if it would overflow. */
    .poster-frame {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      border-radius: 0.5rem;
      pointer-events: none;
    }
    .poster-frame img {
      width: auto;
      height: auto;
      max-width: 45%;
      max-height: 45%;
      object-fit: contain;
    }
    /* Landscape (wide): the host is flexed to the viewer's height, so size the
       player by that height — width derives from 16:9, capped at the column
       width. Keeps the 1080p perspective while filling the available height
       (no vertical clipping), centered. */
    @media (orientation: landscape) and (min-width: 48rem) {
      :host {
        height: 100%;
        min-height: 0;
        display: flex;
        align-items: flex-start;
        justify-content: center;
      }
      media-player {
        width: auto;
        height: 100%;
        max-width: 100%;
        margin: 0 auto;
      }
      /* The poster (tuning logo) fills the player box via the base inset:0 rule —
         it must never be wider than the viewer, so no height/aspect override here
         (which could compute wider than the column and cover the channel list). */
    }
  `;

  /** Start playback on the underlying media-player element. Best-effort. */
  #play() {
    const player = this.renderRoot.querySelector("media-player") as
      | (HTMLElement & { play?: () => Promise<void> })
      | null;
    void player?.play?.().catch(() => {});
  }

  #textTracks(): VdsTextTrack[] {
    try {
      const tracks = (this.renderRoot.querySelector("media-player") as { textTracks?: unknown })
        ?.textTracks;
      return tracks ? (Array.from(tracks as Iterable<VdsTextTrack>) as VdsTextTrack[]) : [];
    } catch {
      return [];
    }
  }

  /** Pause playback (e.g. the lock-screen pause button). Best-effort. */
  #pause() {
    const player = this.renderRoot.querySelector("media-player") as
      | (HTMLElement & { pause?: () => void })
      | null;
    player?.pause?.();
  }

  /** The native <video> element, once mounted. */
  #video(): HTMLVideoElement | null {
    return this.renderRoot.querySelector("video") as HTMLVideoElement | null;
  }

  /** The system Media Session, or null on platforms without it (older iOS, non-WebKit). */
  #session(): MediaSessionLike | null {
    return typeof navigator !== "undefined" && "mediaSession" in navigator
      ? (navigator.mediaSession as unknown as MediaSessionLike)
      : null;
  }

  /** The MediaMetadata constructor, or null where unavailable. */
  #metadataCtor(): MediaMetadataCtor | null {
    return typeof window !== "undefined" && "MediaMetadata" in window
      ? (window.MediaMetadata as unknown as MediaMetadataCtor)
      : null;
  }

  /** Change channel from the lock screen / headset (⏭ / ⏮) via the signals seam. */
  #stepChannel(pick: (list: Channel[], current: string | null) => string | null) {
    const url = pick(channels.get(), currentSource.get());
    if (url) setCurrentSource(url);
  }

  firstUpdated() {
    // Wire the lock-screen / headset transport once: play/pause drive the
    // element; ⏭/⏮ step channels through the signals store.
    if (!this.#transportBound) {
      this.#transportBound = true;
      bindTransport(this.#session(), {
        play: () => this.#play(),
        pause: () => this.#pause(),
        next: () => this.#stepChannel(nextChannel),
        prev: () => this.#stepChannel(prevChannel),
      });
    }
    this.#armWatchdog();
  }

  /** Start the freeze-watchdog timer (idempotent). */
  #armWatchdog() {
    if (this.#watchdogTimer == null) {
      this.#watchdogTimer = setInterval(() => this.#sampleForStall(), WATCHDOG_INTERVAL_MS);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    // firstUpdated fires only once per element lifetime, but disconnectedCallback
    // tears the timer down on every detach — re-arm on re-attach so the watchdog
    // survives the element being moved in the DOM. No-op before first render.
    if (this.hasUpdated) this.#armWatchdog();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#watchdogTimer != null) {
      clearInterval(this.#watchdogTimer);
      this.#watchdogTimer = undefined;
    }
  }

  /**
   * One watchdog tick. Native-HLS only — when hls.js is driving playback its own
   * recovery owns stalls (#bindHlsRecovery). Samples the <video> and applies the
   * escalated recovery the stall-watchdog decides.
   */
  #sampleForStall() {
    if (this.#hlsActive) return;
    const video = this.#video();
    if (!video) return;
    const { state, action } = step(this.#watchdog, {
      currentTime: video.currentTime,
      paused: video.paused,
      ended: video.ended,
    });
    this.#watchdog = state;
    if (action !== "none") this.#applyStallAction(video, action);
  }

  /** Carry out a recovery rung against the native element. */
  #applyStallAction(video: HTMLVideoElement, action: StallAction) {
    if (action === "seek-live") {
      // Jump to the live edge — skips the discontinuity/gap most IPTV freezes on.
      const s = video.seekable;
      if (s.length) {
        try {
          video.currentTime = Math.max(0, s.end(s.length - 1) - LIVE_EDGE_BACKOFF);
        } catch {
          /* seekable can throw mid-reset; ignore and retry next tick */
        }
      }
      void video.play().catch(() => {});
    } else if (action === "reload") {
      // Re-fetch the manifest + segments for the current source (no src change,
      // so Vidstack's binding stays intact).
      video.load();
      void video.play().catch(() => {});
    } else if (action === "cull") {
      this.#cullCurrent(); // recovery exhausted — mark the channel dead
    }
  }

  /** Bind once to the text-track list so late-loading caption tracks get enabled. */
  #bindCaptions() {
    if (this.#captionsBound) return;
    const list = (
      this.renderRoot.querySelector("media-player") as {
        textTracks?: { addEventListener?: (t: string, cb: () => void) => void };
      }
    )?.textTracks;
    if (!list?.addEventListener) return;
    this.#captionsBound = true;
    list.addEventListener("add", () => this.#enableCaptions());
    list.addEventListener("mode-change", () => this.#syncCaptionsPref());
  }

  /** Turn captions on (first caption/subtitle track) when the preference is on. */
  #enableCaptions() {
    if (!this.#captionsOn) return;
    const tracks = this.#textTracks();
    if (tracks.some((t) => t.mode === "showing")) return;
    const cc = tracks.find((t) => t.kind === "subtitles" || t.kind === "captions");
    if (cc) cc.mode = "showing";
  }

  /** Mirror the user's caption toggle into the persisted preference. */
  #syncCaptionsPref() {
    const caps = this.#textTracks().filter(
      (t) => t.kind === "subtitles" || t.kind === "captions",
    );
    if (caps.length === 0) return; // none available — don't change the preference
    const on = caps.some((t) => t.mode === "showing");
    if (on !== this.#captionsOn) {
      this.#captionsOn = on;
      saveCaptionsOn(on);
      pushCaptionsOn(on);
    }
  }

  /**
   * Playback reached a good state. "can-play" confirms the channel is live and
   * kicks off playback (autoplay can miss a source switch, so force it once the
   * new source is loaded); "playing" additionally earns a Recent slot.
   */
  #confirm(state: "can-play" | "playing") {
    setPlaybackState(state);
    const s = currentSource.get();
    if (!s) return;
    if (state === "playing") {
      this.#lastPlayingAt = Date.now();
      this.#hlsRecoveryAttempts = 0; // sustained playback — refresh the recovery budget
      setCardPlaybackState(this.#session(), "playing"); // lock-screen card: now playing
      markPlayable(s);
    } else {
      confirmLive(s);
      this.#play(); // ensure the freshly-loaded source actually starts
      this.#enableCaptions(); // captions default on when the stream has them
    }
  }

  /**
   * Handle a pause. Record the paused state, then — only if this pause landed
   * within a few seconds of playback actually starting (the WKWebView spurious
   * early-pause symptom) and we still have resume budget for this source —
   * nudge playback back. A deliberate pause the viewer makes after settling in
   * falls outside the window and is respected.
   */
  #onPause() {
    setPlaybackState("paused");
    setCardPlaybackState(this.#session(), "paused"); // lock-screen card: glyph mirrors state
    const startedRecently = this.#lastPlayingAt > 0 && Date.now() - this.#lastPlayingAt < 4000;
    if (startedRecently && this.#resumeAttempts < 3) {
      this.#resumeAttempts++;
      this.#play();
    }
  }

  private onProviderChange(event: MediaProviderChangeEvent) {
    const provider = event.detail;
    // On iOS/macOS WKWebView, Vidstack plays HLS through the native AVFoundation
    // pipeline (a video provider, not an HLS provider), so this branch is skipped
    // there — which is exactly what we want: only native HLS keeps audio alive in
    // the background and feeds the Now Playing card. This branch (hls.js/MSE) is
    // for platforms without native HLS (desktop Chrome/Firefox, Android).
    if (isHLSProvider(provider)) {
      // Use the locally bundled hls.js, not Vidstack's default CDN loader.
      provider.library = Hls;
      // Quality: don't cap the rendition to the player box — fetch the full
      // resolution the stream offers (e.g. 1080p) so it stays sharp windowed
      // and pixel-exact in fullscreen. ABR still adapts to bandwidth.
      provider.config = { ...provider.config, capLevelToPlayerSize: false };
    }
  }

  /**
   * hls.js fatal-error recovery. Non-fatal errors (e.g. a brief segment stall)
   * hls.js handles itself — those are the channels that "freeze a second then
   * resume". A fatal error otherwise stops playback for good; try the standard
   * recoveries first, and only cull the channel once recovery is exhausted, so a
   * recoverable stream is never wrongly marked dead.
   */
  #bindHlsRecovery(hls: Hls) {
    this.#hlsRecoveryAttempts = 0;
    this.#hlsActive = true; // MSE path is live — the native freeze watchdog stands down
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return; // hls.js auto-recovers non-fatal errors — let it
      if (this.#hlsRecoveryAttempts < MAX_HLS_RECOVERIES) {
        this.#hlsRecoveryAttempts++;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad(); // re-request the playlist / segments
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError(); // flush + re-init the media buffer (GZ's case)
        } else {
          this.#cullCurrent(); // KEY / other — unrecoverable
        }
        return;
      }
      this.#cullCurrent(); // recovery budget spent — genuinely unplayable
    });
  }

  /** Mark the currently-playing source dead (no-op for the non-channel demo). */
  #cullCurrent() {
    const s = currentSource.get();
    if (s) markUnplayable(s);
  }

  updated() {
    this.#bindCaptions();
    const src = currentSource.get();
    if (src === this.#posterFor) return;
    const isFirst = this.#posterFor === null;
    this.#posterFor = src;
    // Fresh source: reset the spurious-pause resume budget and playing clock.
    this.#resumeAttempts = 0;
    this.#lastPlayingAt = 0;

    // New source: reset the freeze watchdog and assume the native path until an
    // hls.js instance announces itself (@hls-instance) for this source.
    this.#watchdog = initialWatchdog();
    this.#hlsActive = false;

    // Poster: the channel's cached snapshot (from a prior play) or its logo, so
    // the player shows what the channel is while loading or if it fails.
    const ch = src ? channels.get().find((c) => c.url === src) : undefined;
    this._poster = ch?.logo ?? null;
    this._posterKind = "logo";
    if (src) {
      void loadSnapshot(src).then((snap) => {
        if (snap && currentSource.get() === src) {
          this._poster = snap;
          this._posterKind = "snapshot";
        }
      });
    }

    // Publish the channel to the lock-screen / Control Center Now Playing card.
    setNowPlaying(this.#session(), this.#metadataCtor(), {
      title: ch?.name ?? "Telstar",
      artist: ch?.country ?? ch?.language ?? "Live",
      logo: ch?.logo ?? null,
    });

    // A channel switch (not the initial demo) is a user gesture — unmute to the
    // default 25% so sound plays without a separate click.
    if (!isFirst) this._muted = false;

    this.#play(); // ensure the newly selected source actually starts
  }

  render() {
    const src = currentSource.get() ?? "";
    const state = playbackState.get();
    const showPoster = this._poster != null && state !== "playing" && state !== "paused";
    return html`
      <media-player
        title="Telstar demo"
        .src=${src}
        .muted=${this._muted}
        .volume=${DEFAULT_VOLUME}
        stream-type="live"
        autoplay
        playsinline
        controls
        @provider-change=${this.onProviderChange}
        @hls-instance=${(e: Event) => {
          // Guard the cast: the detail is our own Hls (provider.library = Hls),
          // but verify so a Vidstack payload change fails closed, not at .on().
          const detail = (e as CustomEvent).detail;
          if (detail instanceof Hls) this.#bindHlsRecovery(detail);
        }}
        @can-play=${() => this.#confirm("can-play")}
        @playing=${() => this.#confirm("playing")}
        @pause=${() => this.#onPause()}
        @error=${() => setPlaybackState("error")}
      >
        <media-provider></media-provider>
      </media-player>
      ${showPoster
        ? this._posterKind === "snapshot"
          ? html`<img class="poster" src=${this._poster ?? ""} alt="" />`
          : html`<div class="poster-frame"><img src=${this._poster ?? ""} alt="" /></div>`
        : ""}
    `;
  }
}

customElements.define("telstar-player", TelstarPlayer);
