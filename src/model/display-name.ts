/**
 * Short display name for tight UI (Recent hotbar chips). Strips resolution /
 * quality markers — "(1080p)", "720i", "HD", "[Not 24/7]" — and the standalone
 * word "TV", while preserving acronyms like CCTV, TVB, tvN. Falls back to the
 * original if shortening would empty it.
 */
export function shortenChannelName(name: string): string {
  const short = name
    .replace(/\[[^\]]*\]/g, " ") // [Not 24/7], [Geo-blocked]
    .replace(/\([^)]*\b(?:\d{3,4}[pi]|FHD|UHD|HD|SD|4K)\b[^)]*\)/gi, " ") // (1080p), (720p HD)
    .replace(/\b(?:\d{3,4}[pi]|FHD|UHD|HD|SD|4K)\b/gi, " ") // bare 1080p / HD
    .replace(/\bTV\b/g, " ") // standalone "TV" only (CCTV / TVB / tvN kept)
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*[-–·:]\s*/, "")
    .replace(/\s*[-–·:]\s*$/, "")
    .trim();
  return short.length ? short : name.trim();
}
