import { describe, expect, it } from "vitest";
import { diffSchemas } from "../../src/schema/diff.js";
import { createNormalizeContext, normalizeSchema } from "../../src/schema/normalize.js";
import { DEFAULT_LIMITS } from "../../src/types.js";
import { validate } from "../../src/verify/validate.js";

// OpenAPI 3.0 idiom used by GitHub and others: a nullable wrapper around a oneOf with no type.
const wrapper = {
  nullable: true,
  oneOf: [
    { type: "object", properties: { login: { type: "string" } }, required: ["login"] },
    { type: "object", additionalProperties: false },
  ],
};

function norm(raw: unknown) {
  return normalizeSchema(raw, createNormalizeContext({}, DEFAULT_LIMITS));
}

describe("nullable without a type", () => {
  it("accepts null, an object matching a branch, and rejects a string", () => {
    const node = norm(wrapper);
    expect(validate(node, null, "output", DEFAULT_LIMITS)).toEqual([]);
    expect(validate(node, { login: "octocat" }, "output", DEFAULT_LIMITS)).toEqual([]);
    expect(validate(node, "nope", "output", DEFAULT_LIMITS).length).toBeGreaterThan(0);
  });

  it("does not restrict the type set to null", () => {
    const node = norm(wrapper);
    expect(node.types).toBeUndefined();
    expect(node.nullable).toBe(true);
  });

  it("is reported as nullable-added when the flag appears", () => {
    const before = norm({ oneOf: wrapper.oneOf });
    const after = norm(wrapper);
    const events = diffSchemas(before, after, "output", DEFAULT_LIMITS).map((e) => e.event);
    expect(events).toContain("nullable-added");
  });
});
