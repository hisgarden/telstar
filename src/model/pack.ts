/**
 * Curated pack model — the World News pack (and the future Regional/Local list).
 *
 * A pack is a small, curated manifest of official channels with verified live
 * HLS URLs, shipped bundled (and, later, refreshed via a remote overlay — U4,
 * deferred). Unlike user/iptv-org playlists, pack URLs are held to a stricter
 * trust boundary: https-only (`isHttpsOnly`), a required alpha-2 `country` (it
 * drives the broadcaster clock) and a required `funding` model (surfaced as a
 * YouTube-style footnote), plus a hard entry cap. Parsing is defensive —
 * invalid entries are dropped, never thrown — so a malformed or partial
 * manifest degrades to whatever valid subset it carries.
 */
import { isHttpsOnly } from "../state/source";

/** Funding model, mapped to YouTube's publisher-funding wording in the UI. */
export type Funding = "public-broadcaster" | "state-funded" | "commercial" | "newswire";

const FUNDINGS: ReadonlySet<string> = new Set<Funding>([
  "public-broadcaster",
  "state-funded",
  "commercial",
  "newswire",
]);

export interface PackChannel {
  /** Display name. */
  name: string;
  /** Verified official live-HLS URL (https only). */
  url: string;
  /** tvg-id — the dedup + enrichment join key. */
  id: string;
  /** Lowercase ISO-3166 alpha-2 country (drives the broadcaster clock). */
  country: string;
  /** Funding model (surfaced as a YouTube-style funding footnote). */
  funding: Funding;
  /** Category tags (e.g. ["news"], ["business"]). */
  categories: string[];
  /** Logo URL, optional. */
  logo?: string;
}

export interface PackManifest {
  /** Monotonic version (used by the deferred remote-overlay rollback guard, U4). */
  version: number;
  channels: PackChannel[];
  /** tvg-ids to retire — overlay tombstones; empty for the bundled baseline. */
  removed: string[];
}

/** Hard cap on entries — defends against an inflated/oversized manifest. */
export const MAX_PACK_ENTRIES = 1000;

/** The i18n message key for a funding model's footnote (interpolates {country}). */
export type FundingFootnoteKey = "fundingPublic" | "fundingState";

/**
 * The i18n key for a channel's funding footnote, mirroring YouTube's
 * publisher-funding wording, or null when none applies (commercial / newswire /
 * unknown — like YouTube, which shows no panel for those). The caller localizes
 * it with `t(key, { country })` so the whole sentence — not just the country
 * name — follows the UI locale. The label describes funding, not editorial
 * direction (YouTube's own disclaimer applies — see docs/curation.md).
 */
export function fundingFootnoteKey(funding: string | undefined): FundingFootnoteKey | null {
  switch (funding) {
    case "public-broadcaster":
      return "fundingPublic";
    case "state-funded":
      return "fundingState";
    default:
      return null;
  }
}

function isAlpha2(s: unknown): s is string {
  // Case-insensitive: ISO-3166 alpha-2 is canonically uppercase, but we store
  // lowercase. Accept either and normalize on the way in.
  return typeof s === "string" && /^[a-z]{2}$/i.test(s);
}

function parseChannel(raw: unknown): PackChannel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || r.name.length === 0) return null;
  if (typeof r.url !== "string" || !isHttpsOnly(r.url)) return null;
  if (typeof r.id !== "string" || r.id.length === 0) return null;
  if (!isAlpha2(r.country)) return null;
  if (typeof r.funding !== "string" || !FUNDINGS.has(r.funding)) return null;
  const categories = Array.isArray(r.categories)
    ? r.categories.filter((c): c is string => typeof c === "string")
    : [];
  const channel: PackChannel = {
    name: r.name,
    url: r.url,
    id: r.id,
    country: r.country.toLowerCase(),
    funding: r.funding as Funding,
    categories,
  };
  if (typeof r.logo === "string") channel.logo = r.logo;
  return channel;
}

/**
 * Parse and validate a pack manifest from untrusted JSON. Drops invalid
 * channels; returns null only when the input is not a usable manifest object
 * or exceeds the entry cap. Never throws.
 */
export function parsePack(input: unknown): PackManifest | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.channels)) return null;
  if (obj.channels.length > MAX_PACK_ENTRIES) return null;
  // Version must be a non-negative integer (the deferred U4 rollback guard
  // compares versions; NaN/negative/float would defeat it). Else default to 0.
  const version =
    typeof obj.version === "number" && Number.isInteger(obj.version) && obj.version >= 0
      ? obj.version
      : 0;
  const channels = obj.channels
    .map(parseChannel)
    .filter((c): c is PackChannel => c !== null);
  const removed = Array.isArray(obj.removed)
    ? obj.removed.filter((x): x is string => typeof x === "string")
    : [];
  return { version, channels, removed };
}
