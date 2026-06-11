/**
 * In-house M3U/M3U8 parser. Converts untrusted playlist text into Channels.
 *
 * Every parsed stream URL is checked against the shared scheme allowlist
 * (zero-trust, R6); entries with a disallowed or malformed URL are excluded
 * from the playable set and counted as `rejected`. Unrecognized `#EXT`
 * directives are tolerated/ignored so real-world playlists parse cleanly.
 */
import { isAllowedSource } from "../state/source";
import { type Channel, INITIAL_AVAILABILITY } from "./channel";

export interface ParseResult {
  /** Channels with an allowed stream URL — the playable set. */
  channels: Channel[];
  /** Count of entries dropped for a disallowed/malformed URL. */
  rejected: number;
}

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

function parseAttributes(extinf: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(extinf)) !== null) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  return attrs;
}

function displayName(extinfLine: string): string {
  const comma = extinfLine.lastIndexOf(",");
  return comma >= 0 ? extinfLine.slice(comma + 1).trim() : "";
}

export function parseM3U(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];
  let rejected = 0;

  let pendingAttrs: Record<string, string> | null = null;
  let pendingName = "";
  let pendingGroup: string | null = null; // from a preceding #EXTGRP

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line === "#EXTM3U") continue;

    if (line.startsWith("#EXTGRP:")) {
      pendingGroup = line.slice("#EXTGRP:".length).trim() || null;
      continue;
    }

    if (line.startsWith("#EXTINF:")) {
      pendingAttrs = parseAttributes(line);
      pendingName = displayName(line);
      continue;
    }

    if (line.startsWith("#")) continue; // ignore other directives (#EXTVLCOPT, etc.)

    // A non-directive line is the URL for the pending entry.
    const url = line;
    const attrs = pendingAttrs ?? {};
    const name = pendingName || attrs["tvg-name"] || url;

    if (isAllowedSource(url)) {
      channels.push({
        id: attrs["tvg-id"] || null,
        name,
        logo: attrs["tvg-logo"] ?? null,
        country: attrs["tvg-country"] ?? null,
        language: attrs["tvg-language"] ?? null,
        group: attrs["group-title"] ?? pendingGroup ?? null,
        number: attrs["tvg-chno"] ?? null,
        url,
        availability: INITIAL_AVAILABILITY,
        categories: [],
      });
    } else {
      rejected += 1;
    }

    pendingAttrs = null;
    pendingName = "";
    pendingGroup = null;
  }

  return { channels, rejected };
}
