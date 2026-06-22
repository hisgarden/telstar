/**
 * Number-key navigation (R8) — TV-remote-style jump. Resolve a typed number to
 * a channel: by `tvg-chno` when the list carries channel numbers, otherwise by
 * 1-based position. The grid accumulates digits and commits on a short idle.
 */
import type { Channel } from "../model/channel";

/** Append a digit key to the buffer; returns null for non-digit keys (ignore). */
export function appendDigit(buffer: string, key: string): string | null {
  return /^[0-9]$/.test(key) ? buffer + key : null;
}

/**
 * Resolve a typed number to a channel. If any channel has a number, match by
 * number (no positional fallback — an unmatched number resolves to null). If
 * the list has no numbers at all, resolve by 1-based position.
 */
export function resolveChannel(channels: Channel[], typed: string): Channel | null {
  if (channels.length === 0 || typed === "") return null;
  const hasNumbers = channels.some((c) => c.number != null);
  if (hasNumbers) {
    return channels.find((c) => c.number === typed) ?? null;
  }
  const index = Number(typed) - 1;
  return Number.isInteger(index) && index >= 0 && index < channels.length
    ? channels[index]
    : null;
}
