import type { PlannedRequest } from "@driftwatch/core";
import { describe, expect, it } from "vitest";
import {
  buildRequest,
  executeRequests,
  joinUrl,
  parseHeaderFlags,
  REDACTED,
} from "../src/executor.js";

const planned: PlannedRequest = {
  operationKey: "GET /pets/{}",
  method: "get",
  pathTemplate: "/pets/{petId}",
  deprecated: false,
  parameters: [
    { in: "path", name: "petId", required: true },
    { in: "query", name: "tags", required: false },
    { in: "query", name: "limit", required: true },
    { in: "header", name: "X-Tenant", required: false },
    { in: "cookie", name: "session", required: false },
  ],
  security: [],
  expectedStatuses: ["200"],
};

describe("buildRequest", () => {
  it("reports missing required slots instead of guessing", () => {
    const result = buildRequest(planned, undefined, "http://localhost:3000");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["path:petId", "query:limit"]);
  });

  it("substitutes path params, encodes query, lowercases headers and builds cookies", () => {
    const result = buildRequest(
      planned,
      {
        operationKey: "GET /pets/{}",
        values: {
          "path:petId": "a/b c",
          "query:tags": ["x", "y z"],
          "query:limit": 5,
          "header:X-Tenant": "acme",
          "cookie:session": "s=1",
        },
        headers: { "X-Trace": "t1" },
      },
      "http://localhost:3000/api/",
      { Authorization: "Bearer secret" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const r = result.request;
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/pets/a%2Fb%20c");
    expect(r.url).toBe("http://localhost:3000/api/pets/a%2Fb%20c?tags=x&tags=y+z&limit=5");
    expect(r.headers).toEqual({
      "x-tenant": "acme",
      "x-trace": "t1",
      authorization: "Bearer secret",
      cookie: "session=s%3D1",
    });
  });

  it("serializes JSON bodies and sets content-type", () => {
    const withBody: PlannedRequest = {
      ...planned,
      operationKey: "POST /pets",
      method: "post",
      pathTemplate: "/pets",
      parameters: [],
      body: { mediaType: "application/json", required: true },
    };
    const missing = buildRequest(withBody, { operationKey: "POST /pets" }, "http://localhost");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.missing).toEqual(["body"]);
    const built = buildRequest(
      withBody,
      { operationKey: "POST /pets", body: { name: "x" } },
      "http://localhost",
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.request.body).toBe('{"name":"x"}');
      expect(built.request.headers["content-type"]).toBe("application/json");
    }
  });

  it("joins base URLs with and without trailing slashes", () => {
    expect(joinUrl("http://localhost:3000/", "/a", {})).toBe("http://localhost:3000/a");
    expect(joinUrl("http://localhost:3000/v1", "b", { q: "1" })).toBe(
      "http://localhost:3000/v1/b?q=1",
    );
  });
});

describe("executeRequests", () => {
  it("records observations with sensitive headers redacted on both sides", async () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "sid=abc", "x-rate": "9" },
      });
    }) as typeof fetch;
    const observations = await executeRequests(
      [
        {
          operationKey: "GET /pets/{}",
          method: "GET",
          url: "http://localhost/pets/1",
          path: "/pets/1",
          query: {},
          headers: {
            authorization: "Bearer secret",
            "x-api-key": "k",
            "x-custom": "c",
            accept: "*/*",
          },
        },
      ],
      {
        timeoutMs: 1000,
        maxBodyBytes: 1024,
        fetchImpl,
        redact: new Set(["x-custom"]),
        now: () => "t",
      },
    );
    expect(seen[0]?.init?.redirect).toBe("manual");
    const sentHeaders = seen[0]?.init?.headers as Record<string, string> | undefined;
    expect(sentHeaders?.["authorization"]).toBe("Bearer secret");
    expect(observations).toEqual([
      {
        operationKey: "GET /pets/{}",
        request: {
          method: "GET",
          path: "/pets/1",
          query: {},
          headers: {
            authorization: REDACTED,
            "x-api-key": REDACTED,
            "x-custom": REDACTED,
            accept: "*/*",
          },
        },
        response: {
          status: 200,
          headers: { "content-type": "application/json", "set-cookie": REDACTED, "x-rate": "9" },
          mediaType: "application/json",
          body: { id: 1 },
        },
        capturedAt: "t",
      },
    ]);
    expect(JSON.stringify(observations)).not.toContain("secret");
  });

  it("fails instead of truncating an oversized body", async () => {
    const fetchImpl = (async () => new Response("x".repeat(2048), { status: 200 })) as typeof fetch;
    await expect(
      executeRequests(
        [
          {
            operationKey: "GET /",
            method: "GET",
            url: "http://localhost/",
            path: "/",
            query: {},
            headers: {},
          },
        ],
        { timeoutMs: 1000, maxBodyBytes: 1024, fetchImpl },
      ),
    ).rejects.toThrow(/exceeds 1024 bytes/);
  });
});

describe("parseHeaderFlags", () => {
  it("parses and lowercases header names", () => {
    expect(parseHeaderFlags(["X-A: 1", "Authorization:Bearer t"])).toEqual({
      "x-a": "1",
      authorization: "Bearer t",
    });
    expect(() => parseHeaderFlags(["nocolon"])).toThrow(/Name: value/);
  });
});
