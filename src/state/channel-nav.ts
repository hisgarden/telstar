/**
 * Cyclic channel stepping — drives lock-screen ⏭ / ⏮ (and channel up/down).
 *
 * The Media Session transport buttons map "next/previous track" onto the next/
 * previous channel in the loaded list, so a viewer can change channel from the
 * lock screen or a headset without unlocking. Pure over the channel list and the
 * current URL, like `number-nav` — the player turns the resolved URL into
 * playback by writing `currentSource` (the agent-native seam).
 */
import type { Channel } from "../model/channel";

/**
 * Resolve the URL of the channel `delta` steps from `currentUrl` within `list`,
 * wrapping around both ends. Returns null only when the list is empty. When the
 * current URL isn't in the list (e.g. the demo stream), stepping starts from the
 * first channel.
 */
export function stepChannel(
  list: Channel[],
  currentUrl: string | null,
  delta: number,
): string | null {
  if (list.length === 0) return null;
  const idx = list.findIndex((c) => c.url === currentUrl);
  if (idx === -1) return list[0].url; // unknown current → start at the top
  const len = list.length;
  const next = (((idx + delta) % len) + len) % len; // wrap, including negatives
  return list[next].url;
}

/** The next channel after `currentUrl`, wrapping to the first. */
export function nextChannel(list: Channel[], currentUrl: string | null): string | null {
  return stepChannel(list, currentUrl, 1);
}

/** The previous channel before `currentUrl`, wrapping to the last. */
export function prevChannel(list: Channel[], currentUrl: string | null): string | null {
  return stepChannel(list, currentUrl, -1);
}
