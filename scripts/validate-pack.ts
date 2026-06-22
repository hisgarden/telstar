/**
 * Stream-validation core (U1). The mechanical, facts-only liveness probe
 * extracted from verify-pack.ts so it is unit-testable with an injected fetch.
 *
 * A "dead" verdict is a signal, not a verdict on the outlet: the host may be
 * Referer/Origin-gated, geo-blocked from the runner's IP, or DNS-unresolvable.
 * Curation treats failures as review flags, never auto-retirements.
 */

export type Verdict = "live" | "slow" | "dead";

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_SLOW_MS = 3000;

export interface ProbeOptions {
  /** Injected for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  slowMs?: number;
}

export interface ProbeResult {
  verdict: Verdict;
  /** HTTP status code as a string, or a reason: "not-hls" | "timeout" | "error". */
  status: string;
  ms: number;
}

export interface ChannelRef {
  id: string;
  url: string;
}

export interface ValidationResult extends ProbeResult {
  id: string;
}

/** True for `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `0/8`, or malformed. */
function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 127) return true; // "this host" / loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16 (incl. cloud metadata)
  return false;
}

/** True for loopback `::1`, unspecified `::`, link-local `fe80::/10`, unique-local `fc00::/7`, or a private IPv4-mapped address. */
function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) — the URL parser normalizes the dotted tail to
  // two hex groups (::ffff:a00:1), so match both forms and recover the IPv4.
  const dotted = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return isPrivateIPv4(dotted[1]);
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateIPv4(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
  }
  return false;
}

/**
 * SSRF host-scope guard (Operational Notes). `isHttpsOnly` checks only the
 * scheme; this additionally refuses literal-IP targets in private, loopback, and
 * link-local ranges so a malicious pack URL cannot turn the CI runner into a
 * proxy for internal services or the cloud-metadata endpoint (169.254.169.254).
 *
 * This is a LITERAL-host guard, not DNS-resolution-aware: a public hostname that
 * resolves to a private IP (DNS rebinding) is out of scope — the real gate is
 * that every probed URL must land in a human-reviewed commit first (KTD3).
 */
export function isSafeProbeTarget(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.includes(":")) return !isPrivateIPv6(host); // IPv6 literal (URL keeps brackets)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return !isPrivateIPv4(host); // IPv4 literal
  return true; // ordinary hostname — resolution-time rebinding is out of scope
}

/** Probe a single HLS URL: live / slow / dead + status + latency. */
export async function probeStream(url: string, opts: ProbeOptions = {}): Promise<ProbeResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const slowMs = opts.slowMs ?? DEFAULT_SLOW_MS;

  // SSRF containment: refuse internal/link-local targets before any network call.
  if (!isSafeProbeTarget(url)) return { verdict: "dead", status: "blocked", ms: 0 };

  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Telstar pack-verify)" },
    });
    const ms = Date.now() - start;
    if (!res.ok) return { verdict: "dead", status: String(res.status), ms };
    const body = await res.text();
    if (!body.trimStart().startsWith("#EXTM3U")) return { verdict: "dead", status: "not-hls", ms };
    return { verdict: ms > slowMs ? "slow" : "live", status: String(res.status), ms };
  } catch (e) {
    const name = e instanceof Error ? e.name : "error";
    return { verdict: "dead", status: name === "AbortError" ? "timeout" : "error", ms: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/** Probe every channel, preserving order and tagging each result by id. */
export async function validatePack(
  channels: ChannelRef[],
  opts: ProbeOptions = {},
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const ch of channels) {
    results.push({ id: ch.id, ...(await probeStream(ch.url, opts)) });
  }
  return results;
}
