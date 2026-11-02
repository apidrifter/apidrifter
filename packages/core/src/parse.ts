import { parse as parseYaml } from "yaml";
import { enforceShape, resolveLimits } from "./limits.js";
import { byteLength } from "./text.js";
import { ApidrifterError, type Limits } from "./types.js";

export interface ParseOptions {
  format?: "json" | "yaml" | "auto";
  limits?: Partial<Limits>;
}

/**
 * Parse an untrusted JSON or YAML document into a plain value, enforcing size, depth and
 * node limits. YAML is parsed with the core schema only: no custom tags, no merge keys,
 * bounded alias expansion.
 */
export function parseDocument(text: string, options: ParseOptions = {}): unknown {
  const limits = resolveLimits(options.limits);
  if (byteLength(text) > limits.maxBytes) {
    throw new ApidrifterError("document-too-large", `document exceeds ${limits.maxBytes} bytes`);
  }
  const format = options.format ?? "auto";
  let value: unknown;
  try {
    if (format === "json" || (format === "auto" && looksLikeJson(text))) {
      value = JSON.parse(text);
    } else {
      value = parseYaml(text, {
        schema: "core",
        merge: false,
        maxAliasCount: limits.maxAliases,
        uniqueKeys: false,
        prettyErrors: false,
        strict: false,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    throw new ApidrifterError("parse-failed", `could not parse document: ${msg.slice(0, 200)}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApidrifterError("parse-failed", "document is not an object");
  }
  enforceShape(value, limits);
  return stripPrototypes(value);
}

function looksLikeJson(text: string): boolean {
  for (let i = 0; i < text.length && i < 4096; i++) {
    const c = text[i];
    if (c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\uFEFF") continue;
    return c === "{" || c === "[";
  }
  return false;
}

/**
 * Rebuild the value with null-prototype objects so keys like `__proto__` or `constructor`
 * in a hostile document cannot reach Object.prototype or confuse property checks.
 */
function stripPrototypes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPrototypes);
  if (value !== null && typeof value === "object") {
    const out = Object.create(null) as Record<string, unknown>;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripPrototypes(v);
    }
    return out;
  }
  return value;
}

/** Narrow unknown to a string-keyed record. Accepts null-prototype objects. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
