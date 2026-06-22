/**
 * Recents list helper — most-recent-first, de-duplicated, optionally capped.
 * Used for both selection recency (list "recent on top") and the played
 * channels hotbar. Pure.
 */
export function pushRecent(list: string[], url: string, cap = Infinity): string[] {
  return [url, ...list.filter((u) => u !== url)].slice(0, cap);
}
