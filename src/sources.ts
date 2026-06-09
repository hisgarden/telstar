/**
 * Browse-by-language sources (R12). Each button pulls in all available IPTV
 * channels for a language; clicking loads it through fetch → parse → enrich →
 * scan. A source may merge several per-language playlists (e.g. "Chinese" =
 * Mandarin + Cantonese + Chinese) — the channels keep their own language tag,
 * so the in-app language chips still distinguish them within the merged list.
 *
 * Chinese leads (diaspora focus), then major world languages; the rest follow.
 * Display names come from the shared ISO-639-3 map.
 */
import { languageName } from "./model/language";

/** Synthetic loaded-source key for the curated World News pack (shared by the loader + picker). */
export const WORLD_NEWS_PACK_KEY = "pack:world-news";

export interface BrowseSource {
  /** Stable browse key (for favorites). */
  key: string;
  /** Display name. */
  name: string;
  /** One or more per-language playlist URLs (merged + de-duplicated when >1). */
  urls: string[];
  /** Region filter (tvg-id country suffixes) for sliced sources like English (US). */
  idCountries?: string[];
}

const L = "https://iptv-org.github.io/iptv/languages";
const lang = (code: string) => `${L}/${code}.m3u`;

export const BROWSE_SOURCES: BrowseSource[] = [
  // English split by region (same eng.m3u, filtered by tvg-id country).
  { key: "eng-us", name: "English (US)", urls: [lang("eng")], idCountries: ["us"] },
  { key: "eng-uk", name: "English (UK)", urls: [lang("eng")], idCountries: ["uk"] },
  {
    key: "eng-apac",
    name: "English (Asia Pacific)",
    urls: [lang("eng")],
    idCountries: ["au", "nz", "sg", "my", "ph", "hk", "pg", "ws", "fj", "gu"],
  },
  // Chinese family merged into one list (Mandarin + Cantonese + Chinese).
  { key: "chinese", name: "Chinese", urls: [lang("zho"), lang("cmn"), lang("yue")] },
  // Major world languages.
  { key: "spa", name: languageName("spa"), urls: [lang("spa")] },
  { key: "fra", name: languageName("fra"), urls: [lang("fra")] },
  { key: "ita", name: languageName("ita"), urls: [lang("ita")] },
  { key: "deu", name: languageName("deu"), urls: [lang("deu")] },
  { key: "ara", name: languageName("ara"), urls: [lang("ara")] },
  { key: "por", name: languageName("por"), urls: [lang("por")] },
  { key: "rus", name: languageName("rus"), urls: [lang("rus")] },
  { key: "kor", name: languageName("kor"), urls: [lang("kor")] },
  { key: "jpn", name: languageName("jpn"), urls: [lang("jpn")] },
  { key: "hin", name: languageName("hin"), urls: [lang("hin")] },
  { key: "vie", name: languageName("vie"), urls: [lang("vie")] },
  { key: "tha", name: languageName("tha"), urls: [lang("tha")] },
  { key: "tur", name: languageName("tur"), urls: [lang("tur")] },
  { key: "fas", name: languageName("fas"), urls: [lang("fas")] },
  { key: "ind", name: languageName("ind"), urls: [lang("ind")] },
  { key: "nld", name: languageName("nld"), urls: [lang("nld")] },
  { key: "pol", name: languageName("pol"), urls: [lang("pol")] },
  { key: "ukr", name: languageName("ukr"), urls: [lang("ukr")] },
  { key: "ben", name: languageName("ben"), urls: [lang("ben")] },
  { key: "tam", name: languageName("tam"), urls: [lang("tam")] },
  { key: "pan", name: languageName("pan"), urls: [lang("pan")] },
  { key: "urd", name: languageName("urd"), urls: [lang("urd")] },
  // Other Chinese-family / regional languages (kept separate from the merged list).
  { key: "nan", name: languageName("nan"), urls: [lang("nan")] },
  { key: "bod", name: languageName("bod"), urls: [lang("bod")] },
  { key: "uig", name: languageName("uig"), urls: [lang("uig")] },
  { key: "hmn", name: languageName("hmn"), urls: [lang("hmn")] },
];

/**
 * Browse-by-language list for the source dropdown: the same sources but with the
 * regional English variants collapsed into a single "English" that loads all
 * English channels. Region is narrowed afterward via the channel-list's country
 * filter — the dropdown stays one entry per language the user understands.
 */
export const BROWSE_SOURCES_PRIMARY: BrowseSource[] = [
  { key: "eng", name: "English", urls: [lang("eng")] },
  ...BROWSE_SOURCES.filter((s) => !s.key.startsWith("eng-")),
];

/**
 * Decide how the picker handles a language pick. "narrow" filters the loaded
 * list in place (no fetch); "load" fetches the language's full playlists.
 *
 * Narrowing only makes sense when the loaded source IS a language source.
 * The curated World News pack carries a few enrichment-tagged channels per
 * language, so member presence there must not stand in for the language's
 * full catalog — picking "Chinese" over the pack loads all Chinese channels,
 * not the pack's handful of Chinese news feeds. (Before enrichment fills
 * languages the pack has none and the load path was taken anyway; this makes
 * the post-enrichment behavior identical instead of timing-dependent.)
 */
export function languagePickAction(
  loadedSourceKey: string | null,
  loadedMembers: string[],
): "narrow" | "load" {
  if (loadedSourceKey === WORLD_NEWS_PACK_KEY) return "load";
  return loadedMembers.length > 0 ? "narrow" : "load";
}
