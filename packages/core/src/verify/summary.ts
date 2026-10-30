import type { SchemaNode } from "../schema/model.js";

const MAX_SUMMARY_DEPTH = 4;
const MAX_PROPERTIES = 50;

/**
 * A compact, plain-JSON description of a schema for plans and messages. Never the
 * SchemaNode itself, which holds Maps and Sets. Depth-bounded.
 */
export function summarizeSchema(node: SchemaNode | undefined, depth = 0): unknown {
  if (node === undefined) return undefined;
  if (node.cycle !== undefined) return { $recursive: true };
  if (depth > MAX_SUMMARY_DEPTH) return { $truncated: true };
  const out: Record<string, unknown> = {};
  if (node.types !== undefined) out["type"] = node.types.length === 1 ? node.types[0] : node.types;
  if (node.format !== undefined) out["format"] = node.format;
  if (node.enum !== undefined) out["enum"] = node.enum.slice(0, 50);
  if (node.hasConst) out["const"] = node.const;
  if (node.hasDefault) out["default"] = node.default;
  if (node.description !== undefined) out["description"] = node.description.slice(0, 200);
  for (const k of [
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
    "pattern",
    "uniqueItems",
  ] as const) {
    if (node[k] !== undefined) out[k] = node[k];
  }
  if (node.nullable && !(node.types ?? []).includes("null")) out["nullable"] = true;
  if (node.deprecated) out["deprecated"] = true;
  if (node.readOnly) out["readOnly"] = true;
  if (node.writeOnly) out["writeOnly"] = true;
  if (node.properties.size > 0) {
    const props: Record<string, unknown> = {};
    let i = 0;
    for (const [name, sub] of node.properties) {
      if (i++ >= MAX_PROPERTIES) {
        props["$more"] = node.properties.size - MAX_PROPERTIES;
        break;
      }
      props[name] = summarizeSchema(sub, depth + 1);
    }
    out["properties"] = props;
  }
  if (node.required.size > 0) out["required"] = [...node.required];
  if (node.additionalProperties === false) out["additionalProperties"] = false;
  else if (typeof node.additionalProperties === "object") {
    out["additionalProperties"] = summarizeSchema(node.additionalProperties, depth + 1);
  }
  if (node.items !== undefined) out["items"] = summarizeSchema(node.items, depth + 1);
  if (node.prefixItems !== undefined)
    out["prefixItems"] = node.prefixItems.map((s) => summarizeSchema(s, depth + 1));
  for (const k of ["oneOf", "anyOf", "allOf"] as const) {
    const branches = node[k];
    if (branches !== undefined)
      out[k] = branches.slice(0, 20).map((b) => summarizeSchema(b, depth + 1));
  }
  if (node.not !== undefined) out["not"] = summarizeSchema(node.not, depth + 1);
  return out;
}
