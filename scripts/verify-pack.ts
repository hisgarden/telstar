#!/usr/bin/env bun
/**
 * Pack verification utility — curation-time, human-in-the-loop.
 *
 * Two layers, kept deliberately separate:
 *
 *  1) STREAM LIVENESS (mechanical, facts only). Fetches each channel's HLS URL
 *     and reports live / slow / dead + HTTP status + latency. A "dead" result
 *     can also mean the server requires a Referer/Origin header or is geo-gated
 *     from where you run this — treat it as a signal, not a verdict.
 *
 *  2) SOURCE CREDIBILITY (NOT auto-rated). This tool does not judge outlets.
 *     It prints the maintainer-supplied journalism-standards and fact-checking
 *     references so a human verifies each outlet against them and records the
 *     basis in docs/curation.md. Telstar relays facts; people make the call.
 *
 * Usage:
 *   bun scripts/verify-pack.ts [path-to-pack.json] [--json]
 * Defaults to public/packs/world-news.json.
 */
import { parsePack } from "../src/model/pack";

const args = process.argv.slice(2);
const pathArg = args.find((a) => !a.startsWith("--"));
const PACK_PATH = pathArg ?? "public/packs/world-news.json";
const JSON_OUT = args.includes("--json");
const TIMEOUT_MS = 8000;
const SLOW_MS = 3000;

// Maintainer-supplied references for the HITL credibility check (not applied
// automatically). Keep in sync with docs/curation.md.
const REFERENCES: Record<string, [string, string][]> = {
  "Independent journalism": [
    ["Associated Press", "https://apnews.com"],
    ["ICIJ", "https://www.icij.org"],
    ["ProPublica", "https://www.propublica.org"],
    ["Reuters", "https://www.reuters.com"],
  ],
  "Fact-checking / news literacy": [
    ["FactCheck.org", "https://www.factcheck.org"],
    ["PolitiFact", "https://www.politifact.com"],
    ["Reuters Fact Check", "https://www.reuters.com/fact-check"],
    ["RumorGuard (News Literacy Project)", "https://www.rumorguard.org"],
    ["Snopes", "https://www.snopes.com"],
  ],
};

type Verdict = "live" | "slow" | "dead";
interface Result {
  name: string;
  country: string;
  funding: string;
  url: string;
  verdict: Verdict;
  status: string;
  ms: number;
}

async function checkStream(url: string): Promise<{ verdict: Verdict; status: string; ms: number }> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Telstar pack-verify)" },
    });
    const ms = Date.now() - start;
    if (!res.ok) return { verdict: "dead", status: String(res.status), ms };
    const body = await res.text();
    if (!body.trimStart().startsWith("#EXTM3U")) return { verdict: "dead", status: "not-hls", ms };
    return { verdict: ms > SLOW_MS ? "slow" : "live", status: String(res.status), ms };
  } catch (e) {
    const name = e instanceof Error ? e.name : "error";
    return { verdict: "dead", status: name === "AbortError" ? "timeout" : "error", ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

const raw = await Bun.file(PACK_PATH).json();
const pack = parsePack(raw);
if (!pack) {
  console.error(`Invalid or unreadable pack manifest: ${PACK_PATH}`);
  process.exit(1);
}

const results: Result[] = [];
for (const ch of pack.channels) {
  const r = await checkStream(ch.url);
  results.push({ name: ch.name, country: ch.country, funding: ch.funding, url: ch.url, ...r });
}

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`\nPack: ${PACK_PATH}  (${results.length} channels)\n`);
  for (const r of results) {
    const tag = r.verdict === "live" ? "✓ LIVE" : r.verdict === "slow" ? "~ SLOW" : "✗ DEAD";
    console.log(
      `${tag.padEnd(7)} ${r.name.padEnd(22)} ${r.country.padEnd(3)} ${r.funding.padEnd(18)} ${String(r.ms).padStart(6)}ms  ${r.status}`,
    );
  }
  const reachable = results.filter((r) => r.verdict !== "dead").length;
  console.log(
    `\n${reachable}/${results.length} reachable from here. A DEAD can be an environment artifact, ` +
      `not a dead stream: the host may be Referer/Origin-gated, geo-blocked from your IP, or ` +
      `unresolvable from your network (DNS NXDOMAIN). Treat it as a signal; confirm on a normal network / in-app.\n`,
  );
  console.log("Source credibility is a human-in-the-loop check — this tool does NOT rate outlets.");
  console.log("Verify each outlet against the maintainer-supplied references, then record the");
  console.log("basis in docs/curation.md:\n");
  for (const [group, refs] of Object.entries(REFERENCES)) {
    console.log(`  ${group}:`);
    for (const [n, u] of refs) console.log(`    - ${n}: ${u}`);
  }
  console.log("");
}
