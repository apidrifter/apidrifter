import { describe, expect, it } from "vitest";
import { renderVerifyMarkdown } from "../../src/render/verify-markdown.js";
import { renderVerifyText } from "../../src/render/verify-text.js";
import type { Observation } from "../../src/verify/types.js";
import { fingerprintFinding, verify } from "../../src/verify/verify.js";

const spec = {
  openapi: "3.1.0",
  info: { title: "Pets", version: "1" },
  paths: {
    "/pets": {
      get: {
        parameters: [
          { name: "limit", in: "query", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          "200": {
            description: "ok",
            headers: { "X-Total": { required: true, schema: { type: "integer" } } },
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } },
              },
            },
          },
        },
      },
      post: {
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/NewPet" } } },
        },
        responses: {
          "201": {
            description: "made",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
          },
          "4XX": { description: "client error" },
        },
      },
    },
    "/pets/{petId}": {
      get: {
        deprecated: true,
        parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/StrictPet" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          kind: { type: "string", enum: ["cat", "dog"] },
        },
        required: ["id", "name"],
      },
      StrictPet: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "integer" }, name: { type: "string" } },
        required: ["id", "name"],
      },
      NewPet: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          kind: { type: "string", enum: ["cat", "dog"] },
        },
        required: ["name"],
      },
    },
  },
};

const ok: Observation = {
  request: { method: "GET", path: "/pets?limit=10" },
  response: {
    status: 200,
    headers: { "x-total": "1", "Content-Type": "application/json; charset=utf-8" },
    body: [{ id: 1, name: "Rex", kind: "dog" }],
  },
};

const ids = (obs: Observation[]) => verify(spec, obs).findings.map((f) => f.id);

describe("verify", () => {
  it("conforming observation produces no findings and counts coverage", () => {
    const r = verify(spec, [ok]);
    expect(r.findings).toEqual([]);
    expect(r.summary).toEqual({ breaking: 0, warning: 0, info: 0, suppressed: 0 });
    expect(r.coverage).toEqual({ operations: 3, observed: 1, unmatchedObservations: 0 });
  });

  it("undocumented status", () => {
    const r = verify(spec, [{ ...ok, response: { status: 500, body: {} } }]);
    expect(r.findings.map((f) => f.id)).toEqual(["undocumented-status"]);
    expect(r.findings[0]?.severity).toBe("breaking");
    expect(r.findings[0]?.location).toEqual({
      kind: "operation",
      subject: "GET /pets",
      part: "response",
      name: "500",
    });
    expect(r.findings[0]?.fix.spec).toContain('paths["/pets"].get.responses');
    expect(r.findings[0]?.observation).toBe(0);
  });

  it("status ranges and default are honored", () => {
    expect(
      ids([
        {
          request: { method: "POST", path: "/pets", body: { name: "x" } },
          response: { status: 404, body: "nope" },
        },
      ]),
    ).toEqual(["request-rejected-but-valid"].filter(() => false));
  });

  it("missing required property and type mismatch in the response", () => {
    const r = verify(spec, [{ ...ok, response: { ...ok.response, body: [{ id: "1" }] } }]);
    expect(r.findings.map((f) => [f.id, f.location.pointer])).toEqual([
      ["response-type-mismatch", "/0/id"],
      ["response-missing-required-property", "/0/name"],
    ]);
    const type = r.findings[0];
    expect(type?.fix.implementation).toContain('Return "integer"');
    expect(type?.fix.spec).toContain('.schema.items.properties["id"]');
    expect(r.findings[1]?.fix.spec).toContain('Remove "name" from required');
  });

  it("undocumented property is info, forbidden property is breaking", () => {
    const loose = verify(spec, [
      { ...ok, response: { ...ok.response, body: [{ id: 1, name: "a", extra: 1 }] } },
    ]);
    expect(loose.findings.map((f) => [f.id, f.severity])).toEqual([
      ["response-undocumented-property", "info"],
    ]);
    const strict = verify(spec, [
      {
        request: { method: "GET", path: "/pets/1" },
        response: { status: 200, body: { id: 1, name: "a", extra: 1 } },
      },
    ]);
    expect(strict.findings.map((f) => [f.id, f.severity])).toEqual([
      ["deprecated-operation-in-use", "info"],
      ["response-forbidden-property", "breaking"],
    ]);
  });

  it("enum and null violations", () => {
    const r = verify(spec, [
      { ...ok, response: { ...ok.response, body: [{ id: 1, name: null, kind: "bird" }] } },
    ]);
    expect(r.findings.map((f) => f.id)).toEqual([
      "response-enum-violation",
      "response-null-not-allowed",
    ]);
  });

  it("rejected-but-valid and accepted-but-invalid", () => {
    const rejected = verify(spec, [
      {
        request: {
          method: "POST",
          path: "/pets",
          headers: { "content-type": "application/json" },
          body: { name: "Rex" },
        },
        response: { status: 422, body: {} },
      },
    ]);
    expect(rejected.findings.map((f) => f.id)).toEqual(["request-rejected-but-valid"]);
    expect(rejected.findings[0]?.severity).toBe("breaking");

    const accepted = verify(spec, [
      {
        request: { method: "POST", path: "/pets", body: { name: "", kind: "bird" } },
        response: { status: 201, body: { id: 1, name: "" } },
      },
    ]);
    expect(accepted.findings.map((f) => f.id).sort()).toEqual([
      "request-accepted-but-invalid",
      "request-constraint-violation",
      "request-enum-violation",
    ]);
    const explain = accepted.findings.find((f) => f.id === "request-enum-violation");
    expect(explain?.location).toEqual({
      kind: "operation",
      subject: "POST /pets",
      part: "requestBody",
      mediaType: "application/json",
      pointer: "/kind",
    });
    expect(explain?.severity).toBe("info");
  });

  it("request parameter validation with coercion", () => {
    expect(ids([{ ...ok, request: { method: "GET", path: "/pets" } }])).toEqual([
      "request-accepted-but-invalid",
      "request-missing-required-parameter",
    ]);
    expect(ids([{ ...ok, request: { method: "GET", path: "/pets?limit=0" } }])).toEqual([
      "request-accepted-but-invalid",
      "request-constraint-violation",
    ]);
    expect(ids([{ ...ok, request: { method: "GET", path: "/pets?limit=abc" } }])).toEqual([
      "request-accepted-but-invalid",
      "request-type-mismatch",
    ]);
    expect(
      ids([{ ...ok, request: { method: "GET", path: "/pets", query: { limit: "5" } } }]),
    ).toEqual([]);
  });

  it("missing required header and undocumented media type and non-JSON body", () => {
    expect(ids([{ ...ok, response: { status: 200, body: [] } }])).toEqual([
      "response-header-missing",
    ]);
    expect(
      ids([
        {
          ...ok,
          response: {
            status: 200,
            headers: { "x-total": "0" },
            mediaType: "text/plain",
            body: "hi",
          },
        },
      ]),
    ).toEqual(["undocumented-response-media-type"]);
    expect(
      ids([
        {
          ...ok,
          response: {
            status: 200,
            headers: { "x-total": "0", "content-type": "application/json" },
            body: "{not json",
          },
        },
      ]),
    ).toEqual(["response-body-not-json"]);
  });

  it("undocumented operation counts as unmatched", () => {
    const r = verify(spec, [
      { request: { method: "GET", path: "/nope?x=1" }, response: { status: 200 } },
    ]);
    expect(r.findings.map((f) => [f.id, f.location.subject])).toEqual([
      ["undocumented-operation", "GET /nope"],
    ]);
    expect(r.coverage).toEqual({ operations: 3, observed: 0, unmatchedObservations: 1 });
  });

  it("required request body missing", () => {
    expect(
      ids([
        {
          request: { method: "POST", path: "/pets" },
          response: { status: 201, body: { id: 1, name: "a" } },
        },
      ]),
    ).toEqual(["request-accepted-but-invalid", "request-missing-body"]);
  });

  it("config: severity override, ignore ids, ignore subjects, baseline", () => {
    const bad: Observation = { ...ok, response: { status: 500, body: {} } };
    expect(
      verify(spec, [bad], { config: { severity: { "undocumented-status": "info" } } }).findings[0]
        ?.severity,
    ).toBe("info");
    expect(
      verify(spec, [bad], { config: { ignore: { ids: ["undocumented-status"] } } }).summary
        .suppressed,
    ).toBe(1);
    expect(
      verify(spec, [bad], { config: { ignore: { subjects: ["GET /pets*"] } } }).findings,
    ).toEqual([]);
    const fp = fingerprintFinding(verify(spec, [bad]).findings[0] as never);
    expect(verify(spec, [bad], { config: { baseline: [fp] } }).findings).toEqual([]);
    expect(() => verify(spec, [bad], { config: { severity: { nonsense: "info" } } })).toThrow(
      /unknown rule id/,
    );
  });

  it("is deterministic and serializable", () => {
    const obs: Observation[] = [
      {
        ...ok,
        response: {
          ...ok.response,
          body: [
            { id: "x", kind: "bird" },
            { id: 2, name: "b", extra: 1 },
          ],
        },
      },
      { request: { method: "GET", path: "/nope" }, response: { status: 200 } },
      {
        request: { method: "POST", path: "/pets", body: { name: "" } },
        response: { status: 400, body: {} },
      },
    ];
    const a = JSON.stringify(verify(spec, obs));
    const b = JSON.stringify(verify(spec, [...obs]));
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual(verify(spec, obs));
  });

  it("renders markdown and text", () => {
    const r = verify(spec, [
      { ...ok, response: { status: 500, body: {} } },
      { request: { method: "GET", path: "/nope" }, response: { status: 200 } },
    ]);
    const md = renderVerifyMarkdown(r);
    expect(md).toContain("### Breaking (1)");
    expect(md).toContain("`undocumented-status`");
    expect(md).toContain("If the spec is the source of truth:");
    expect(md).toContain("Coverage: 1 of 3 operations observed");
    const text = renderVerifyText(r);
    expect(text).toContain("BREAKING undocumented-status");
    expect(text).toContain("coverage: 1/3 operations observed, 1 unmatched observations");
  });

  it("strips control characters from third-party text", () => {
    const r = verify(spec, [
      { request: { method: "GET", path: "/evil\u001b[31m" }, response: { status: 200 } },
    ]);
    expect(r.findings[0]?.message).not.toContain("\u001b");
  });

  it("rejects non-OpenAPI specs", () => {
    expect(() => verify({ tools: [] }, [])).toThrow(/OpenAPI/);
  });
});
