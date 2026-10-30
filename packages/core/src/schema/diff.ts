import { quote } from "../text.js";
import type { Limits, Polarity } from "../types.js";
import type { SchemaNode } from "./model.js";
import { pointerSegment } from "./normalize.js";

/** A raw schema event. The adapter maps it to a rule ID by prefix. */
export interface SchemaEvent {
  event: string;
  pointer: string;
  before?: unknown;
  after?: unknown;
  message: string;
}

interface Ctx {
  polarity: Polarity;
  limits: Limits;
  events: SchemaEvent[];
  depth: number;
}

/**
 * Diff two normalized schemas. `polarity` decides which side of each comparison is the
 * narrowing one; the registry decides what that means for severity.
 */
export function diffSchemas(
  before: SchemaNode | undefined,
  after: SchemaNode | undefined,
  polarity: Polarity,
  limits: Limits,
  pointer = "",
): SchemaEvent[] {
  const ctx: Ctx = { polarity, limits, events: [], depth: 0 };
  if (before === undefined && after === undefined) return [];
  if (before === undefined) {
    if (after !== undefined && !isAny(after))
      emit(ctx, "schema-added", pointer, "a schema now applies", undefined, undefined);
    return ctx.events;
  }
  if (after === undefined) {
    if (!isAny(before))
      emit(ctx, "schema-removed", pointer, "the schema was removed", undefined, undefined);
    return ctx.events;
  }
  walk(before, after, ctx, pointer);
  return ctx.events;
}

function emit(
  ctx: Ctx,
  event: string,
  pointer: string,
  message: string,
  before: unknown,
  after: unknown,
): void {
  const ev: SchemaEvent = { event, pointer, message };
  if (before !== undefined) ev.before = before;
  if (after !== undefined) ev.after = after;
  ctx.events.push(ev);
}

/** A schema that constrains nothing. */
function isAny(s: SchemaNode): boolean {
  return (
    s.types === undefined &&
    s.enum === undefined &&
    !s.hasConst &&
    s.properties.size === 0 &&
    s.required.size === 0 &&
    s.additionalProperties === true &&
    s.items === undefined &&
    s.prefixItems === undefined &&
    s.oneOf === undefined &&
    s.anyOf === undefined &&
    s.allOf === undefined &&
    s.not === undefined &&
    s.pattern === undefined &&
    s.minimum === undefined &&
    s.maximum === undefined &&
    s.exclusiveMinimum === undefined &&
    s.exclusiveMaximum === undefined &&
    s.minLength === undefined &&
    s.maxLength === undefined &&
    s.minItems === undefined &&
    s.maxItems === undefined &&
    s.minProperties === undefined &&
    s.maxProperties === undefined &&
    s.cycle === undefined
  );
}

function walk(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  if (ctx.depth > ctx.limits.maxDepth) return;
  ctx.depth++;
  try {
    if (b.cycle !== undefined || a.cycle !== undefined) {
      if (b.cycle === undefined || a.cycle === undefined) {
        emit(
          ctx,
          "recursion-changed",
          p,
          "the schema changed between recursive and non-recursive",
          b.cycle,
          a.cycle,
        );
      }
      return;
    }
    diffTypes(b, a, ctx, p);
    diffEnum(b, a, ctx, p);
    diffConst(b, a, ctx, p);
    diffScalars(b, a, ctx, p);
    diffBounds(b, a, ctx, p);
    diffProperties(b, a, ctx, p);
    diffItems(b, a, ctx, p);
    diffComposition(b, a, ctx, p);
  } finally {
    ctx.depth--;
  }
}

/** Relation between two type sets, treating integer as a subset of number. */
function typeRelation(
  before: Set<string>,
  after: Set<string>,
): "same" | "widened" | "narrowed" | "changed" {
  const covers = (sup: Set<string>, sub: Set<string>) =>
    [...sub].every((t) => sup.has(t) || (t === "integer" && sup.has("number")));
  const afterCoversBefore = covers(after, before);
  const beforeCoversAfter = covers(before, after);
  if (afterCoversBefore && beforeCoversAfter) return "same";
  if (afterCoversBefore) return "widened";
  if (beforeCoversAfter) return "narrowed";
  return "changed";
}

function diffTypes(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  const bNull = (b.types?.includes("null") ?? false) || b.nullable;
  const aNull = (a.types?.includes("null") ?? false) || a.nullable;
  if (!bNull && aNull)
    emit(ctx, "nullable-added", p, "the value may now be null", undefined, undefined);
  if (bNull && !aNull && b.types !== undefined && a.types !== undefined) {
    emit(ctx, "nullable-removed", p, "the value may no longer be null", undefined, undefined);
  }
  const bt = new Set((b.types ?? []).filter((t) => t !== "null"));
  const at = new Set((a.types ?? []).filter((t) => t !== "null"));
  if (b.types === undefined && a.types === undefined) return;
  if (b.types === undefined) {
    emit(
      ctx,
      "type-narrowed",
      p,
      `type is now restricted to ${quote([...at].join(", "))}`,
      undefined,
      [...at],
    );
    return;
  }
  if (a.types === undefined) {
    emit(ctx, "type-widened", p, "type is no longer restricted", [...bt], undefined);
    return;
  }
  const rel = typeRelation(bt, at);
  if (rel === "same") return;
  const msg = `type changed from ${quote([...bt].join(", "))} to ${quote([...at].join(", "))}`;
  if (rel === "widened") emit(ctx, "type-widened", p, msg, [...bt], [...at]);
  else if (rel === "narrowed") emit(ctx, "type-narrowed", p, msg, [...bt], [...at]);
  else emit(ctx, "type-changed", p, msg, [...bt], [...at]);
}

function key(v: unknown): string {
  return JSON.stringify(v) ?? "undefined";
}

function diffEnum(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  if (b.enum === undefined && a.enum === undefined) return;
  if (b.enum === undefined) {
    emit(ctx, "enum-added", p, "the value is now restricted to an enum", undefined, a.enum);
    return;
  }
  if (a.enum === undefined) {
    emit(ctx, "enum-removed", p, "the value is no longer restricted to an enum", b.enum, undefined);
    return;
  }
  const bk = new Map(b.enum.map((v) => [key(v), v] as const));
  const ak = new Map(a.enum.map((v) => [key(v), v] as const));
  for (const [k, v] of ak)
    if (!bk.has(k))
      emit(ctx, "enum-value-added", p, `enum value ${quote(k)} was added`, undefined, v);
  for (const [k, v] of bk)
    if (!ak.has(k))
      emit(ctx, "enum-value-removed", p, `enum value ${quote(k)} was removed`, v, undefined);
}

function diffConst(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  if (!b.hasConst && !a.hasConst) return;
  if (b.hasConst && a.hasConst && key(b.const) === key(a.const)) return;
  emit(
    ctx,
    "const-changed",
    p,
    "the constant value changed",
    b.hasConst ? b.const : undefined,
    a.hasConst ? a.const : undefined,
  );
}

function diffScalars(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  if (b.format !== a.format) {
    emit(
      ctx,
      "format-changed",
      p,
      `format changed from ${quote(b.format ?? "none")} to ${quote(a.format ?? "none")}`,
      b.format,
      a.format,
    );
  }
  if (b.pattern !== a.pattern) {
    if (b.pattern === undefined)
      emit(ctx, "pattern-added", p, "a pattern constraint was added", undefined, a.pattern);
    else if (a.pattern === undefined)
      emit(ctx, "pattern-removed", p, "the pattern constraint was removed", b.pattern, undefined);
    else emit(ctx, "pattern-changed", p, "the pattern constraint changed", b.pattern, a.pattern);
  }
  if ((b.uniqueItems ?? false) !== (a.uniqueItems ?? false)) {
    if (a.uniqueItems)
      emit(ctx, "unique-items-added", p, "array items must now be unique", undefined, undefined);
    else
      emit(
        ctx,
        "unique-items-removed",
        p,
        "array items no longer need to be unique",
        undefined,
        undefined,
      );
  }
  if (b.multipleOf !== a.multipleOf) {
    emit(
      ctx,
      "multiple-of-changed",
      p,
      "the multipleOf constraint changed",
      b.multipleOf,
      a.multipleOf,
    );
  }
  if (b.hasDefault !== a.hasDefault || (b.hasDefault && key(b.default) !== key(a.default))) {
    if (!b.hasDefault)
      emit(ctx, "default-added", p, "a default value was added", undefined, a.default);
    else if (!a.hasDefault)
      emit(ctx, "default-removed", p, "the default value was removed", b.default, undefined);
    else emit(ctx, "default-changed", p, "the default value changed", b.default, a.default);
  }
  if (b.deprecated !== a.deprecated) {
    if (a.deprecated) emit(ctx, "deprecated", p, "marked deprecated", undefined, undefined);
    else emit(ctx, "undeprecated", p, "no longer deprecated", undefined, undefined);
  }
  if ((b.description ?? "") !== (a.description ?? "")) {
    emit(ctx, "description-changed", p, "the description changed", b.description, a.description);
  }
}

const MIN_KEYS = ["minimum", "exclusiveMinimum", "minLength", "minItems", "minProperties"] as const;
const MAX_KEYS = ["maximum", "exclusiveMaximum", "maxLength", "maxItems", "maxProperties"] as const;

function diffBounds(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  for (const k of MIN_KEYS) {
    const bv = b[k];
    const av = a[k];
    if (bv === av) continue;
    if (bv === undefined) emit(ctx, "min-added", p, `${k} ${av} was added`, undefined, av);
    else if (av === undefined) emit(ctx, "min-removed", p, `${k} ${bv} was removed`, bv, undefined);
    else if (av > bv) emit(ctx, "min-increased", p, `${k} increased from ${bv} to ${av}`, bv, av);
    else emit(ctx, "min-decreased", p, `${k} decreased from ${bv} to ${av}`, bv, av);
  }
  for (const k of MAX_KEYS) {
    const bv = b[k];
    const av = a[k];
    if (bv === av) continue;
    if (bv === undefined) emit(ctx, "max-added", p, `${k} ${av} was added`, undefined, av);
    else if (av === undefined) emit(ctx, "max-removed", p, `${k} ${bv} was removed`, bv, undefined);
    else if (av < bv) emit(ctx, "max-decreased", p, `${k} decreased from ${bv} to ${av}`, bv, av);
    else emit(ctx, "max-increased", p, `${k} increased from ${bv} to ${av}`, bv, av);
  }
}

/** Properties the consumer cannot observe on this side are invisible to the diff. */
function visible(node: SchemaNode, polarity: Polarity): boolean {
  if (polarity === "input" && node.readOnly) return false;
  if (polarity === "output" && node.writeOnly) return false;
  return true;
}

function diffProperties(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  const bProps = new Map([...b.properties].filter(([, v]) => visible(v, ctx.polarity)));
  const aProps = new Map([...a.properties].filter(([, v]) => visible(v, ctx.polarity)));

  for (const [name, aNode] of aProps) {
    const sub = `${p}/properties/${pointerSegment(name)}`;
    const bNode = bProps.get(name);
    if (bNode === undefined) {
      const required = a.required.has(name);
      if (required && !aNode.hasDefault) {
        emit(
          ctx,
          "required-property-added",
          sub,
          `required property ${quote(name)} was added`,
          undefined,
          undefined,
        );
      } else {
        emit(ctx, "property-added", sub, `property ${quote(name)} was added`, undefined, undefined);
      }
      continue;
    }
    const wasRequired = b.required.has(name);
    const isRequired = a.required.has(name);
    if (!wasRequired && isRequired) {
      emit(
        ctx,
        "property-became-required",
        sub,
        `property ${quote(name)} became required`,
        undefined,
        undefined,
      );
    } else if (wasRequired && !isRequired) {
      emit(
        ctx,
        "property-became-optional",
        sub,
        `property ${quote(name)} became optional`,
        undefined,
        undefined,
      );
    }
    walk(bNode, aNode, ctx, sub);
  }
  for (const name of bProps.keys()) {
    if (aProps.has(name)) continue;
    const sub = `${p}/properties/${pointerSegment(name)}`;
    const strict = a.additionalProperties === false ? " and unknown properties are rejected" : "";
    emit(
      ctx,
      "property-removed",
      sub,
      `property ${quote(name)} was removed${strict}`,
      undefined,
      undefined,
    );
  }

  const bAp = b.additionalProperties;
  const aAp = a.additionalProperties;
  if (bAp !== false && aAp === false) {
    emit(
      ctx,
      "additional-properties-disallowed",
      p,
      "unknown properties are now rejected",
      undefined,
      undefined,
    );
  } else if (bAp === false && aAp !== false) {
    emit(
      ctx,
      "additional-properties-allowed",
      p,
      "unknown properties are now allowed",
      undefined,
      undefined,
    );
  } else if (typeof bAp === "object" || typeof aAp === "object") {
    const bn = typeof bAp === "object" ? bAp : undefined;
    const an = typeof aAp === "object" ? aAp : undefined;
    const sub = `${p}/additionalProperties`;
    if (bn !== undefined && an !== undefined) walk(bn, an, ctx, sub);
    else if (an !== undefined && !isAny(an))
      emit(
        ctx,
        "schema-added",
        sub,
        "unknown properties are now constrained",
        undefined,
        undefined,
      );
    else if (bn !== undefined && !isAny(bn))
      emit(
        ctx,
        "schema-removed",
        sub,
        "unknown properties are no longer constrained",
        undefined,
        undefined,
      );
  }
}

function diffItems(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  const sub = `${p}/items`;
  if (b.items === undefined && a.items !== undefined) {
    if (!isAny(a.items))
      emit(ctx, "items-added", sub, "array items are now constrained", undefined, undefined);
  } else if (b.items !== undefined && a.items === undefined) {
    if (!isAny(b.items))
      emit(
        ctx,
        "items-removed",
        sub,
        "array items are no longer constrained",
        undefined,
        undefined,
      );
  } else if (b.items !== undefined && a.items !== undefined) {
    walk(b.items, a.items, ctx, sub);
  }
  const bp = b.prefixItems ?? [];
  const ap = a.prefixItems ?? [];
  const n = Math.max(bp.length, ap.length);
  for (let i = 0; i < n; i++) {
    const bi = bp[i];
    const ai = ap[i];
    const ptr = `${p}/prefixItems/${i}`;
    if (bi !== undefined && ai !== undefined) walk(bi, ai, ctx, ptr);
    else if (ai !== undefined)
      emit(ctx, "items-added", ptr, `tuple position ${i} is now constrained`, undefined, undefined);
    else if (bi !== undefined)
      emit(
        ctx,
        "items-removed",
        ptr,
        `tuple position ${i} is no longer constrained`,
        undefined,
        undefined,
      );
  }
}

function branchKey(node: SchemaNode, index: number): string {
  if (node.ref !== undefined) return `ref:${node.ref}`;
  if (node.title !== undefined) return `title:${node.title}`;
  return `index:${index}`;
}

function diffBranches(
  bList: SchemaNode[] | undefined,
  aList: SchemaNode[] | undefined,
  ctx: Ctx,
  p: string,
  keyword: "oneOf" | "anyOf" | "allOf",
): void {
  if (bList === undefined && aList === undefined) return;
  const addedEvent = keyword === "allOf" ? "all-of-branch-added" : "one-of-branch-added";
  const removedEvent = keyword === "allOf" ? "all-of-branch-removed" : "one-of-branch-removed";
  const bMap = new Map((bList ?? []).map((n, i) => [branchKey(n, i), { n, i }] as const));
  const aMap = new Map((aList ?? []).map((n, i) => [branchKey(n, i), { n, i }] as const));
  for (const [k, { n, i }] of aMap) {
    const prev = bMap.get(k);
    const ptr = `${p}/${keyword}/${i}`;
    if (prev === undefined)
      emit(
        ctx,
        addedEvent,
        ptr,
        `${keyword} alternative ${quote(k)} was added`,
        undefined,
        undefined,
      );
    else walk(prev.n, n, ctx, ptr);
  }
  for (const [k, { i }] of bMap) {
    if (aMap.has(k)) continue;
    emit(
      ctx,
      removedEvent,
      `${p}/${keyword}/${i}`,
      `${keyword} alternative ${quote(k)} was removed`,
      undefined,
      undefined,
    );
  }
}

function diffComposition(b: SchemaNode, a: SchemaNode, ctx: Ctx, p: string): void {
  diffBranches(b.oneOf, a.oneOf, ctx, p, "oneOf");
  diffBranches(b.anyOf, a.anyOf, ctx, p, "anyOf");
  diffBranches(b.allOf, a.allOf, ctx, p, "allOf");
}
