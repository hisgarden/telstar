/**
 * List-language tagging (R9). iptv-org per-language playlists carry no
 * per-entry `tvg-language` — the language is the file (`…/languages/<iso-639-3>.m3u`).
 * We derive the list language from that URL pattern when recognizable, and tag
 * untagged channels with it so they group by language instead of "Unknown
 * language." Language is never inferred from channel names/content (unreliable).
 */
import type { Channel } from "./channel";

/** ISO-639-3 → display name. Common languages; unknown codes degrade to the raw code. */
const ISO_639_3: Record<string, string> = {
  zho: "Chinese",
  cmn: "Mandarin Chinese",
  yue: "Cantonese",
  nan: "Min Nan",
  bod: "Tibetan",
  uig: "Uyghur",
  hmn: "Hmong",
  eng: "English",
  spa: "Spanish",
  ara: "Arabic",
  hin: "Hindi",
  fra: "French",
  por: "Portuguese",
  rus: "Russian",
  jpn: "Japanese",
  kor: "Korean",
  deu: "German",
  ita: "Italian",
  vie: "Vietnamese",
  tha: "Thai",
  tur: "Turkish",
  fas: "Persian",
  urd: "Urdu",
  ben: "Bengali",
  tam: "Tamil",
  pan: "Punjabi",
  ind: "Indonesian",
  nld: "Dutch",
  pol: "Polish",
  ukr: "Ukrainian",
};

/**
 * ISO-639-3 → BCP-47 so the platform `Intl.DisplayNames` can localize the name
 * into any UI locale. Codes absent here are passed through (Intl accepts many
 * 3-letter codes, e.g. cmn/yue), then degrade to the English name.
 */
const ISO_639_3_TO_BCP47: Record<string, string> = {
  eng: "en",
  zho: "zh",
  cmn: "zh",
  yue: "yue",
  nan: "nan",
  spa: "es",
  ara: "ar",
  hin: "hi",
  fra: "fr",
  por: "pt",
  rus: "ru",
  jpn: "ja",
  kor: "ko",
  deu: "de",
  ita: "it",
  vie: "vi",
  tha: "th",
  tur: "tr",
  fas: "fa",
  urd: "ur",
  ben: "bn",
  tam: "ta",
  pan: "pa",
  ind: "id",
  nld: "nl",
  pol: "pl",
  ukr: "uk",
  bod: "bo",
  uig: "ug",
  hmn: "hmn",
};

/** Uppercase the first character (locale-aware); a no-op for caseless scripts. */
function capitalize(s: string, locale: string): string {
  return s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s;
}

/** English display name → ISO-639-3 code (reverse of ISO_639_3), built once. */
const CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_639_3).map(([code, name]) => [name, code]),
);

/** Map an ISO-639-3 code to its display name; unknown codes degrade to the raw code. */
export function languageName(code: string): string {
  return ISO_639_3[code.toLowerCase()] ?? code;
}

/**
 * Render a language name in the active UI locale via the platform
 * `Intl.DisplayNames` — so it reads in the language the user understands, in
 * any of the supported locales (English UI → "Chinese"; 简体中文 → "中文";
 * العربية → "الصينية"; 日本語 → "中国語"). Accepts an English display name (how
 * channels are tagged) or an ISO-639-3 code; degrades to the English name, then
 * the input, never blank.
 */
export function localizedLanguageName(nameOrCode: string, locale: string): string {
  const code = CODE_BY_NAME[nameOrCode] ?? nameOrCode.toLowerCase();
  const bcp47 = ISO_639_3_TO_BCP47[code] ?? code;
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([locale], { type: "language", fallback: "none" }).of(bcp47);
  } catch {
    name = undefined;
  }
  return capitalize(name ?? ISO_639_3[code] ?? nameOrCode, locale);
}

const IPTV_ORG_LANG_RE = /\/languages\/([a-z]{2,3})\.m3u8?$/i;
const BARE_CODE_RE = /(?:^|\/)([a-z]{2,3})\.m3u8?$/i;

/**
 * Derive a display language from a playlist source. Recognizes the iptv-org
 * per-language URL (`…/languages/<code>.m3u`, mapping known codes and degrading
 * unknown ones to the raw code) and a bare `<code>.m3u` filename (e.g. a local
 * `zho.m3u`) — but the bare form only matches *known* ISO codes, to avoid
 * mis-tagging an arbitrarily-named file. Returns null when nothing matches.
 */
export function languageFromSourceUrl(source: string): string | null {
  const langPath = IPTV_ORG_LANG_RE.exec(source);
  if (langPath) {
    const code = langPath[1].toLowerCase();
    return ISO_639_3[code] ?? code;
  }
  const bare = BARE_CODE_RE.exec(source);
  if (bare) {
    const code = bare[1].toLowerCase();
    if (ISO_639_3[code]) return ISO_639_3[code];
  }
  return null;
}

/**
 * Tag channels that have no language with `language`. Already-tagged channels
 * are left as-is. A null `language` is a no-op (returns the input unchanged).
 */
export function tagChannelsLanguage(channels: Channel[], language: string | null): Channel[] {
  if (language == null) return channels;
  return channels.map((c) => (c.language == null ? { ...c, language } : c));
}
