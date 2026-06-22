/**
 * Grid logic (R5) — paging and the single-preview hover reducer.
 *
 * Pure functions the grid component drives. The single-preview reducer enforces
 * the "only one cell plays live" invariant: leaving a cell clears the preview
 * only if that cell was the active one, so entering B then leaving A can't
 * clear B's preview.
 */

/** Max cells per page (8×8 on a 14" screen). */
export const PAGE_SIZE = 64;

/** Number of pages for `total` items (minimum 1). */
export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** The slice of `items` for `page` (clamped into range). */
export function pageOf<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  const clamped = Math.max(0, Math.min(page, pageCount(items.length, size) - 1));
  return items.slice(clamped * size, clamped * size + size);
}

/** Hovering `url` makes it the (sole) preview. */
export function hoverEnter(_current: string | null, url: string): string | null {
  return url;
}

/** Leaving `url` clears the preview only if `url` was the active one. */
export function hoverLeave(current: string | null, url: string): string | null {
  return current === url ? null : current;
}
