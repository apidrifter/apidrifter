import type { RuleDefinition } from "../rules/registry.js";
import type { Severity } from "../types.js";

/**
 * Everything `verify()` can report. Same shape as the change rules so the generated
 * reference can list both. IDs are public API: never renamed, never given a different
 * meaning.
 */
const FINDINGS: readonly RuleDefinition[] = [
  // Matching
  {
    id: "undocumented-operation",
    severity: "warning",
    source: "openapi",
    description: "An observed request matched no operation in the spec.",
  },
  {
    id: "deprecated-operation-in-use",
    severity: "info",
    source: "openapi",
    description: "An observed request used an operation the spec marks deprecated.",
  },
  // Response status and shape
  {
    id: "undocumented-status",
    severity: "breaking",
    source: "openapi",
    description:
      "The implementation returned a status the spec does not document and there is no default response.",
  },
  {
    id: "undocumented-response-media-type",
    severity: "warning",
    source: "openapi",
    description:
      "The implementation returned a media type the spec does not document for that status.",
  },
  {
    id: "response-body-not-json",
    severity: "warning",
    source: "openapi",
    description: "The spec documents a JSON response but the body could not be parsed as JSON.",
  },
  {
    id: "response-missing-required-property",
    severity: "breaking",
    source: "openapi",
    description: "A property the spec marks required was absent from the response.",
  },
  {
    id: "response-undocumented-property",
    severity: "info",
    source: "openapi",
    description: "The response contained a property the spec does not document.",
  },
  {
    id: "response-forbidden-property",
    severity: "breaking",
    source: "openapi",
    description:
      "The response contained a property the spec forbids (additionalProperties: false).",
  },
  {
    id: "response-type-mismatch",
    severity: "breaking",
    source: "openapi",
    description: "A response value had a different type than the spec declares.",
  },
  {
    id: "response-enum-violation",
    severity: "breaking",
    source: "openapi",
    description: "A response value was outside the enum or const the spec declares.",
  },
  {
    id: "response-null-not-allowed",
    severity: "breaking",
    source: "openapi",
    description: "A response value was null where the spec does not allow null.",
  },
  {
    id: "response-constraint-violation",
    severity: "warning",
    source: "openapi",
    description:
      "A response value violated a bound, length, pattern, format, multipleOf or uniqueness constraint.",
  },
  {
    id: "response-composition-violation",
    severity: "breaking",
    source: "openapi",
    description: "A response value did not satisfy a oneOf, anyOf, allOf or not constraint.",
  },
  {
    id: "response-header-missing",
    severity: "warning",
    source: "openapi",
    description: "A response header the spec marks required was absent.",
  },
  // Cross-checks between request validity and the implementation's verdict
  {
    id: "request-rejected-but-valid",
    severity: "breaking",
    source: "openapi",
    description:
      "The request conformed to the spec but the implementation rejected it with 400 or 422.",
  },
  {
    id: "request-accepted-but-invalid",
    severity: "warning",
    source: "openapi",
    description: "The request violated the spec but the implementation accepted it with a 2xx.",
  },
  // Request non-conformance details (explain request-accepted-but-invalid)
  {
    id: "request-missing-required-parameter",
    severity: "info",
    source: "openapi",
    description: "The observed request omitted a parameter the spec marks required.",
  },
  {
    id: "request-missing-body",
    severity: "info",
    source: "openapi",
    description: "The observed request omitted a request body the spec marks required.",
  },
  {
    id: "request-undocumented-media-type",
    severity: "info",
    source: "openapi",
    description: "The observed request body used a media type the spec does not document.",
  },
  {
    id: "request-missing-required-property",
    severity: "info",
    source: "openapi",
    description: "The observed request body omitted a property the spec marks required.",
  },
  {
    id: "request-undocumented-property",
    severity: "info",
    source: "openapi",
    description: "The observed request contained a property the spec does not document or forbids.",
  },
  {
    id: "request-type-mismatch",
    severity: "info",
    source: "openapi",
    description: "An observed request value had a different type than the spec declares.",
  },
  {
    id: "request-enum-violation",
    severity: "info",
    source: "openapi",
    description: "An observed request value was outside the enum or const the spec declares.",
  },
  {
    id: "request-constraint-violation",
    severity: "info",
    source: "openapi",
    description:
      "An observed request value violated a bound, length, pattern, format, multipleOf or uniqueness constraint.",
  },
  {
    id: "request-schema-violation",
    severity: "info",
    source: "openapi",
    description:
      "An observed request value did not satisfy a oneOf, anyOf, allOf or not constraint.",
  },
  // Engine limitations
  {
    id: "pattern-not-checked",
    severity: "info",
    source: "openapi",
    description:
      "A pattern in the spec was skipped because it was too long, failed to compile or looked unsafe to evaluate.",
  },
];

function build(): ReadonlyMap<string, RuleDefinition> {
  const map = new Map<string, RuleDefinition>();
  for (const def of FINDINGS) {
    if (map.has(def.id)) throw new Error(`duplicate finding id ${def.id}`);
    map.set(def.id, def);
  }
  return map;
}

export const FINDING_RULES: ReadonlyMap<string, RuleDefinition> = build();

export function listFindingRules(): RuleDefinition[] {
  return [...FINDING_RULES.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Default severity for a finding. Throws for unknown IDs: that is a bug in the engine. */
export function findingSeverity(id: string): Severity {
  const def = FINDING_RULES.get(id);
  if (def === undefined) throw new Error(`unknown finding id ${id}`);
  return def.severity;
}
