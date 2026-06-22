#!/usr/bin/env bun
/**
 * Pack update / curation CLI (U2). Applies explicit roster edits, then runs the
 * liveness probe as a HITL review aid — probe failures are surfaced as flags,
 * NEVER auto-retirements (KTD2). The deterministic serializer owns the on-disk
 * format, so a no-edit run leaves the file byte-identical.
 *
 * Usage:
 *   bun scripts/update-pack.ts [pack.json]
 *     --retire <id>          retire a channel (append tombstone, bump version)
 *     --set-url <id> <url>   swap a channel's URL (https only)
 *     --add <json>           add a channel from a JSON object (https url, valid
 *                            country/funding; rejected if its id already exists)
 *     --no-validate          skip the liveness probe (offline / fast)
 *
 * Example (replace one channel with another in a single run):
 *   bun scripts/update-pack.ts --retire CBSNews247.us \
 *     --add '{"name":"Scripps News","id":"ScrippsNews.us","country":"us",
 *             "funding":"commercial","categories":["news"],"url":"https://.../x.m3u8"}'
 */
import { parsePack, type PackChannel } from "../src/model/pack";
import { validatePack } from "./validate-pack";
import { applyEdits, serializePack, type PackEdits } from "./curate";

export interface ParsedArgs {
  packPath: string;
  edits: PackEdits;
  validate: boolean;
}

/** Parse a `--add` JSON argument into a candidate channel (validated downstream by addChannel). */
function parseAddArg(raw: string | undefined): PackChannel {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("--add requires a JSON channel object argument");
  }
  try {
    return JSON.parse(raw) as PackChannel;
  } catch (e) {
    throw new Error(`--add: invalid JSON: ${(e as Error).message}`);
  }
}

/** Parse CLI argv into a pack path, an ordered edit batch, and the validate flag. */
export function parseArgs(argv: string[]): ParsedArgs {
  let packPath = "public/packs/world-news.json";
  const retires: string[] = [];
  const setUrls: [string, string][] = [];
  const adds: PackChannel[] = [];
  let validate = true;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--retire") retires.push(argv[++i]);
    else if (a === "--set-url") setUrls.push([argv[++i], argv[++i]]);
    else if (a === "--add") adds.push(parseAddArg(argv[++i]));
    else if (a === "--no-validate") validate = false;
    else if (!a.startsWith("--")) packPath = a;
  }

  return { packPath, edits: { setUrls, retires, adds }, validate };
}

async function main(argv: string[]): Promise<void> {
  const { packPath, edits, validate } = parseArgs(argv);

  const raw = await Bun.file(packPath).text();
  const parsed = parsePack(JSON.parse(raw));
  if (!parsed) {
    console.error(`Invalid or unreadable pack manifest: ${packPath}`);
    process.exit(1);
  }

  const startVersion = parsed.version;
  const pack = applyEdits(parsed, edits);

  if (validate) {
    const results = await validatePack(pack.channels.map((c) => ({ id: c.id, url: c.url })));
    const dead = results.filter((r) => r.verdict === "dead");
    if (dead.length) {
      console.log(`\n⚠ ${dead.length} channel(s) failed to probe from here — REVIEW, do not assume dead:`);
      for (const d of dead) console.log(`  ${d.id.padEnd(24)} ${d.status}`);
      console.log("  A DEAD can be a geo-block, Referer/Origin gate, or DNS failure from this network.");
      console.log("  Confirm on a normal network / in-app before retiring (docs/curation.md).");
    }
  }

  const out = serializePack(pack);
  if (out !== raw) {
    await Bun.write(packPath, out);
    console.log(
      `\nUpdated ${packPath}: version ${startVersion} → ${pack.version}, ` +
        `${pack.channels.length} channels, ${pack.removed.length} tombstones.`,
    );
  } else {
    console.log(`\nNo roster change; ${packPath} unchanged.`);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
