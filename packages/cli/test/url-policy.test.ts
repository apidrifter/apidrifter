import { describe, expect, it } from "vitest";
import { checkRedirect, checkUrl, isUrlLike } from "../src/url-policy.js";

describe("checkUrl", () => {
  it("accepts https anywhere", () => {
    expect(checkUrl("https://example.com/openapi.json").ok).toBe(true);
  });

  it("accepts http only for the local machine", () => {
    expect(checkUrl("http://localhost:3000/openapi.json").ok).toBe(true);
    expect(checkUrl("http://127.0.0.1:8080/x").ok).toBe(true);
    expect(checkUrl("http://[::1]:8080/x").ok).toBe(true);
    expect(checkUrl("http://api.localhost/x").ok).toBe(true);
    const bad = checkUrl("http://example.com/openapi.json");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/localhost/);
  });

  it("rejects other schemes, credentials and junk", () => {
    expect(checkUrl("ftp://example.com/x").ok).toBe(false);
    expect(checkUrl("file:///etc/passwd").ok).toBe(false);
    expect(checkUrl("https://user:pw@example.com/x").ok).toBe(false);
    expect(checkUrl("not a url").ok).toBe(false);
  });

  it("refuses redirects that downgrade from https", () => {
    const from = new URL("https://example.com/a");
    expect(checkRedirect(from, new URL("https://other.example.com/b")).ok).toBe(true);
    expect(checkRedirect(from, new URL("http://other.example.com/b")).ok).toBe(false);
    expect(checkRedirect(from, new URL("http://localhost/b")).ok).toBe(true);
  });

  it("detects URL-like inputs", () => {
    expect(isUrlLike("https://x")).toBe(true);
    expect(isUrlLike("HTTP://x")).toBe(true);
    expect(isUrlLike("./spec.yaml")).toBe(false);
  });
});
