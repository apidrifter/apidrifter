import type { SchemaNode } from "../schema/model.js";
import { pointerSegment } from "../schema/normalize.js";
import { quote } from "../text.js";
import type { Limits, Polarity } from "../types.js";

/**
 * Instance validation over the normalized schema model. Never throws on bad data; it
 * reports. Patterns come from the spec and are third-party input: they are bounded,
 * screened and compiled defensively, and skipped with a `pattern-not-checked` violation
 * rather than evaluated when they look unsafe.
 */

export type ViolationKind =
  | "type"
  | "null"
  | "never"
  | "enum"
  | "const"
  | "required"
  | "undocumented-property"
  | "forbidden-property"
  | "minimum"
  | "maximum"
  | "exclusive-minimum"
  | "exclusive-maximum"
  | "min-length"
  | "max-length"
  | "min-items"
  | "max-items"
  | "min-properties"
  | "max-properties"
  | "multiple-of"
  | "unique-items"
  | "pattern"
  | "format"
  | "one-of"
  | "any-of"
  | "all-of"
  | "not"
  | "pattern-not-checked"
  | "depth-exceeded";

export interface Violation {
  kind: ViolationKind;
  /** JSON pointer into the validated value. */
  pointer: string;
  expected?: unknown;
  actual?: unknown;
  message: string;
}

/** Constraint kinds, as opposed to type, shape and composition failures. */
export const CONSTRAINT_KINDS: ReadonlySet<ViolationKind> = new Set<ViolationKind>([
  "minimum",
  "maximum",
  "exclusive-minimum",
  "exclusive-maximum",
  "min-length",
  "max-length",
  "min-items",
  "max-items",
  "min-properties",
  "max-properties",
  "multiple-of",
  "unique-items",
  "pattern",
  "format",
]);

export const COMPOSITION_KINDS: ReadonlySet<ViolationKind> = new Set<ViolationKind>([
  "one-of",
  "any-of",
  "all-of",
  "not",
  "never",
]);

interface Ctx {
  polarity: Polarity;
  limits: Limits;
  out: Violation[];
  /** Nodes by the `$ref` they were resolved from, so cycle markers can re-enter them. */
  ancestors: Map<string, SchemaNode>;
  depth: number;
}

const MAX_PATTERN_LENGTH = 512;
const MAX_PATTERN_INPUT = 10_000;
const PATTERN_CACHE_CAP = 500;
const patternCache = new Map<string, RegExp | null>();

export function validate(
  node: SchemaNode,
  value: unknown,
  polarity: Polarity,
  limits: Limits,
): Violation[] {
  const ctx: Ctx = { polarity, limits, out: [], ancestors: new Map(), depth: 0 };
  walk(node, value, ctx, "");
  return ctx.out;
}

function emit(
  ctx: Ctx,
  kind: ViolationKind,
  pointer: string,
  message: string,
  expected?: unknown,
  actual?: unknown,
): void {
  const v: Violation = { kind, pointer, message };
  if (expected !== undefined) v.expected = expected;
  if (actual !== undefined) v.actual = actual;
  ctx.out.push(v);
}

type JsonType = "null" | "boolean" | "integer" | "number" | "string" | "array" | "object";

function jsonType(value: unknown): JsonType {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  return "object";
}

function typeMatches(declared: string, actual: JsonType): boolean {
  if (declared === actual) return true;
  if (declared === "number" && actual === "integer") return true;
  return false;
}

function walk(node: SchemaNode, value: unknown, ctx: Ctx, p: string): void {
  if (ctx.depth > ctx.limits.maxDepth) {
    emit(ctx, "depth-exceeded", p, "value nests deeper than the engine limit");
    return;
  }
  if (node.cycle !== undefined) {
    const target = ctx.ancestors.get(node.cycle);
    if (target === undefined) return;
    ctx.depth++;
    try {
      walk(target, value, ctx, p);
    } finally {
      ctx.depth--;
    }
    return;
  }
  ctx.depth++;
  const registered = node.ref !== undefined && !ctx.ancestors.has(node.ref);
  if (registered && node.ref !== undefined) ctx.ancestors.set(node.ref, node);
  try {
    checkType(node, value, ctx, p);
    checkEnumConst(node, value, ctx, p);
    const t = jsonType(value);
    if (t === "number" || t === "integer") checkNumber(node, value as number, ctx, p);
    else if (t === "string") checkString(node, value as string, ctx, p);
    else if (t === "array") checkArray(node, value as unknown[], ctx, p);
    else if (t === "object") checkObject(node, value as Record<string, unknown>, ctx, p);
    checkComposition(node, value, ctx, p);
  } finally {
    ctx.depth--;
    if (registered && node.ref !== undefined) ctx.ancestors.delete(node.ref);
  }
}

function checkType(node: SchemaNode, value: unknown, ctx: Ctx, p: string): void {
  if (node.types === undefined) return;
  if (node.types.length === 0) {
    emit(ctx, "never", p, "the schema allows no value here");
    return;
  }
  const actual = jsonType(value);
  if (actual === "null") {
    if (!node.types.includes("null"))
      emit(ctx, "null", p, "value is null but the schema does not allow null", node.types, null);
    return;
  }
  if (!node.types.some((t) => typeMatches(t, actual))) {
    emit(
      ctx,
      "type",
      p,
      `expected ${quote(node.types.join(", "))} but got ${actual}`,
      node.types,
      actual,
    );
  }
}

function key(v: unknown): string {
  return JSON.stringify(v) ?? "undefined";
}

function checkEnumConst(node: SchemaNode, value: unknown, ctx: Ctx, p: string): void {
  if (node.enum !== undefined) {
    const k = key(value);
    if (!node.enum.some((e) => key(e) === k)) {
      emit(ctx, "enum", p, `value ${quote(k)} is not one of the allowed values`, node.enum, value);
    }
  }
  if (node.hasConst && key(node.const) !== key(value)) {
    emit(ctx, "const", p, "value does not equal the declared constant", node.const, value);
  }
}

function checkNumber(node: SchemaNode, value: number, ctx: Ctx, p: string): void {
  if (node.minimum !== undefined && value < node.minimum)
    emit(ctx, "minimum", p, `${value} is below minimum ${node.minimum}`, node.minimum, value);
  if (node.maximum !== undefined && value > node.maximum)
    emit(ctx, "maximum", p, `${value} is above maximum ${node.maximum}`, node.maximum, value);
  if (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum)
    emit(
      ctx,
      "exclusive-minimum",
      p,
      `${value} is not above exclusiveMinimum ${node.exclusiveMinimum}`,
      node.exclusiveMinimum,
      value,
    );
  if (node.exclusiveMaximum !== undefined && value >= node.exclusiveMaximum)
    emit(
      ctx,
      "exclusive-maximum",
      p,
      `${value} is not below exclusiveMaximum ${node.exclusiveMaximum}`,
      node.exclusiveMaximum,
      value,
    );
  if (node.multipleOf !== undefined && node.multipleOf > 0) {
    const q = value / node.multipleOf;
    if (Math.abs(q - Math.round(q)) > 1e-9)
      emit(
        ctx,
        "multiple-of",
        p,
        `${value} is not a multiple of ${node.multipleOf}`,
        node.multipleOf,
        value,
      );
  }
  if (
    node.format === "int32" &&
    Number.isInteger(value) &&
    (value < -2147483648 || value > 2147483647)
  ) {
    emit(ctx, "format", p, `${value} does not fit int32`, "int32", value);
  }
  if (node.format === "int64" && Number.isInteger(value) && !Number.isSafeInteger(value)) {
    emit(ctx, "format", p, `${value} is not a safe integer for int64 in JSON`, "int64", value);
  }
}

function checkString(node: SchemaNode, value: string, ctx: Ctx, p: string): void {
  const len = codePoints(value);
  if (node.minLength !== undefined && len < node.minLength)
    emit(
      ctx,
      "min-length",
      p,
      `length ${len} is below minLength ${node.minLength}`,
      node.minLength,
      len,
    );
  if (node.maxLength !== undefined && len > node.maxLength)
    emit(
      ctx,
      "max-length",
      p,
      `length ${len} is above maxLength ${node.maxLength}`,
      node.maxLength,
      len,
    );
  if (node.pattern !== undefined) checkPattern(node.pattern, value, ctx, p);
  if (node.format !== undefined && !formatOk(node.format, value)) {
    emit(ctx, "format", p, `value does not match format ${quote(node.format)}`, node.format, value);
  }
}

function codePoints(s: string): number {
  if (s.length > MAX_PATTERN_INPUT) return s.length;
  let n = 0;
  for (const _ of s) n++;
  return n;
}

function checkPattern(pattern: string, value: string, ctx: Ctx, p: string): void {
  const re = compilePattern(pattern);
  if (re === null) {
    emit(
      ctx,
      "pattern-not-checked",
      p,
      `pattern ${quote(pattern, 60)} was not evaluated: too long, uncompilable or unsafe`,
      pattern,
    );
    return;
  }
  const input = value.length > MAX_PATTERN_INPUT ? value.slice(0, MAX_PATTERN_INPUT) : value;
  re.lastIndex = 0;
  if (!re.test(input))
    emit(ctx, "pattern", p, `value does not match pattern ${quote(pattern, 60)}`, pattern, value);
}

/** Compile a spec pattern defensively. Returns null when it must not be evaluated. */
export function compilePattern(pattern: string): RegExp | null {
  const cached = patternCache.get(pattern);
  if (cached !== undefined) return cached;
  let re: RegExp | null = null;
  if (pattern.length <= MAX_PATTERN_LENGTH && !looksCatastrophic(pattern)) {
    try {
      re = new RegExp(pattern, "u");
    } catch {
      try {
        re = new RegExp(pattern);
      } catch {
        re = null;
      }
    }
  }
  if (patternCache.size >= PATTERN_CACHE_CAP) {
    const first = patternCache.keys().next();
    if (!first.done) patternCache.delete(first.value);
  }
  patternCache.set(pattern, re);
  return re;
}

/**
 * Heuristic for exponential backtracking: a quantifier applied to a group that itself
 * contains a quantifier or an alternation, e.g. `(a+)+`, `(a|aa)*`, `(\d*){2,}`.
 */
export function looksCatastrophic(pattern: string): boolean {
  interface Group {
    atoms: number;
    firstAtomQuantified: boolean;
    hasAlternation: boolean;
  }
  const stack: Group[] = [];
  let inClass = false;
  const atomStart = () => {
    const top = stack[stack.length - 1];
    if (top !== undefined) top.atoms++;
  };
  const quantifier = () => {
    const top = stack[stack.length - 1];
    if (top !== undefined && top.atoms === 1) top.firstAtomQuantified = true;
  };
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
      if (!inClass) atomStart();
      continue;
    }
    if (inClass) {
      if (c === "]") {
        inClass = false;
        atomStart();
      }
      continue;
    }
    if (c === "[") {
      inClass = true;
      continue;
    }
    if (c === "(") {
      stack.push({ atoms: 0, firstAtomQuantified: false, hasAlternation: false });
      continue;
    }
    if (c === ")") {
      const group = stack.pop();
      if (group === undefined) continue;
      const next = pattern[i + 1];
      const quantified = next === "*" || next === "+" || next === "{" || next === "?";
      if (quantified && (group.firstAtomQuantified || group.hasAlternation)) return true;
      atomStart();
      if (quantified) quantifier();
      continue;
    }
    if (c === "*" || c === "+" || c === "{" || c === "?") {
      quantifier();
      continue;
    }
    if (c === "|") {
      const top = stack[stack.length - 1];
      if (top !== undefined) {
        top.hasAlternation = true;
        top.atoms = 0;
      }
      continue;
    }
    if (c !== "^" && c !== "$") atomStart();
  }
  return false;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:.]+$/;

/** True when YYYY-MM-DD names a real calendar day (no rollover). */
function calendarDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Lenient format checks. Unknown formats pass. */
export function formatOk(format: string, value: string): boolean {
  if (value.length > MAX_PATTERN_INPUT) return true;
  switch (format) {
    case "date":
      return DATE.test(value) && calendarDate(value);
    case "date-time":
      return DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
    case "email":
      return EMAIL.test(value);
    case "uuid":
      return UUID.test(value);
    case "uri":
    case "url":
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    case "ipv4":
      return IPV4.test(value);
    case "ipv6":
      return IPV6.test(value) && value.includes(":") && value.split(":").length <= 8;
    default:
      return true;
  }
}

function checkArray(node: SchemaNode, value: unknown[], ctx: Ctx, p: string): void {
  if (node.minItems !== undefined && value.length < node.minItems)
    emit(
      ctx,
      "min-items",
      p,
      `array has ${value.length} items, below minItems ${node.minItems}`,
      node.minItems,
      value.length,
    );
  if (node.maxItems !== undefined && value.length > node.maxItems)
    emit(
      ctx,
      "max-items",
      p,
      `array has ${value.length} items, above maxItems ${node.maxItems}`,
      node.maxItems,
      value.length,
    );
  if (node.uniqueItems === true) {
    const seen = new Set<string>();
    for (let i = 0; i < value.length; i++) {
      const k = key(value[i]);
      if (seen.has(k)) {
        emit(
          ctx,
          "unique-items",
          `${p}/${i}`,
          `item ${i} duplicates an earlier item`,
          undefined,
          value[i],
        );
        break;
      }
      seen.add(k);
    }
  }
  const prefix = node.prefixItems ?? [];
  for (let i = 0; i < value.length; i++) {
    const sub = prefix[i] ?? node.items;
    if (sub !== undefined) walk(sub, value[i], ctx, `${p}/${i}`);
  }
}

function visible(prop: SchemaNode, polarity: Polarity): boolean {
  if (polarity === "input" && prop.readOnly) return false;
  if (polarity === "output" && prop.writeOnly) return false;
  return true;
}

function checkObject(node: SchemaNode, value: Record<string, unknown>, ctx: Ctx, p: string): void {
  const keys = Object.keys(value);
  if (node.minProperties !== undefined && keys.length < node.minProperties)
    emit(
      ctx,
      "min-properties",
      p,
      `object has ${keys.length} properties, below minProperties ${node.minProperties}`,
      node.minProperties,
      keys.length,
    );
  if (node.maxProperties !== undefined && keys.length > node.maxProperties)
    emit(
      ctx,
      "max-properties",
      p,
      `object has ${keys.length} properties, above maxProperties ${node.maxProperties}`,
      node.maxProperties,
      keys.length,
    );

  for (const name of node.required) {
    const prop = node.properties.get(name);
    if (prop !== undefined && !visible(prop, ctx.polarity)) continue;
    if (!Object.hasOwn(value, name)) {
      emit(
        ctx,
        "required",
        `${p}/${pointerSegment(name)}`,
        `required property ${quote(name)} is missing`,
        name,
      );
    }
  }
  for (const name of keys) {
    const sub = `${p}/${pointerSegment(name)}`;
    const prop = node.properties.get(name);
    if (prop !== undefined) {
      if (visible(prop, ctx.polarity)) walk(prop, value[name], ctx, sub);
      continue;
    }
    const ap = node.additionalProperties;
    if (ap === false) {
      emit(
        ctx,
        "forbidden-property",
        sub,
        `property ${quote(name)} is not allowed`,
        undefined,
        name,
      );
    } else if (typeof ap === "object") {
      walk(ap, value[name], ctx, sub);
    } else if (node.properties.size > 0) {
      emit(
        ctx,
        "undocumented-property",
        sub,
        `property ${quote(name)} is not documented`,
        undefined,
        name,
      );
    }
  }
}

/** Run a sub-validation in a scratch context and return whether it passed. */
function passes(node: SchemaNode, value: unknown, ctx: Ctx, p: string): boolean {
  const scratch: Ctx = { ...ctx, out: [], ancestors: new Map(ctx.ancestors) };
  walk(node, value, scratch, p);
  return scratch.out.every((v) => v.kind === "pattern-not-checked");
}

function checkComposition(node: SchemaNode, value: unknown, ctx: Ctx, p: string): void {
  if (node.oneOf !== undefined) {
    const matching = node.oneOf.filter((b) => passes(b, value, ctx, p)).length;
    if (matching !== 1)
      emit(
        ctx,
        "one-of",
        p,
        `value matches ${matching} oneOf alternatives, expected exactly 1`,
        1,
        matching,
      );
  }
  if (node.anyOf !== undefined) {
    if (!node.anyOf.some((b) => passes(b, value, ctx, p)))
      emit(ctx, "any-of", p, "value matches none of the anyOf alternatives");
  }
  if (node.allOf !== undefined) {
    node.allOf.forEach((b, i) => {
      if (!passes(b, value, ctx, p))
        emit(ctx, "all-of", p, `value does not satisfy allOf constraint ${i}`, i);
    });
  }
  if (node.not !== undefined && passes(node.not, value, ctx, p)) {
    emit(ctx, "not", p, "value matches a schema it must not match");
  }
}
