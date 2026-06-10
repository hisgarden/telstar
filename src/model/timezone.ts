/**
 * Language → home-city clock. Shows the time where a language's channels
 * broadcast from, so a viewer knows the local time of what they're watching
 * (Beijing for Chinese, Seoul for Korean, Tokyo for Japanese, …). Keyed by the
 * display-language names the channel model uses (see model/language.ts).
 */
export interface LanguageClock {
  city: string;
  timeZone: string;
}

const CITY_BY_LANGUAGE: Record<string, LanguageClock> = {
  Chinese: { city: "Beijing", timeZone: "Asia/Shanghai" },
  "Mandarin Chinese": { city: "Beijing", timeZone: "Asia/Shanghai" },
  Cantonese: { city: "Hong Kong", timeZone: "Asia/Hong_Kong" },
  "Min Nan": { city: "Taipei", timeZone: "Asia/Taipei" },
  // Tibetan and Uyghur are intentionally omitted: pairing a contested-region
  // city with a national timezone reads as a political claim, and these are
  // diaspora-spread languages with no single uncontested "home" clock. They
  // simply show no clock rather than a loaded one.
  Korean: { city: "Seoul", timeZone: "Asia/Seoul" },
  Japanese: { city: "Tokyo", timeZone: "Asia/Tokyo" },
  English: { city: "London", timeZone: "Europe/London" },
  Spanish: { city: "Madrid", timeZone: "Europe/Madrid" },
  Arabic: { city: "Cairo", timeZone: "Africa/Cairo" },
  Hindi: { city: "New Delhi", timeZone: "Asia/Kolkata" },
  Portuguese: { city: "Lisbon", timeZone: "Europe/Lisbon" },
  French: { city: "Paris", timeZone: "Europe/Paris" },
  German: { city: "Berlin", timeZone: "Europe/Berlin" },
  Russian: { city: "Moscow", timeZone: "Europe/Moscow" },
  Vietnamese: { city: "Hanoi", timeZone: "Asia/Ho_Chi_Minh" },
  Thai: { city: "Bangkok", timeZone: "Asia/Bangkok" },
  Turkish: { city: "Istanbul", timeZone: "Europe/Istanbul" },
  Persian: { city: "Tehran", timeZone: "Asia/Tehran" },
  Urdu: { city: "Karachi", timeZone: "Asia/Karachi" },
  Bengali: { city: "Dhaka", timeZone: "Asia/Dhaka" },
  Tamil: { city: "Chennai", timeZone: "Asia/Kolkata" },
  Punjabi: { city: "Lahore", timeZone: "Asia/Karachi" },
  Indonesian: { city: "Jakarta", timeZone: "Asia/Jakarta" },
  Dutch: { city: "Amsterdam", timeZone: "Europe/Amsterdam" },
  Polish: { city: "Warsaw", timeZone: "Europe/Warsaw" },
  Ukrainian: { city: "Kyiv", timeZone: "Europe/Kyiv" },
  Italian: { city: "Rome", timeZone: "Europe/Rome" },
};

/** The home-city clock for a display-language name, or null if unmapped. */
export function clockForLanguage(language: string | null): LanguageClock | null {
  return language ? (CITY_BY_LANGUAGE[language] ?? null) : null;
}

// Representative city per country — used when the language spans many countries
// (e.g. English), so the clock follows where the channels actually are. These
// are single anchors for multi-zone regions.
const CITY_BY_COUNTRY: Record<string, LanguageClock> = {
  us: { city: "Washington, D.C.", timeZone: "America/New_York" },
  uk: { city: "London", timeZone: "Europe/London" },
  gb: { city: "London", timeZone: "Europe/London" },
  au: { city: "Sydney", timeZone: "Australia/Sydney" },
  nz: { city: "Auckland", timeZone: "Pacific/Auckland" },
  ca: { city: "Toronto", timeZone: "America/Toronto" },
  ie: { city: "Dublin", timeZone: "Europe/Dublin" },
  sg: { city: "Singapore", timeZone: "Asia/Singapore" },
  my: { city: "Kuala Lumpur", timeZone: "Asia/Kuala_Lumpur" },
  ph: { city: "Manila", timeZone: "Asia/Manila" },
  hk: { city: "Hong Kong", timeZone: "Asia/Hong_Kong" },
  in: { city: "New Delhi", timeZone: "Asia/Kolkata" },
  za: { city: "Johannesburg", timeZone: "Africa/Johannesburg" },
  // World News pack broadcaster countries.
  jp: { city: "Tokyo", timeZone: "Asia/Tokyo" },
  de: { city: "Berlin", timeZone: "Europe/Berlin" },
  fr: { city: "Paris", timeZone: "Europe/Paris" },
  qa: { city: "Doha", timeZone: "Asia/Qatar" },
  kr: { city: "Seoul", timeZone: "Asia/Seoul" },
  cn: { city: "Beijing", timeZone: "Asia/Shanghai" },
};

/** The representative city clock for an ISO-3166 country code, or null if unmapped. */
export function clockForCountry(code: string | null): LanguageClock | null {
  return code ? (CITY_BY_COUNTRY[code.toLowerCase()] ?? null) : null;
}

export interface ResolvedClock {
  /** The lead clock to show, or null when neither the playing channel nor the dominant load resolves. */
  clock: LanguageClock | null;
  /** True when `clock` is the currently-playing broadcaster's — render it BEFORE local time. */
  broadcasterLed: boolean;
}

/**
 * Decide which clock leads the viewer bar. When a channel is playing and its
 * country resolves to a known capital, that broadcaster clock leads (shown
 * before the viewer's local time). Otherwise fall back to the dominant-load
 * clock (English follows its dominant country; other languages use their home
 * city), shown after local time as before. Pure and testable.
 */
export function resolveClock(opts: {
  playingCountry: string | null;
  dominantLanguage: string | null;
  dominantCountry: string | null;
}): ResolvedClock {
  const playing = clockForCountry(opts.playingCountry);
  if (playing) return { clock: playing, broadcasterLed: true };
  const fallback =
    (opts.dominantLanguage === "English" ? clockForCountry(opts.dominantCountry) : null) ??
    clockForLanguage(opts.dominantLanguage) ??
    clockForCountry(opts.dominantCountry);
  return { clock: fallback, broadcasterLed: false };
}

/** Current HH:MM in a timezone, always 24-hour (00–23, no AM/PM). */
export function formatTime(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/** GMT offset label for a timezone (e.g. "GMT+8"). */
export function gmtOffset(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(now);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
}

/**
 * Localized names for the representative cities, so the clock reads in the UI
 * language (e.g. "Berlin" → "柏林" in Chinese). Cities are used deliberately
 * (not countries) to avoid political claims. Simplified/Traditional Chinese are
 * provided; other locales fall back to the English city name (a baseline —
 * contributions welcome).
 */
const CITY_I18N: Record<string, Record<string, string>> = {
  "zh-Hans": {
    Amsterdam: "阿姆斯特丹", Auckland: "奥克兰", Bangkok: "曼谷", Beijing: "北京",
    Berlin: "柏林", Cairo: "开罗", Chennai: "金奈", Dhaka: "达卡", Doha: "多哈", Dublin: "都柏林",
    Hanoi: "河内", "Hong Kong": "香港", Istanbul: "伊斯坦布尔", Jakarta: "雅加达",
    Johannesburg: "约翰内斯堡", Karachi: "卡拉奇", "Kuala Lumpur": "吉隆坡",
    Kyiv: "基辅", Lahore: "拉合尔", Lisbon: "里斯本", London: "伦敦", Madrid: "马德里",
    Manila: "马尼拉", Moscow: "莫斯科", "New Delhi": "新德里", Paris: "巴黎", Rome: "罗马",
    Seoul: "首尔", Singapore: "新加坡", Sydney: "悉尼", Taipei: "台北", Tehran: "德黑兰",
    Tokyo: "东京", Toronto: "多伦多", Warsaw: "华沙", "Washington, D.C.": "华盛顿",
  },
  "zh-Hant": {
    Amsterdam: "阿姆斯特丹", Auckland: "奧克蘭", Bangkok: "曼谷", Beijing: "北京",
    Berlin: "柏林", Cairo: "開羅", Chennai: "清奈", Dhaka: "達卡", Doha: "杜哈", Dublin: "都柏林",
    Hanoi: "河內", "Hong Kong": "香港", Istanbul: "伊斯坦堡", Jakarta: "雅加達",
    Johannesburg: "約翰尼斯堡", Karachi: "喀拉蚩", "Kuala Lumpur": "吉隆坡",
    Kyiv: "基輔", Lahore: "拉合爾", Lisbon: "里斯本", London: "倫敦", Madrid: "馬德里",
    Manila: "馬尼拉", Moscow: "莫斯科", "New Delhi": "新德里", Paris: "巴黎", Rome: "羅馬",
    Seoul: "首爾", Singapore: "新加坡", Sydney: "雪梨", Taipei: "台北", Tehran: "德黑蘭",
    Tokyo: "東京", Toronto: "多倫多", Warsaw: "華沙", "Washington, D.C.": "華盛頓",
  },
};

/** The representative city's name in the given UI locale (English fallback). */
export function localizedCity(city: string, locale: string): string {
  return CITY_I18N[locale]?.[city] ?? city;
}
