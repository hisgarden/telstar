import { describe, it, expect } from "bun:test";
import { probeStream, validatePack, isSafeProbeTarget } from "./validate-pack";

/** A fetch that fails the test if it is ever called (proves SSRF short-circuit). */
const neverFetch = (() => {
  throw new Error("fetch must not be called for a blocked target");
}) as unknown as typeof fetch;

/** Minimal Response-like stub for an injected fetch. */
function res(status: number, body: string, delayMs = 0): typeof fetch {
  return (async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const HLS = "#EXTM3U\n#EXT-X-VERSION:3\n";

describe("probeStream", () => {
  it("Given a fast 200 with an HLS body, Then it is live", async () => {
    const r = await probeStream("https://x/index.m3u8", { fetchImpl: res(200, HLS), slowMs: 1000 });
    expect(r.verdict).toBe("live");
    expect(r.status).toBe("200");
  });

  it("Given a 200 HLS body slower than slowMs, Then it is slow", async () => {
    const r = await probeStream("https://x/index.m3u8", {
      fetchImpl: res(200, HLS, 10),
      slowMs: 2,
    });
    expect(r.verdict).toBe("slow");
  });

  it("Given a 200 whose body is not HLS, Then it is dead/not-hls", async () => {
    const r = await probeStream("https://x/index.m3u8", { fetchImpl: res(200, "<html>") });
    expect(r.verdict).toBe("dead");
    expect(r.status).toBe("not-hls");
  });

  it("Given a non-2xx status, Then it is dead with the status code", async () => {
    const r = await probeStream("https://x/index.m3u8", { fetchImpl: res(403, "") });
    expect(r.verdict).toBe("dead");
    expect(r.status).toBe("403");
  });

  it("Given an aborted/timed-out fetch, Then it is dead/timeout", async () => {
    const aborting = (async () => {
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;
    const r = await probeStream("https://x/index.m3u8", { fetchImpl: aborting });
    expect(r.verdict).toBe("dead");
    expect(r.status).toBe("timeout");
  });

  it("Given a generic fetch rejection, Then it is dead/error (no unhandled rejection)", async () => {
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await probeStream("https://x/index.m3u8", { fetchImpl: failing });
    expect(r.verdict).toBe("dead");
    expect(r.status).toBe("error");
  });
});

describe("isSafeProbeTarget (SSRF host-scope guard)", () => {
  it("Given a public https hostname, Then it is a safe target", () => {
    expect(isSafeProbeTarget("https://stream.example.com/index.m3u8")).toBe(true);
  });

  it("Given a non-https scheme, Then it is unsafe", () => {
    expect(isSafeProbeTarget("http://stream.example.com/index.m3u8")).toBe(false);
  });

  it("Given a loopback literal, Then it is unsafe", () => {
    expect(isSafeProbeTarget("https://127.0.0.1/x")).toBe(false);
    expect(isSafeProbeTarget("https://localhost/x")).toBe(false);
    expect(isSafeProbeTarget("https://[::1]/x")).toBe(false);
  });

  it("Given an RFC-1918 private literal, Then it is unsafe", () => {
    expect(isSafeProbeTarget("https://10.0.0.5/x")).toBe(false);
    expect(isSafeProbeTarget("https://172.16.3.4/x")).toBe(false);
    expect(isSafeProbeTarget("https://192.168.1.1/x")).toBe(false);
  });

  it("Given the link-local cloud-metadata endpoint, Then it is unsafe", () => {
    expect(isSafeProbeTarget("https://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("Given an IPv4-mapped IPv6 private literal, Then it is unsafe", () => {
    expect(isSafeProbeTarget("https://[::ffff:10.0.0.1]/x")).toBe(false);
  });
});

describe("probeStream SSRF containment", () => {
  it("Given a blocked target, Then it returns dead/blocked WITHOUT calling fetch", async () => {
    const r = await probeStream("https://169.254.169.254/latest/meta-data/", { fetchImpl: neverFetch });
    expect(r.verdict).toBe("dead");
    expect(r.status).toBe("blocked");
  });
});

describe("validatePack", () => {
  it("returns one result per channel, tagged by id", async () => {
    const results = await validatePack(
      [
        { id: "A.us", url: "https://a/index.m3u8" },
        { id: "B.uk", url: "https://b/index.m3u8" },
      ],
      { fetchImpl: res(200, HLS), slowMs: 1000 },
    );
    expect(results.map((r) => r.id)).toEqual(["A.us", "B.uk"]);
    expect(results.every((r) => r.verdict === "live")).toBe(true);
  });

  it("an empty channel list yields an empty result, no throw", async () => {
    expect(await validatePack([], { fetchImpl: res(200, HLS) })).toEqual([]);
  });
});
