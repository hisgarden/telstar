/**
 * Convert a resolved pack manifest into the app's `Channel[]`, ready for the
 * existing enrich → scan → grid pipeline. Categories are carried straight from
 * the pack (enrichment fills-only, so they survive); `language` is left null for
 * enrichment/scan to fill; availability starts "unknown" like any fresh load.
 */
import type { Channel } from "../model/channel";
import { INITIAL_AVAILABILITY } from "../model/channel";
import type { PackManifest } from "../model/pack";

export function packToChannels(pack: PackManifest): Channel[] {
  return pack.channels.map((c) => ({
    id: c.id,
    name: c.name,
    logo: c.logo ?? null,
    country: c.country,
    language: null,
    group: null,
    number: null,
    url: c.url,
    availability: INITIAL_AVAILABILITY,
    categories: c.categories,
    funding: c.funding,
  }));
}
