/**
 * Normalized schema. Produced by `normalizeSchema`, consumed by `diffSchemas`.
 * References are resolved, OpenAPI 3.0 idioms are translated to JSON Schema terms,
 * and cycles are represented explicitly rather than followed.
 */
export interface SchemaNode {
  /** Sorted. Includes "null" when the value may be null. Undefined means any type. */
  types?: string[];
  format?: string;
  enum?: unknown[];
  hasConst: boolean;
  const?: unknown;
  properties: Map<string, SchemaNode>;
  required: Set<string>;
  /** `true` (default) allows unknown properties; `false` rejects them; a node constrains them. */
  additionalProperties: boolean | SchemaNode;
  items?: SchemaNode;
  prefixItems?: SchemaNode[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minProperties?: number;
  maxProperties?: number;
  multipleOf?: number;
  pattern?: string;
  uniqueItems?: boolean;
  oneOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  allOf?: SchemaNode[];
  not?: SchemaNode;
  title?: string;
  description?: string;
  hasDefault: boolean;
  default?: unknown;
  deprecated: boolean;
  readOnly: boolean;
  writeOnly: boolean;
  discriminator?: string;
  /** Set when this node refers back to an ancestor; value is that ancestor's ref pointer. */
  cycle?: string;
  /** The `$ref` this node was resolved from, for naming in messages and branch matching. */
  ref?: string;
}

export function emptySchema(): SchemaNode {
  return {
    hasConst: false,
    properties: new Map(),
    required: new Set(),
    additionalProperties: true,
    hasDefault: false,
    deprecated: false,
    readOnly: false,
    writeOnly: false,
  };
}
