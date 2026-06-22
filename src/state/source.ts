/**
 * Zero-trust source validation (R11).
 *
 * A stream/playlist URL is untrusted input — in the product it arrives from
 * user-supplied M3U files. Only http(s) URLs may ever become a playable
 * source; `file:`, `javascript:`, `data:`, `blob:`, and malformed input are
 * rejected here, before they can reach the player. Playlists are data, never
 * code. `setValidatedSource` is the only sanctioned path to set a source.
 */
import { setCurrentSource } from "./signals";

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:"]);

/** True only for well-formed URLs whose scheme is on the allowlist. */
export function isAllowedSource(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return ALLOWED_SCHEMES.has(parsed.protocol);
}

/**
 * Stricter than `isAllowedSource`: https only. Used for the curated pack's
 * manifest and stream URLs, whose trust boundary must not tolerate cleartext
 * (unlike user/iptv-org playlists, which may legitimately carry http).
 */
export function isHttpsOnly(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:";
}

/**
 * Validate then set the current source. Returns true if the source was
 * allowed and applied; false if it was rejected (currentSource is left
 * unchanged). The single sanctioned entry point for changing what plays.
 */
export function setValidatedSource(url: string): boolean {
  if (!isAllowedSource(url)) return false;
  setCurrentSource(url);
  return true;
}
