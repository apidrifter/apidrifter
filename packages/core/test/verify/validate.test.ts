import { describe, expect, it } from "vitest";
import { createNormalizeContext, normalizeSchema } from "../../src/schema/normalize.js";
import { DEFAULT_LIMITS, type Polarity } from "../../src/types.js";
import { looksCatastrophic, validate } from "../../src/verify/validate.js";

function check(schema: unknown, value: unknown, polarity: Polarity = "output") {
  const root =
    typeof schema === "object" && schema !== null ? (schema as Record<string, unknown>) : {};
  const node = normalizeSchema(schema, createNormalizeContext(root, DEFAULT_LIMITS));
  return validate(node, value, polarity, DEFAULT_LIMITS);
}

const kinds = (schema: unknown, value: unknown, polarity?: Polarity) =>
  check(schema, value, polarity).map((v) => v.kind);

describe("validate: types", () => {
  it("accepts matching primitives and integer as number", () => {
    expect(kinds({ type: "string" }, "x")).toEqual([]);
    expect(kinds({ type: "number" }, 3)).toEqual([]);
    expect(kinds({ type: "integer" }, 3)).toEqual([]);
    expect(kinds({ type: "boolean" }, true)).toEqual([]);
  });
  it("rejects wrong types", () => {
    expect(kinds({ type: "integer" }, 3.5)).toEqual(["type"]);
    expect(kinds({ type: "string" }, 1)).toEqual(["type"]);
    expect(kinds({ type: ["string", "number"] }, true)).toEqual(["type"]);
  });
  it("reports null separately", () => {
    expect(kinds({ type: "string" }, null)).toEqual(["null"]);
    expect(kinds({ type: "string", nullable: true }, null)).toEqual([]);
    expect(kinds({ type: ["string", "null"] }, null)).toEqual([]);
  });
  it("any schema accepts anything; false schema accepts nothing", () => {
    expect(kinds({}, { a: [1, null] })).toEqual([]);
    expect(kinds(false, 1)).toEqual(["never"]);
  });
});

describe("validate: enum and const", () => {
  it("enum", () => {
    expect(kinds({ enum: ["a", "b"] }, "a")).toEqual([]);
    expect(kinds({ enum: ["a", "b"] }, "c")).toEqual(["enum"]);
  });
  it("const", () => {
    expect(kinds({ const: { x: 1 } }, { x: 1 })).toEqual([]);
    expect(kinds({ const: 1 }, 2)).toEqual(["const"]);
  });
});

describe("validate: objects", () => {
  const schema = {
    type: "object",
    properties: {
      id: { type: "integer" },
      name: { type: "string" },
      secret: { type: "string", writeOnly: true },
      created: { type: "string", readOnly: true },
    },
    required: ["id", "name", "created"],
  };
  it("required and nested types", () => {
    expect(kinds(schema, { id: 1, name: "x", created: "t" })).toEqual([]);
    expect(check(schema, { id: "1", created: "t" }).map((v) => [v.kind, v.pointer])).toEqual([
      ["required", "/name"],
      ["type", "/id"],
    ]);
  });
  it("undocumented property is reported only when properties are declared", () => {
    expect(kinds(schema, { id: 1, name: "x", created: "t", extra: 1 })).toEqual([
      "undocumented-property",
    ]);
    expect(kinds({ type: "object" }, { anything: 1 })).toEqual([]);
  });
  it("additionalProperties false forbids, schema constrains", () => {
    expect(
      kinds(
        { ...schema, additionalProperties: false },
        { id: 1, name: "x", created: "t", extra: 1 },
      ),
    ).toEqual(["forbidden-property"]);
    expect(
      kinds({ type: "object", additionalProperties: { type: "integer" } }, { a: 1, b: "x" }),
    ).toEqual(["type"]);
  });
  it("polarity: readOnly ignored on input, writeOnly ignored on output", () => {
    // input: created is readOnly so it is neither required nor validated
    expect(kinds(schema, { id: 1, name: "x", created: 123 }, "input")).toEqual([]);
    // output: secret is writeOnly so it is skipped; created is validated
    expect(kinds(schema, { id: 1, name: "x", created: 123, secret: 5 }, "output")).toEqual([
      "type",
    ]);
  });
  it("min/max properties", () => {
    expect(kinds({ type: "object", minProperties: 2 }, { a: 1 })).toEqual(["min-properties"]);
    expect(kinds({ type: "object", maxProperties: 1 }, { a: 1, b: 2 })).toEqual(["max-properties"]);
  });
});

describe("validate: arrays", () => {
  it("items, bounds, uniqueness, prefixItems", () => {
    expect(kinds({ type: "array", items: { type: "integer" } }, [1, 2])).toEqual([]);
    expect(
      check({ type: "array", items: { type: "integer" } }, [1, "x"]).map((v) => v.pointer),
    ).toEqual(["/1"]);
    expect(kinds({ type: "array", minItems: 2 }, [1])).toEqual(["min-items"]);
    expect(kinds({ type: "array", maxItems: 1 }, [1, 2])).toEqual(["max-items"]);
    expect(kinds({ type: "array", uniqueItems: true }, [{ a: 1 }, { a: 1 }])).toEqual([
      "unique-items",
    ]);
    expect(
      kinds({ type: "array", prefixItems: [{ type: "string" }, { type: "integer" }] }, ["a", "b"]),
    ).toEqual(["type"]);
  });
});

describe("validate: numbers and strings", () => {
  it("bounds", () => {
    expect(kinds({ type: "number", minimum: 1, maximum: 2 }, 0)).toEqual(["minimum"]);
    expect(kinds({ type: "number", minimum: 1, maximum: 2 }, 3)).toEqual(["maximum"]);
    expect(kinds({ type: "number", exclusiveMinimum: 1 }, 1)).toEqual(["exclusive-minimum"]);
    expect(kinds({ type: "number", exclusiveMaximum: 1 }, 1)).toEqual(["exclusive-maximum"]);
    // OpenAPI 3.0 boolean form
    expect(kinds({ type: "number", minimum: 1, exclusiveMinimum: true }, 1)).toEqual([
      "exclusive-minimum",
    ]);
    expect(kinds({ type: "number", multipleOf: 0.5 }, 1.25)).toEqual(["multiple-of"]);
    expect(kinds({ type: "integer", format: "int32" }, 2 ** 40)).toEqual(["format"]);
  });
  it("lengths, pattern and formats", () => {
    expect(kinds({ type: "string", minLength: 2 }, "a")).toEqual(["min-length"]);
    expect(kinds({ type: "string", maxLength: 1 }, "ab")).toEqual(["max-length"]);
    expect(kinds({ type: "string", pattern: "^[a-z]+$" }, "abc")).toEqual([]);
    expect(kinds({ type: "string", pattern: "^[a-z]+$" }, "ABC")).toEqual(["pattern"]);
    expect(kinds({ type: "string", format: "date" }, "2026-02-30")).toEqual(["format"]);
    expect(kinds({ type: "string", format: "date" }, "2026-02-28")).toEqual([]);
    expect(kinds({ type: "string", format: "date-time" }, "2026-02-28T10:00:00Z")).toEqual([]);
    expect(kinds({ type: "string", format: "email" }, "nope")).toEqual(["format"]);
    expect(
      kinds({ type: "string", format: "uuid" }, "123e4567-e89b-12d3-a456-426614174000"),
    ).toEqual([]);
    expect(kinds({ type: "string", format: "uri" }, "not a uri")).toEqual(["format"]);
    expect(kinds({ type: "string", format: "ipv4" }, "256.1.1.1")).toEqual(["format"]);
    expect(kinds({ type: "string", format: "ipv6" }, "::1")).toEqual([]);
    expect(kinds({ type: "string", format: "made-up" }, "anything")).toEqual([]);
  });
  it("refuses unsafe, too long or uncompilable patterns without throwing", () => {
    expect(looksCatastrophic("(a+)+$")).toBe(true);
    expect(looksCatastrophic("(a|aa)*")).toBe(true);
    expect(looksCatastrophic("^[a-z]+(-[a-z]+)*$")).toBe(false);
    expect(looksCatastrophic("(\\d*)*")).toBe(true);
    expect(looksCatastrophic("^(\\d{3})-(\\d{4})$")).toBe(false);
    expect(kinds({ type: "string", pattern: "(a+)+$" }, "aaaa!")).toEqual(["pattern-not-checked"]);
    expect(kinds({ type: "string", pattern: "(" }, "x")).toEqual(["pattern-not-checked"]);
    expect(kinds({ type: "string", pattern: "a".repeat(600) }, "x")).toEqual([
      "pattern-not-checked",
    ]);
  });
});

describe("validate: composition", () => {
  it("oneOf exactly one", () => {
    const s = { oneOf: [{ type: "string" }, { type: "number" }] };
    expect(kinds(s, "x")).toEqual([]);
    expect(kinds(s, true)).toEqual(["one-of"]);
    expect(kinds({ oneOf: [{ type: "number" }, { type: "integer" }] }, 1)).toEqual(["one-of"]);
  });
  it("anyOf, allOf, not", () => {
    expect(kinds({ anyOf: [{ type: "string" }, { type: "number" }] }, true)).toEqual(["any-of"]);
    expect(kinds({ anyOf: [{ type: "string" }, { type: "number" }] }, 1)).toEqual([]);
    // allOf of plain objects is merged by the normalizer; use a non-mergeable branch to exercise allOf
    expect(
      kinds({ allOf: [{ type: "string" }, { minLength: 3, oneOf: [{ pattern: "^a" }] }] }, "ab"),
    ).toEqual(["all-of"]);
    expect(kinds({ not: { type: "string" } }, "x")).toEqual(["not"]);
  });
  it("merged allOf validates as one object", () => {
    const s = {
      allOf: [
        { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
        { properties: { b: { type: "integer" } }, required: ["b"] },
      ],
    };
    expect(kinds(s, { a: "x", b: 1 })).toEqual([]);
    expect(check(s, { a: "x" }).map((v) => v.pointer)).toEqual(["/b"]);
  });
});

describe("validate: recursion", () => {
  it("re-enters cyclic schemas and bounds depth", () => {
    const doc = {
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: { value: { type: "integer" }, next: { $ref: "#/components/schemas/Node" } },
            required: ["value"],
          },
        },
      },
    };
    const node = normalizeSchema(
      { $ref: "#/components/schemas/Node" },
      createNormalizeContext(doc, DEFAULT_LIMITS),
    );
    expect(
      validate(
        node,
        { value: 1, next: { value: 2, next: { value: 3 } } },
        "output",
        DEFAULT_LIMITS,
      ),
    ).toEqual([]);
    const bad = validate(node, { value: 1, next: { value: "x" } }, "output", DEFAULT_LIMITS);
    expect(bad.map((v) => [v.kind, v.pointer])).toEqual([["type", "/next/value"]]);
    const deep = { value: 0 } as Record<string, unknown>;
    let cur = deep;
    for (let i = 0; i < 300; i++) {
      const n = { value: i } as Record<string, unknown>;
      cur["next"] = n;
      cur = n;
    }
    const kindsDeep = validate(node, deep, "output", { ...DEFAULT_LIMITS, maxDepth: 50 }).map(
      (v) => v.kind,
    );
    expect(kindsDeep).toContain("depth-exceeded");
  });
});
