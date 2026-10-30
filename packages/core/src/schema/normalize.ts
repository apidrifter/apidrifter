import { isRecord } from "../parse.js";
import { DriftwatchError, type Limits } from "../types.js";
import { emptySchema, type SchemaNode } from "./model.js";

export interface NormalizeContext {
  root: Record<string, unknown>;
  limits: Limits;
  /** Refs currently being resolved, for cycle detection. */
  stack: string[];
  /** Total nodes produced, for the expansion budget. */
  nodes: number;
}

export function createNormalizeContext(
  root: Record<string, unknown>,
  limits: Limits,
): NormalizeContext {
  return { root, limits, stack: [], nodes: 0 };
}

const NUMERIC_KEYS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "multipleOf",
] as const;

/**
 * Normalize a raw schema value. Only local references (`#/...`) are resolved; anything
 * else is treated as an opaque schema that matches anything, because the engine never
 * does I/O. Callers that want external refs resolved must inline them first.
 */
export function normalizeSchema(raw: unknown, ctx: NormalizeContext): SchemaNode {
  return walk(raw, ctx, 0);
}

function walk(raw: unknown, ctx: NormalizeContext, depth: number): SchemaNode {
  ctx.nodes++;
  if (ctx.nodes > ctx.limits.maxNodes) {
    throw new DriftwatchError("document-too-many-nodes", "schema expansion exceeded node budget");
  }
  if (depth > ctx.limits.maxDepth) {
    throw new DriftwatchError("document-too-deep", "schema nesting exceeded depth limit");
  }
  const node = emptySchema();
  if (raw === true || raw === undefined || raw === null) return node;
  if (raw === false) {
    node.types = [];
    return node;
  }
  if (!isRecord(raw)) return node;

  const ref = raw["$ref"];
  if (typeof ref === "string") {
    if (ctx.stack.includes(ref)) {
      node.cycle = ref;
      node.ref = ref;
      return node;
    }
    if (ctx.stack.length >= ctx.limits.maxRefDepth) {
      throw new DriftwatchError("document-too-deep", "reference chain exceeded limit");
    }
    const target = resolveLocalRef(ctx.root, ref);
    if (target === undefined) {
      // Unresolvable or external: opaque, matches anything.
      node.ref = ref;
      return node;
    }
    ctx.stack.push(ref);
    try {
      const resolved = walk(target, ctx, depth + 1);
      resolved.ref = ref;
      // Sibling keywords next to $ref (JSON Schema 2020-12) apply alongside the target.
      applyKeywords(raw, resolved, ctx, depth, true);
      return resolved;
    } finally {
      ctx.stack.pop();
    }
  }

  applyKeywords(raw, node, ctx, depth, false);
  return node;
}

function applyKeywords(
  raw: Record<string, unknown>,
  node: SchemaNode,
  ctx: NormalizeContext,
  depth: number,
  siblingsOfRef: boolean,
): void {
  // type and nullable
  const rawType = raw["type"];
  let types: string[] | undefined;
  if (typeof rawType === "string") types = [rawType];
  else if (Array.isArray(rawType))
    types = rawType.filter((t): t is string => typeof t === "string");
  if (raw["nullable"] === true) types = [...(types ?? []), "null"];
  if (types !== undefined) {
    const set = new Set(types);
    node.types = [...set].sort();
  } else if (siblingsOfRef) {
    // keep target's types
  }

  if (typeof raw["format"] === "string") node.format = raw["format"];
  if (Array.isArray(raw["enum"])) node.enum = raw["enum"];
  if ("const" in raw) {
    node.hasConst = true;
    node.const = raw["const"];
  }
  if ("default" in raw) {
    node.hasDefault = true;
    node.default = raw["default"];
  }
  if (typeof raw["title"] === "string") node.title = raw["title"];
  if (typeof raw["description"] === "string") node.description = raw["description"];
  if (raw["deprecated"] === true) node.deprecated = true;
  if (raw["readOnly"] === true) node.readOnly = true;
  if (raw["writeOnly"] === true) node.writeOnly = true;
  if (typeof raw["pattern"] === "string") node.pattern = raw["pattern"];
  if (typeof raw["uniqueItems"] === "boolean") node.uniqueItems = raw["uniqueItems"];

  for (const key of NUMERIC_KEYS) {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v)) node[key] = v;
  }
  // OpenAPI 3.0 boolean exclusive bounds.
  if (raw["exclusiveMinimum"] === true && node.minimum !== undefined) {
    node.exclusiveMinimum = node.minimum;
    delete node.minimum;
  }
  if (raw["exclusiveMaximum"] === true && node.maximum !== undefined) {
    node.exclusiveMaximum = node.maximum;
    delete node.maximum;
  }

  const props = raw["properties"];
  if (isRecord(props)) {
    for (const [name, sub] of Object.entries(props)) {
      node.properties.set(name, walk(sub, ctx, depth + 1));
    }
  }
  const required = raw["required"];
  if (Array.isArray(required)) {
    for (const r of required) if (typeof r === "string") node.required.add(r);
  }
  const ap = raw["additionalProperties"];
  if (ap === false) node.additionalProperties = false;
  else if (ap === true) node.additionalProperties = true;
  else if (isRecord(ap)) node.additionalProperties = walk(ap, ctx, depth + 1);

  const items = raw["items"];
  if (Array.isArray(items)) {
    // Draft-04 style tuple; treat as prefixItems.
    node.prefixItems = items.map((i) => walk(i, ctx, depth + 1));
  } else if (items !== undefined && items !== null) {
    node.items = walk(items, ctx, depth + 1);
  }
  const prefixItems = raw["prefixItems"];
  if (Array.isArray(prefixItems))
    node.prefixItems = prefixItems.map((i) => walk(i, ctx, depth + 1));

  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const branches = raw[key];
    if (Array.isArray(branches)) node[key] = branches.map((b) => walk(b, ctx, depth + 1));
  }
  if (raw["not"] !== undefined) node.not = walk(raw["not"], ctx, depth + 1);

  const disc = raw["discriminator"];
  if (isRecord(disc) && typeof disc["propertyName"] === "string")
    node.discriminator = disc["propertyName"];

  if (node.allOf !== undefined) mergeAllOf(node);
}

/**
 * Fold an allOf of plain object schemas into the parent so that the common
 * "base + extension" pattern diffs as one object. Anything with alternatives, negation
 * or non-object types is left as an allOf and diffed branch by branch.
 */
function mergeAllOf(node: SchemaNode): void {
  const branches = node.allOf;
  if (branches === undefined) return;
  const mergeable = branches.every(
    (b) =>
      b.cycle === undefined &&
      b.oneOf === undefined &&
      b.anyOf === undefined &&
      b.not === undefined &&
      b.enum === undefined &&
      !b.hasConst &&
      b.items === undefined &&
      (b.types === undefined || (b.types.length === 1 && b.types[0] === "object")),
  );
  if (!mergeable) return;
  for (const b of branches) {
    for (const [k, v] of b.properties) if (!node.properties.has(k)) node.properties.set(k, v);
    for (const r of b.required) node.required.add(r);
    if (b.additionalProperties === false) node.additionalProperties = false;
    if (b.types !== undefined && node.types === undefined) node.types = [...b.types];
    for (const key of NUMERIC_KEYS) {
      if (b[key] !== undefined && node[key] === undefined) node[key] = b[key];
    }
    if (b.description !== undefined && node.description === undefined)
      node.description = b.description;
  }
  delete node.allOf;
}

/** Resolve a `#/a/b` pointer against the root. Returns undefined for anything else. */
export function resolveLocalRef(root: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const part of parts) {
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (isRecord(cur)) {
      if (!Object.hasOwn(cur, part)) return undefined;
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Escape a key for use in a JSON pointer segment. */
export function pointerSegment(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}
