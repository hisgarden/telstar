/**
 * Channel selection and grouping — the logic the channel list UI drives.
 *
 * Selection routes through the zero-trust validated setter, so a channel whose
 * URL somehow isn't on the allowlist can never become the playing source
 * (defense in depth; the parser already excludes such URLs). Grouping buckets
 * null-language channels under "Unknown language" for the language-first view.
 */
import { setValidatedSource } from "./source";
import { recordSelection } from "./signals";
import type { Channel } from "../model/channel";

export const UNKNOWN_LANGUAGE = "Unknown language";

export interface LanguageGroup {
  language: string;
  channels: Channel[];
}

/**
 * Play a channel by setting it as the current source (validated). Returns true
 * if it was accepted, false if its URL was rejected.
 */
export function selectChannel(channel: Channel): boolean {
  const ok = setValidatedSource(channel.url);
  if (ok) recordSelection(channel.url);
  return ok;
}

/**
 * Order channels with the most-recently-selected first (by `recent`, most-recent
 * first), preserving the input order for everything else. Pure.
 */
export function orderByRecency(channels: Channel[], recent: string[]): Channel[] {
  const rank = new Map(recent.map((url, i) => [url, i]));
  const recents: Channel[] = [];
  const rest: Channel[] = [];
  for (const c of channels) (rank.has(c.url) ? recents : rest).push(c);
  recents.sort((a, b) => rank.get(a.url)! - rank.get(b.url)!);
  return [...recents, ...rest];
}

/**
 * Group channels by language, preserving encounter order within each group and
 * across groups. Channels with no language fall under "Unknown language".
 */
export function groupByLanguage(list: Channel[]): LanguageGroup[] {
  const order: string[] = [];
  const byLang = new Map<string, Channel[]>();
  for (const c of list) {
    const lang = c.language ?? UNKNOWN_LANGUAGE;
    if (!byLang.has(lang)) {
      byLang.set(lang, []);
      order.push(lang);
    }
    byLang.get(lang)!.push(c);
  }
  return order.map((language) => ({ language, channels: byLang.get(language)! }));
}
