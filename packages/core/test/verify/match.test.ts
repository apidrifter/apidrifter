import { describe, expect, it } from "vitest";
import { normalizeOpenApi } from "../../src/openapi/normalize.js";
import { DEFAULT_LIMITS } from "../../src/types.js";
import { matchOperation, parseQuery } from "../../src/verify/match.js";

const spec = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  servers: [{ url: "https://api.example.com/v1" }, { url: "/alt" }],
  paths: {
    "/pets": { get: { responses: { "200": { description: "ok" } } } },
    "/pets/{petId}": {
      get: { responses: { "200": { description: "ok" } } },
      delete: { responses: { "204": { description: "gone" } } },
    },
    "/pets/count": { get: { responses: { "200": { description: "ok" } } } },
    "/files/{name}.json": { get: { responses: { "200": { description: "ok" } } } },
    "/users/{userId}/pets/{petId}": { get: { responses: { "200": { description: "ok" } } } },
  },
};
const surface = normalizeOpenApi(spec, DEFAULT_LIMITS);

describe("matchOperation", () => {
  it("matches literal and templated paths and decodes parameters", () => {
    expect(matchOperation(surface, "get", "/pets")?.operation.key).toBe("GET /pets");
    const m = matchOperation(surface, "GET", "/pets/a%20b");
    expect(m?.operation.path).toBe("/pets/{petId}");
    expect(m?.pathParams).toEqual({ petId: "a b" });
    expect(matchOperation(surface, "GET", "/users/7/pets/9")?.pathParams).toEqual({
      userId: "7",
      petId: "9",
    });
  });
  it("prefers literal segments over templated ones", () => {
    expect(matchOperation(surface, "GET", "/pets/count")?.operation.path).toBe("/pets/count");
  });
  it("respects method", () => {
    expect(matchOperation(surface, "DELETE", "/pets/1")?.operation.key).toBe("DELETE /pets/{}");
    expect(matchOperation(surface, "POST", "/pets/1")).toBeUndefined();
  });
  it("strips server base paths and trailing slashes", () => {
    expect(matchOperation(surface, "GET", "/v1/pets/")?.operation.key).toBe("GET /pets");
    expect(matchOperation(surface, "GET", "/alt/pets")?.operation.key).toBe("GET /pets");
    expect(matchOperation(surface, "GET", "/v2/pets")).toBeUndefined();
  });
  it("handles partial templates and query strings", () => {
    const m = matchOperation(surface, "GET", "/files/report.json?x=1&x=2&y=z");
    expect(m?.operation.path).toBe("/files/{name}.json");
    expect(m?.pathParams).toEqual({ name: "report" });
    expect(m?.query).toEqual({ x: ["1", "2"], y: "z" });
  });
  it("parses query strings", () => {
    expect(parseQuery("a=1&b=two&a=3")).toEqual({ a: ["1", "3"], b: "two" });
    expect(parseQuery("")).toEqual({});
  });
});
