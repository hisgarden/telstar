/**
 * The channel model — the unit the loader produces and the list/grid consume.
 *
 * `language` and `availability` are first-class fields by design: the deferred
 * language-first browse and availability probe depend on them. In this layer
 * `availability` is always "unknown" (nothing probes yet) and `language` may be
 * null (those channels group under "Unknown language").
 */

/** Playback availability of a channel's stream. "unknown" until probed. */
export type PlaybackAvailability = "unknown" | "live" | "slow" | "dead";

export interface Channel {
  /** Stable channel id (tvg-id) — the join key for metadata enrichment; null if absent. */
  id: string | null;
  /** Display name (from the EXTINF text, falling back to tvg-name). */
  name: string;
  /** Logo URL (tvg-logo) or null. */
  logo: string | null;
  /** Country code/name (tvg-country) or null. */
  country: string | null;
  /** Language (tvg-language) or null → "Unknown language" bucket. */
  language: string | null;
  /** Group / category (group-title or #EXTGRP) or null. */
  group: string | null;
  /** Channel number (tvg-chno) or null. Supports future number-key nav. */
  number: string | null;
  /** Validated stream URL. */
  url: string;
  /** Probe result; "unknown" in this layer. */
  availability: PlaybackAvailability;
  /** Genre/category tags (from iptv-org enrichment); empty until enriched. */
  categories: string[];
  /** Funding model — set only for curated-pack channels; surfaced as a YouTube-style footnote. */
  funding?: string;
}

export const INITIAL_AVAILABILITY: PlaybackAvailability = "unknown";
