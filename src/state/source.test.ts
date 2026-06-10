import { describe, it, expect, beforeEach } from "bun:test";
import { isAllowedSource, isHttpsOnly, setValidatedSource } from "./source";
import { currentSource, setCurrentSource } from "./signals";

// Zero-trust (R11): a source URL is untrusted input. Only http(s) schemes may
// ever reach the player. file:/javascript:/data:/blob: and malformed input are
// rejected before they can become a playable source.

const HTTPS_M3U8 = "https://stream.example.com/demo.m3u8";
const HTTP_M3U8 = "http://stream.example.com/demo.m3u8";

describe("isAllowedSource", () => {
  it("Given an https URL, When checked, Then it is allowed", () => {
    expect(isAllowedSource(HTTPS_M3U8)).toBe(true);
  });

  it("Given an http URL, When checked, Then it is allowed (per R11 allowlist)", () => {
    expect(isAllowedSource(HTTP_M3U8)).toBe(true);
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "data:text/html,<h1>x", "blob:https://x/abc"])(
    "Given a disallowed scheme (%s), When checked, Then it is rejected",
    (url) => {
      expect(isAllowedSource(url)).toBe(false);
    },
  );

  it.each(["", "not a url", "://missing-scheme", "ftp://host/file"])(
    "Given malformed or non-allowlisted input (%s), When checked, Then it is rejected",
    (url) => {
      expect(isAllowedSource(url)).toBe(false);
    },
  );
});

describe("isHttpsOnly", () => {
  it("Given an https URL, When checked, Then it is allowed", () => {
    expect(isHttpsOnly(HTTPS_M3U8)).toBe(true);
  });

  it("Given an http URL, When checked, Then it is rejected (stricter than isAllowedSource)", () => {
    expect(isHttpsOnly(HTTP_M3U8)).toBe(false);
    expect(isAllowedSource(HTTP_M3U8)).toBe(true);
  });

  it.each(["file:///x", "javascript:alert(1)", "data:text/html,x", "", "not a url"])(
    "Given a disallowed or malformed input (%s), When checked, Then it is rejected",
    (url) => {
      expect(isHttpsOnly(url)).toBe(false);
    },
  );
});

describe("setValidatedSource", () => {
  beforeEach(() => setCurrentSource(null));

  it("Given an allowed https source, When set, Then it becomes the current source and returns true", () => {
    const ok = setValidatedSource(HTTPS_M3U8);
    expect(ok).toBe(true);
    expect(currentSource.get()).toBe(HTTPS_M3U8);
  });

  it("Given a disallowed scheme, When set, Then currentSource is never updated and it returns false", () => {
    const ok = setValidatedSource("file:///etc/passwd");
    expect(ok).toBe(false);
    expect(currentSource.get()).toBeNull();
  });

  it("Given a disallowed source after a valid one, When set, Then the prior valid source is preserved", () => {
    setValidatedSource(HTTPS_M3U8);
    const ok = setValidatedSource("javascript:alert(1)");
    expect(ok).toBe(false);
    expect(currentSource.get()).toBe(HTTPS_M3U8);
  });
});
