import { describe, expect, it } from "vitest";
import { inferSchema } from "../../src/verify/infer.js";

describe("inferSchema", () => {
  it("unions types, marks null, requires properties present in every sample", () => {
    const s = inferSchema([
      { id: 1, name: "a", tags: ["x"], meta: null },
      { id: 2, name: "b", tags: [] },
      { id: 3.5, name: "c", tags: ["y", "z"], extra: true },
    ]);
    expect(s.types).toEqual(["object"]);
    expect([...s.required].sort()).toEqual(["id", "name", "tags"]);
    expect(s.properties.get("id")?.types).toEqual(["number"]);
    expect(s.properties.get("meta")?.types).toEqual(["null"]);
    expect(s.properties.get("tags")?.items?.types).toEqual(["string"]);
    expect(s.properties.get("extra")?.types).toEqual(["boolean"]);
  });
  it("handles mixed and empty samples", () => {
    expect(inferSchema([]).types).toBeUndefined();
    expect(inferSchema([1, "a", null]).types).toEqual(["integer", "null", "string"]);
  });
});
