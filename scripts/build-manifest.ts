#!/usr/bin/env bun
/**
 * Remote manifest builder (U3). Emits the publishable overlay manifest from the
 * canonical pack to a TRACKED path (`manifest/`, not the gitignored `dist/`), so
 * its diff is reviewable in the merge request. In v1 the manifest mirrors the
 * bundled pack (same PackManifest shape, same deterministic serializer); the
 * deferred consumer overlays it on the baseline.
 *
 * Usage: bun scripts/build-manifest.ts [src-pack.json] [out-manifest.json]
 */
import { parsePack, type PackManifest } from "../src/model/pack";
import { serializePack } from "./curate";

/** Build the publishable remote-manifest text from a canonical pack. */
export function buildManifest(pack: PackManifest): string {
  return serializePack(pack);
}

if (import.meta.main) {
  const src = process.argv[2] ?? "public/packs/world-news.json";
  const out = process.argv[3] ?? "manifest/world-news.json";
  const pack = parsePack(JSON.parse(await Bun.file(src).text()));
  if (!pack) {
    console.error(`Invalid or unreadable pack manifest: ${src}`);
    process.exit(1);
  }
  await Bun.write(out, buildManifest(pack));
  console.log(
    `Built ${out}: version ${pack.version}, ${pack.channels.length} channels, ${pack.removed.length} tombstones.`,
  );
}
