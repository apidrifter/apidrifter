import { describe, expect, it } from "vitest";
import {
  applyConfig,
  type Change,
  clean,
  compileSubjectPattern,
  DriftwatchError,
  diff,
  fingerprint,
  parseDocument,
} from "../src/index.js";
import { loadFixtures } from "./helpers.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: the test is about control characters
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

const fixtures = loadFixtures();

describe("engine invariants over every fixture", () => {
  for (const f of fixtures) {
    describe(`${f.kind}/${f.name}`, () => {
      it("diff(a, a) and diff(b, b) are empty", () => {
        expect(diff(f.before, f.before).changes).toEqual([]);
        expect(diff(f.after, f.after).changes).toEqual([]);
      });

      it("is deterministic", () => {
        const first = JSON.stringify(diff(f.before, f.after));
        const second = JSON.stringify(diff(f.before, f.after));
        expect(second).toBe(first);
      });

      it("emits no control characters", () => {
        const text = JSON.stringify(diff(f.before, f.after));
        expect(CONTROL.test(text)).toBe(false);
      });

      it("reformatting the document yields no change", () => {
        // A round trip through JSON with reordered keys must be invisible.
        const reordered = JSON.parse(JSON.stringify(f.after, Object.keys(flatten(f.after)).sort()));
        expect(diff(f.after, reordered).changes).toEqual([]);
      });
    });
  }
});

/** Collect every key in a value so JSON.stringify's replacer array covers all of them. */
function flatten(v: unknown, acc: Record<string, true> = {}): Record<string, true> {
  if (Array.isArray(v)) for (const x of v) flatten(x, acc);
  else if (v !== null && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      acc[k] = true;
      flatten(x, acc);
    }
  }
  return acc;
}

describe("parseDocument limits", () => {
  it("rejects documents over maxBytes", () => {
    const big = JSON.stringify({ openapi: "3.1.0", pad: "x".repeat(2048) });
    expect(() => parseDocument(big, { limits: { maxBytes: 1024 } })).toThrowError(DriftwatchError);
    try {
      parseDocument(big, { limits: { maxBytes: 1024 } });
    } catch (e) {
      expect((e as DriftwatchError).code).toBe("document-too-large");
    }
  });

  it("rejects nesting beyond maxDepth with document-too-deep", () => {
    const deep = `${'{"a":'.repeat(300)}1${"}".repeat(300)}`;
    let code: string | undefined;
    try {
      parseDocument(deep);
    } catch (e) {
      code = (e as DriftwatchError).code;
    }
    expect(code).toBe("document-too-deep");
  });

  it("rejects a YAML alias bomb", () => {
    const lines = ['a: &a ["lol", "lol", "lol", "lol", "lol", "lol", "lol", "lol", "lol"]'];
    const letters = "bcdefghij";
    let prev = "a";
    for (const l of letters) {
      lines.push(
        `${l}: &${l} [*${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}]`,
      );
      prev = l;
    }
    const bomb = lines.join("\n");
    let code: string | undefined;
    try {
      parseDocument(bomb, { format: "yaml" });
    } catch (e) {
      code = (e as DriftwatchError).code;
    }
    expect(["parse-failed", "document-too-many-nodes"]).toContain(code);
  });

  it("does not let __proto__ keys pollute Object.prototype", () => {
    const text =
      '{"openapi":"3.1.0","__proto__":{"polluted":"yes"},"constructor":{"prototype":{"x":1}}}';
    const doc = parseDocument(text) as Record<string, unknown>;
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.hasOwn(doc, "__proto__")).toBe(true);
    const own = Object.getOwnPropertyDescriptor(doc, "__proto__")?.value as Record<string, unknown>;
    expect(own["polluted"]).toBe("yes");
  });

  it("rejects non-object documents", () => {
    expect(() => parseDocument("[1,2,3]")).toThrowError(DriftwatchError);
    expect(() => parseDocument("42", { format: "yaml" })).toThrowError(DriftwatchError);
  });
});

describe("clean", () => {
  it("strips ANSI escape sequences", () => {
    expect(clean("\u001b[31mred\u001b[0m text")).toBe("red text");
    expect(clean("\u001b]0;title\u0007after")).toBe("after");
  });

  it("strips C0 and C1 control characters but keeps ordinary whitespace", () => {
    expect(clean("a\u0000b\u0007c\u0085d")).toBe("abcd");
    expect(clean("a\tb\nc")).toBe("a b c");
  });

  it("strips bidi overrides and zero-width characters", () => {
    expect(clean("user‮admin​!")).toBe("useradmin!");
  });

  it("returns an empty string for non-strings", () => {
    expect(clean(42)).toBe("");
    expect(clean(undefined)).toBe("");
  });
});

describe("compileSubjectPattern", () => {
  it("** crosses path segments", () => {
    expect(compileSubjectPattern("GET /internal/**").test("GET /internal/a/b")).toBe(true);
    expect(compileSubjectPattern("GET /internal/**").test("POST /internal/a")).toBe(false);
  });

  it("* stays within a segment", () => {
    expect(compileSubjectPattern("GET /pets/*").test("GET /pets/1")).toBe(true);
    expect(compileSubjectPattern("GET /pets/*").test("GET /pets/1/toys")).toBe(false);
  });

  it("escapes regex metacharacters", () => {
    expect(compileSubjectPattern("GET /a.b").test("GET /a.b")).toBe(true);
    expect(compileSubjectPattern("GET /a.b").test("GET /axb")).toBe(false);
    expect(compileSubjectPattern("tool(1)+").test("tool(1)+")).toBe(true);
  });
});

describe("applyConfig", () => {
  const changes: Change[] = [
    {
      id: "endpoint-removed",
      severity: "breaking",
      source: "openapi",
      location: { kind: "operation", subject: "DELETE /pets/{id}" },
      message: "operation was removed",
    },
    {
      id: "endpoint-added",
      severity: "info",
      source: "openapi",
      location: { kind: "operation", subject: "POST /internal/jobs" },
      message: "operation was added",
    },
  ];

  it("overrides severity", () => {
    const r = applyConfig(changes, { severity: { "endpoint-removed": "warning" } });
    expect(r.changes[0]?.severity).toBe("warning");
    expect(r.suppressed).toBe(0);
  });

  it("drops by id and by ignore severity", () => {
    expect(applyConfig(changes, { ignore: { ids: ["endpoint-added"] } }).changes).toHaveLength(1);
    expect(applyConfig(changes, { severity: { "endpoint-added": "ignore" } }).suppressed).toBe(1);
  });

  it("drops by subject pattern", () => {
    const r = applyConfig(changes, { ignore: { subjects: ["* /internal/**"] } });
    expect(r.changes.map((c) => c.id)).toEqual(["endpoint-removed"]);
    expect(r.suppressed).toBe(1);
  });

  it("drops baselined fingerprints and keeps the rest", () => {
    const first = changes[0];
    if (first === undefined) throw new Error("unreachable");
    const r = applyConfig(changes, { baseline: [fingerprint(first)] });
    expect(r.changes.map((c) => c.id)).toEqual(["endpoint-added"]);
  });

  it("rejects unknown rule ids in config", () => {
    expect(() =>
      diff(
        { openapi: "3.1.0", paths: {} },
        { openapi: "3.1.0", paths: {} },
        { config: { severity: { nope: "info" } } },
      ),
    ).toThrowError(DriftwatchError);
  });
});

describe("diff kind handling", () => {
  it("refuses Swagger 2.0", () => {
    expect(() => diff({ swagger: "2.0" }, { swagger: "2.0" })).toThrowError(/Swagger 2.0/);
  });

  it("refuses mixed kinds", () => {
    expect(() => diff({ openapi: "3.1.0", paths: {} }, { tools: [] })).toThrowError(
      DriftwatchError,
    );
  });
});
