import { describe, expect, it } from "vitest";
import { plan } from "../../src/verify/plan.js";

const spec = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "X-Key" },
      oauth: { type: "oauth2", flows: {} },
    },
    parameters: { limit: { name: "limit", in: "query", schema: { type: "integer", default: 20 } } },
    schemas: {
      Pet: {
        type: "object",
        properties: { name: { type: "string" }, tag: { type: "string" } },
        required: ["name"],
        example: { name: "Rex" },
      },
    },
  },
  paths: {
    "/pets": {
      parameters: [{ $ref: "#/components/parameters/limit" }],
      get: {
        operationId: "listPets",
        summary: "List",
        responses: { "200": { description: "ok" }, default: { description: "err" } },
      },
      post: {
        security: [{ oauth: ["write"] }],
        requestBody: {
          required: true,
          content: {
            "application/xml": { schema: { type: "string" } },
            "application/json": { schema: { $ref: "#/components/schemas/Pet" } },
          },
        },
        responses: { "201": { description: "made" } },
      },
    },
    "/pets/{petId}": {
      get: {
        deprecated: true,
        parameters: [
          {
            name: "petId",
            in: "path",
            required: true,
            schema: { type: "string" },
            examples: { one: { value: "p1" } },
          },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

describe("plan", () => {
  const plans = plan(spec);
  it("emits one planned request per operation, sorted", () => {
    expect(plans.map((p) => p.operationKey)).toEqual(["GET /pets", "GET /pets/{}", "POST /pets"]);
  });
  it("carries parameters with examples from the spec, including path-level and $ref parameters", () => {
    const list = plans[0];
    expect(list?.operationId).toBe("listPets");
    expect(list?.parameters).toEqual([
      {
        in: "query",
        name: "limit",
        required: false,
        schema: { type: "integer", default: 20 },
        example: 20,
      },
    ]);
    expect(list?.expectedStatuses).toEqual(["200", "default"]);
    expect(list?.security).toEqual(["apiKey"]);
    const byId = plans[1];
    expect(byId?.deprecated).toBe(true);
    expect(byId?.parameters[0]?.example).toBe("p1");
    expect(byId?.pathTemplate).toBe("/pets/{petId}");
  });
  it("prefers JSON bodies, summarizes schemas and pulls schema examples", () => {
    const create = plans[2];
    expect(create?.security).toEqual(["oauth"]);
    expect(create?.body?.mediaType).toBe("application/json");
    expect(create?.body?.required).toBe(true);
    expect(create?.body?.example).toEqual({ name: "Rex" });
    expect(create?.body?.schema).toEqual({
      type: "object",
      properties: { name: { type: "string" }, tag: { type: "string" } },
      required: ["name"],
    });
  });
  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(plans))).toEqual(plans);
  });
  it("rejects non-OpenAPI input", () => {
    expect(() => plan({ tools: [] })).toThrow(/OpenAPI/);
  });
});
