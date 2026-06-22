/**
 * Country code → flag emoji. iptv-org tvg-country is an ISO-3166-1 alpha-2 code
 * (e.g. "CN"); we render it as a flag in the now-playing bar and grid cells.
 * Anything that isn't a clean 2-letter code returns null so the caller can fall
 * back to the raw value (or nothing).
 */

/**
 * The country code embedded in an iptv-org tvg-id, or null. iptv-org ids are
 * `<Name>.<cc>` (e.g. "CNN.us", "BBCNews.uk"), optionally with an "@feed"
 * suffix — so the country is the 2-letter segment after the last dot of the
 * base id. Used to split a per-language list by region.
 */
export function countryOfId(id: string | null): string | null {
  if (!id) return null;
  const base = id.split("@")[0];
  const m = /\.([a-z]{2})$/i.exec(base);
  return m ? m[1].toLowerCase() : null;
}

const REGIONAL_INDICATOR_A = 0x1f1e6;

/**
 * The geography badge for a channel's country: the flag emoji when the viewer
 * has opted into flags, otherwise the neutral uppercase code (e.g. "US", "TW").
 * Null when there's no country. Keeping the default neutral avoids taking a
 * position on contested regions.
 */
export function countryLabel(country: string | null, withFlag: boolean): string | null {
  if (!country) return null;
  if (withFlag) return countryFlag(country) ?? country.trim().toUpperCase();
  return country.trim().toUpperCase();
}

/** The flag emoji for an alpha-2 country code, or null if not a clean 2-letter code. */
export function countryFlag(country: string | null): string | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    REGIONAL_INDICATOR_A + (code.charCodeAt(0) - 65),
    REGIONAL_INDICATOR_A + (code.charCodeAt(1) - 65),
  );
}
