/**
 * Pack curation core (U2). Pure, immutable transforms over a PackManifest plus a
 * deterministic serializer. The serializer — not parsePack — owns the on-disk
 * format: parsePack is a lossy validator (it lowercases country, reorders keys,
 * drops unknown fields), so writing its output would churn the file. These
 * functions return new manifests; the on-disk write is validated through
 * parsePack but serialized here (KTD6).
 *
 * Tombstones are append-only (KTD4): a retired id never leaves `removed[]`, so
 * the deferred remote overlay can subtract a baseline channel.
 */
import { isHttpsOnly } from "../src/state/source";
import { parsePack, type PackManifest, type PackChannel } from "../src/model/pack";

/** Channel keys in their canonical on-disk order (matches public/packs/world-news.json). */
function orderChannel(c: PackChannel): Record<string, unknown> {
  const o: Record<string, unknown> = {
    name: c.name,
    id: c.id,
    country: c.country,
    funding: c.funding,
    categories: c.categories,
  };
  if (c.logo !== undefined) o.logo = c.logo;
  o.url = c.url;
  return o;
}

/** Serialize a manifest deterministically: fixed key order, 2-space indent, trailing newline. */
export function serializePack(pack: PackManifest): string {
  const ordered = {
    version: pack.version,
    removed: pack.removed,
    channels: pack.channels.map(orderChannel),
  };
  return JSON.stringify(ordered, null, 2) + "\n";
}

/** Retire a channel: drop from channels, append the id to removed[] (no duplicates), bump version. */
export function retire(pack: PackManifest, id: string): PackManifest {
  const hadChannel = pack.channels.some((c) => c.id === id);
  const alreadyRemoved = pack.removed.includes(id);
  if (!hadChannel && alreadyRemoved) return pack; // nothing to do — no spurious bump
  return {
    version: pack.version + 1,
    channels: pack.channels.filter((c) => c.id !== id),
    removed: alreadyRemoved ? pack.removed : [...pack.removed, id],
  };
}

/** Swap a channel's URL (https-only), bump version. No-op if unchanged. */
export function setUrl(pack: PackManifest, id: string, url: string): PackManifest {
  if (!isHttpsOnly(url)) throw new Error(`Refusing non-https url for ${id}: ${url}`);
  let changed = false;
  const channels = pack.channels.map((c) => {
    if (c.id === id && c.url !== url) {
      changed = true;
      return { ...c, url };
    }
    return c;
  });
  if (!changed) return pack;
  return { ...pack, version: pack.version + 1, channels };
}

/**
 * Add a channel, validated through parsePack (invalid → throws), bump version.
 * Rejects a duplicate id already in channels[] — a blind append would corrupt
 * the roster with two entries sharing a tvg-id (the dedup/enrichment join key).
 * A tombstoned id (in removed[] only) is allowed: adding it un-retires the
 * channel while the append-only tombstone is preserved (KTD4).
 */
export function addChannel(pack: PackManifest, channel: PackChannel): PackManifest {
  const validated = parsePack({ version: 0, removed: [], channels: [channel] });
  if (!validated || validated.channels.length !== 1) {
    throw new Error(`Invalid channel rejected: ${channel?.id ?? "(no id)"}`);
  }
  const added = validated.channels[0];
  if (pack.channels.some((c) => c.id === added.id)) {
    throw new Error(`Refusing to add duplicate id already in the roster: ${added.id}`);
  }
  return {
    ...pack,
    version: pack.version + 1,
    channels: [...pack.channels, added],
  };
}

/** A batch of roster edits, applied in a fixed order by applyEdits. */
export interface PackEdits {
  setUrls?: Array<[string, string]>;
  retires?: string[];
  adds?: PackChannel[];
}

/**
 * Apply a batch of roster edits in a fixed, deterministic order — set-urls,
 * then retires, then adds — composing the single-edit transforms. Order matters
 * only when the same id is both retired and re-added in one call: retire-then-add
 * leaves the channel present with its id still tombstoned (an explicit re-point).
 * Returns the same pack object unchanged when no edits are supplied.
 */
export function applyEdits(pack: PackManifest, edits: PackEdits): PackManifest {
  let next = pack;
  for (const [id, url] of edits.setUrls ?? []) next = setUrl(next, id, url);
  for (const id of edits.retires ?? []) next = retire(next, id);
  for (const channel of edits.adds ?? []) next = addChannel(next, channel);
  return next;
}
