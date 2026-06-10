/**
 * Media Session bridge — the lock-screen / Control Center "Now Playing" card.
 *
 * WebKit (iOS 15+) mirrors the W3C Media Session API onto the system transport
 * controls, so publishing channel metadata and wiring the play/pause/next/prev
 * handlers from JavaScript gives Telstar a podcast-style lock-screen card —
 * channel name, logo as cover art, and ⏭/⏮ mapped to channel up/down — with no
 * native MPNowPlayingInfoCenter code, keeping the minimal-native posture.
 *
 * The API surface we touch is declared structurally (`MediaSessionLike`,
 * injectable `MediaMetadata` ctor) so the wiring is pure and testable off-DOM;
 * the player passes the real `navigator.mediaSession` and `window.MediaMetadata`,
 * and every function no-ops when the platform lacks them.
 */

/** Transport actions we handle. A subset of the W3C `MediaSessionAction` union. */
export type TransportAction = "play" | "pause" | "nexttrack" | "previoustrack";

/** Playback status as the card understands it. */
export type CardPlaybackState = "none" | "paused" | "playing";

/** The slice of `navigator.mediaSession` we use — declared structurally for testability. */
export interface MediaSessionLike {
  metadata: unknown;
  playbackState: CardPlaybackState;
  setActionHandler(action: TransportAction, handler: (() => void) | null): void;
}

export interface MediaMetadataInit {
  title: string;
  artist: string;
  artwork: { src: string }[];
}

/** Constructor shape of `window.MediaMetadata`, injected so tests need no DOM. */
export type MediaMetadataCtor = new (init: MediaMetadataInit) => unknown;

/** What the card shows for the current channel. */
export interface NowPlaying {
  title: string;
  artist: string;
  logo: string | null;
}

/** The transport handlers the player binds once. */
export interface Transport {
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
}

/** Cover-art array for the card — empty when the channel has no logo (never a broken image). */
export function artworkFor(logo: string | null): { src: string }[] {
  return logo ? [{ src: logo }] : [];
}

/**
 * Publish the current channel to the Now Playing card. No-op when the platform
 * has no Media Session or `MediaMetadata` (older iOS, non-WebKit) so callers stay
 * platform-agnostic.
 */
export function setNowPlaying(
  session: MediaSessionLike | null | undefined,
  metadataCtor: MediaMetadataCtor | null | undefined,
  np: NowPlaying,
): void {
  if (!session || !metadataCtor) return;
  session.metadata = new metadataCtor({
    title: np.title,
    artist: np.artist,
    artwork: artworkFor(np.logo),
  });
}

/** Wire the lock-screen / headset transport controls. Bind once. No-op without a session. */
export function bindTransport(
  session: MediaSessionLike | null | undefined,
  transport: Transport,
): void {
  if (!session) return;
  session.setActionHandler("play", transport.play);
  session.setActionHandler("pause", transport.pause);
  session.setActionHandler("nexttrack", transport.next);
  session.setActionHandler("previoustrack", transport.prev);
}

/** Mirror playback status onto the card (drives the play/pause glyph). No-op without a session. */
export function setCardPlaybackState(
  session: MediaSessionLike | null | undefined,
  state: CardPlaybackState,
): void {
  if (session) session.playbackState = state;
}
