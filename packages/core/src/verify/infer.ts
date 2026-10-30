import { emptySchema, type SchemaNode } from "../schema/model.js";

const MAX_DEPTH = 32;

/**
 * Infer a schema from observed values. Types are the union across samples, a property
 * is required when every object sample has it, array items are inferred from every
 * element, and null is recorded as a type when seen. Intended to feed "observed surface
 * versus spec surface" drift; deliberately simple.
 */
export function inferSchema(samples: unknown[]): SchemaNode {
  return infer(samples, 0);
}

function infer(samples: unknown[], depth: number): SchemaNode {
  const node = emptySchema();
  if (samples.length === 0 || depth > MAX_DEPTH) return node;
  const types = new Set<string>();
  const objects: Record<string, unknown>[] = [];
  const arrays: unknown[][] = [];
  for (const s of samples) {
    if (s === null) types.add("null");
    else if (typeof s === "boolean") types.add("boolean");
    else if (typeof s === "number") types.add(Number.isInteger(s) ? "integer" : "number");
    else if (typeof s === "string") types.add("string");
    else if (Array.isArray(s)) {
      types.add("array");
      arrays.push(s);
    } else if (typeof s === "object") {
      types.add("object");
      objects.push(s as Record<string, unknown>);
    }
  }
  if (types.has("number")) types.delete("integer");
  node.types = [...types].sort();

  if (objects.length > 0) {
    const byName = new Map<string, unknown[]>();
    for (const o of objects) {
      for (const [k, v] of Object.entries(o)) {
        const list = byName.get(k);
        if (list === undefined) byName.set(k, [v]);
        else list.push(v);
      }
    }
    for (const [k, values] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
      node.properties.set(k, infer(values, depth + 1));
      if (values.length === objects.length) node.required.add(k);
    }
  }
  if (arrays.length > 0) {
    const items = arrays.flat(1);
    if (items.length > 0) node.items = infer(items, depth + 1);
  }
  return node;
}
