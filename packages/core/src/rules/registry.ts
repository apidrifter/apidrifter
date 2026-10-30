import type { DocumentKind, Polarity, Severity } from "../types.js";

/**
 * The single table of everything the engine can report. `docs/rules.md` is generated
 * from it. IDs are public API: never renamed, never given a different meaning.
 */
export interface RuleDefinition {
  id: string;
  severity: Severity;
  source: DocumentKind | "both";
  description: string;
}

/**
 * Schema events are defined once with a severity for each polarity, then expanded for
 * every place a schema can appear. `null` means the event is not reported for that
 * polarity.
 */
interface SchemaEventDef {
  event: string;
  input: Severity | null;
  output: Severity | null;
  description: string;
}

const SCHEMA_EVENTS: readonly SchemaEventDef[] = [
  {
    event: "schema-added",
    input: "breaking",
    output: "info",
    description: "A schema now constrains a value that previously had none.",
  },
  {
    event: "schema-removed",
    input: "info",
    output: "warning",
    description: "A value that had a schema no longer has one; anything may appear.",
  },
  {
    event: "property-added",
    input: "info",
    output: "info",
    description: "An optional property was added, or a required one with a default.",
  },
  {
    event: "required-property-added",
    input: "breaking",
    output: "info",
    description: "A required property without a default was added.",
  },
  {
    event: "property-removed",
    input: "warning",
    output: "breaking",
    description: "A property was removed.",
  },
  {
    event: "property-became-required",
    input: "breaking",
    output: "info",
    description: "An existing property became required.",
  },
  {
    event: "property-became-optional",
    input: "info",
    output: "breaking",
    description: "A required property became optional.",
  },
  {
    event: "type-changed",
    input: "breaking",
    output: "breaking",
    description: "The type changed to something incompatible.",
  },
  {
    event: "type-widened",
    input: "info",
    output: "breaking",
    description: "The set of allowed types grew.",
  },
  {
    event: "type-narrowed",
    input: "breaking",
    output: "info",
    description: "The set of allowed types shrank.",
  },
  {
    event: "nullable-added",
    input: "info",
    output: "breaking",
    description: "The value may now be null.",
  },
  {
    event: "nullable-removed",
    input: "breaking",
    output: "info",
    description: "The value may no longer be null.",
  },
  {
    event: "enum-added",
    input: "breaking",
    output: "info",
    description: "The value is now restricted to an enum.",
  },
  {
    event: "enum-removed",
    input: "info",
    output: "warning",
    description: "The value is no longer restricted to an enum.",
  },
  {
    event: "enum-value-added",
    input: "info",
    output: "warning",
    description: "A value was added to an enum.",
  },
  {
    event: "enum-value-removed",
    input: "breaking",
    output: "info",
    description: "A value was removed from an enum.",
  },
  {
    event: "const-changed",
    input: "breaking",
    output: "breaking",
    description: "A constant value changed.",
  },
  {
    event: "format-changed",
    input: "warning",
    output: "warning",
    description: "The format annotation changed.",
  },
  {
    event: "pattern-added",
    input: "breaking",
    output: "info",
    description: "A pattern constraint was added.",
  },
  {
    event: "pattern-removed",
    input: "info",
    output: "warning",
    description: "A pattern constraint was removed.",
  },
  {
    event: "pattern-changed",
    input: "warning",
    output: "warning",
    description: "A pattern constraint changed.",
  },
  {
    event: "min-added",
    input: "breaking",
    output: "info",
    description: "A minimum constraint was added.",
  },
  {
    event: "min-removed",
    input: "info",
    output: "warning",
    description: "A minimum constraint was removed.",
  },
  {
    event: "min-increased",
    input: "breaking",
    output: "info",
    description: "A minimum constraint increased.",
  },
  {
    event: "min-decreased",
    input: "info",
    output: "warning",
    description: "A minimum constraint decreased.",
  },
  {
    event: "max-added",
    input: "breaking",
    output: "info",
    description: "A maximum constraint was added.",
  },
  {
    event: "max-removed",
    input: "info",
    output: "warning",
    description: "A maximum constraint was removed.",
  },
  {
    event: "max-decreased",
    input: "breaking",
    output: "info",
    description: "A maximum constraint decreased.",
  },
  {
    event: "max-increased",
    input: "info",
    output: "warning",
    description: "A maximum constraint increased.",
  },
  {
    event: "multiple-of-changed",
    input: "warning",
    output: "warning",
    description: "The multipleOf constraint changed.",
  },
  {
    event: "unique-items-added",
    input: "breaking",
    output: "info",
    description: "Array items must now be unique.",
  },
  {
    event: "unique-items-removed",
    input: "info",
    output: "warning",
    description: "Array items no longer need to be unique.",
  },
  {
    event: "items-added",
    input: "breaking",
    output: "info",
    description: "Array items are now constrained by a schema.",
  },
  {
    event: "items-removed",
    input: "info",
    output: "warning",
    description: "Array items are no longer constrained by a schema.",
  },
  {
    event: "additional-properties-disallowed",
    input: "breaking",
    output: "info",
    description: "Unknown properties are now rejected.",
  },
  {
    event: "additional-properties-allowed",
    input: "info",
    output: "warning",
    description: "Unknown properties are now allowed.",
  },
  {
    event: "default-added",
    input: "info",
    output: "info",
    description: "A default value was added.",
  },
  {
    event: "default-removed",
    input: "warning",
    output: "info",
    description: "A default value was removed.",
  },
  {
    event: "default-changed",
    input: "warning",
    output: "warning",
    description: "A default value changed.",
  },
  {
    event: "deprecated",
    input: "warning",
    output: "warning",
    description: "The value was marked deprecated.",
  },
  {
    event: "undeprecated",
    input: "info",
    output: "info",
    description: "The value is no longer marked deprecated.",
  },
  {
    event: "description-changed",
    input: "info",
    output: "info",
    description: "The description changed.",
  },
  {
    event: "one-of-branch-added",
    input: "info",
    output: "warning",
    description: "An alternative was added to a oneOf or anyOf.",
  },
  {
    event: "one-of-branch-removed",
    input: "breaking",
    output: "info",
    description: "An alternative was removed from a oneOf or anyOf.",
  },
  {
    event: "all-of-branch-added",
    input: "breaking",
    output: "info",
    description: "A constraint was added to an allOf.",
  },
  {
    event: "all-of-branch-removed",
    input: "info",
    output: "warning",
    description: "A constraint was removed from an allOf.",
  },
  {
    event: "recursion-changed",
    input: "warning",
    output: "warning",
    description: "A schema became recursive or stopped being recursive.",
  },
];

/** Where schemas appear, with their polarity and the ID prefix used for their events. */
export const SCHEMA_PREFIXES: Readonly<
  Record<string, { polarity: Polarity; source: DocumentKind }>
> = Object.freeze({
  "request-parameter": { polarity: "input", source: "openapi" },
  "request-property": { polarity: "input", source: "openapi" },
  "response-property": { polarity: "output", source: "openapi" },
  "response-header": { polarity: "output", source: "openapi" },
  "tool-input-property": { polarity: "input", source: "mcp" },
  "tool-output-property": { polarity: "output", source: "mcp" },
});

export type SchemaPrefix = keyof typeof SCHEMA_PREFIXES;

const EXPLICIT: readonly RuleDefinition[] = [
  // OpenAPI: document level
  {
    id: "api-title-changed",
    severity: "info",
    source: "openapi",
    description: "The API title changed.",
  },
  {
    id: "api-version-changed",
    severity: "info",
    source: "openapi",
    description: "The API version string changed.",
  },
  {
    id: "api-server-added",
    severity: "info",
    source: "openapi",
    description: "A server URL was added.",
  },
  {
    id: "api-server-removed",
    severity: "warning",
    source: "openapi",
    description: "A server URL was removed.",
  },
  {
    id: "security-scheme-added",
    severity: "info",
    source: "openapi",
    description: "A security scheme was defined.",
  },
  {
    id: "security-scheme-removed",
    severity: "breaking",
    source: "openapi",
    description: "A security scheme was removed.",
  },
  {
    id: "security-scheme-changed",
    severity: "breaking",
    source: "openapi",
    description: "A security scheme's type, location or flow changed.",
  },
  // OpenAPI: endpoints
  {
    id: "endpoint-added",
    severity: "info",
    source: "openapi",
    description: "An operation was added.",
  },
  {
    id: "endpoint-removed",
    severity: "breaking",
    source: "openapi",
    description: "An operation was removed without having been deprecated.",
  },
  {
    id: "deprecated-endpoint-removed",
    severity: "warning",
    source: "openapi",
    description: "A previously deprecated operation was removed.",
  },
  {
    id: "endpoint-deprecated",
    severity: "warning",
    source: "openapi",
    description: "An operation was marked deprecated.",
  },
  {
    id: "endpoint-undeprecated",
    severity: "info",
    source: "openapi",
    description: "An operation is no longer deprecated.",
  },
  {
    id: "endpoint-operation-id-added",
    severity: "info",
    source: "openapi",
    description: "An operation gained an operationId.",
  },
  {
    id: "endpoint-operation-id-removed",
    severity: "warning",
    source: "openapi",
    description: "An operation lost its operationId; generated clients will change.",
  },
  {
    id: "endpoint-operation-id-changed",
    severity: "warning",
    source: "openapi",
    description: "An operationId changed; generated clients will change.",
  },
  {
    id: "endpoint-summary-changed",
    severity: "info",
    source: "openapi",
    description: "An operation's summary changed.",
  },
  {
    id: "endpoint-description-changed",
    severity: "info",
    source: "openapi",
    description: "An operation's description changed.",
  },
  // OpenAPI: parameters
  {
    id: "request-parameter-added",
    severity: "info",
    source: "openapi",
    description: "An optional parameter was added.",
  },
  {
    id: "request-required-parameter-added",
    severity: "breaking",
    source: "openapi",
    description: "A required parameter was added.",
  },
  {
    id: "request-parameter-removed",
    severity: "warning",
    source: "openapi",
    description: "A parameter was removed; clients still sending it may be rejected.",
  },
  {
    id: "request-parameter-became-required",
    severity: "breaking",
    source: "openapi",
    description: "An optional parameter became required.",
  },
  {
    id: "request-parameter-became-optional",
    severity: "info",
    source: "openapi",
    description: "A required parameter became optional.",
  },
  // request-parameter-deprecated / -undeprecated come from the schema event table and are
  // also used for the parameter-level `deprecated` flag.
  // OpenAPI: request body
  {
    id: "request-body-added",
    severity: "info",
    source: "openapi",
    description: "An optional request body was added.",
  },
  {
    id: "request-required-body-added",
    severity: "breaking",
    source: "openapi",
    description: "A required request body was added.",
  },
  {
    id: "request-body-removed",
    severity: "warning",
    source: "openapi",
    description: "The request body was removed.",
  },
  {
    id: "request-body-became-required",
    severity: "breaking",
    source: "openapi",
    description: "The request body became required.",
  },
  {
    id: "request-body-became-optional",
    severity: "info",
    source: "openapi",
    description: "The request body became optional.",
  },
  {
    id: "request-body-media-type-added",
    severity: "info",
    source: "openapi",
    description: "The request body accepts a new media type.",
  },
  {
    id: "request-body-media-type-removed",
    severity: "breaking",
    source: "openapi",
    description: "The request body no longer accepts a media type.",
  },
  // OpenAPI: responses
  {
    id: "response-added",
    severity: "info",
    source: "openapi",
    description: "A response status was added.",
  },
  {
    id: "response-removed",
    severity: "breaking",
    source: "openapi",
    description: "A response status was removed.",
  },
  {
    id: "response-description-changed",
    severity: "info",
    source: "openapi",
    description: "A response description changed.",
  },
  {
    id: "response-media-type-added",
    severity: "info",
    source: "openapi",
    description: "A response may now be returned in a new media type.",
  },
  {
    id: "response-media-type-removed",
    severity: "breaking",
    source: "openapi",
    description: "A response media type was removed.",
  },
  {
    id: "response-header-added",
    severity: "info",
    source: "openapi",
    description: "A response header was added.",
  },
  {
    id: "response-header-removed",
    severity: "breaking",
    source: "openapi",
    description: "A response header was removed.",
  },
  {
    id: "response-header-became-optional",
    severity: "breaking",
    source: "openapi",
    description: "A required response header became optional.",
  },
  {
    id: "response-header-became-required",
    severity: "info",
    source: "openapi",
    description: "An optional response header became required.",
  },
  // OpenAPI: security requirements
  {
    id: "security-added",
    severity: "breaking",
    source: "openapi",
    description: "Authentication is now required where none was before.",
  },
  {
    id: "security-removed",
    severity: "info",
    source: "openapi",
    description: "Authentication is no longer required.",
  },
  {
    id: "security-requirement-added",
    severity: "info",
    source: "openapi",
    description: "A new way to authenticate was added.",
  },
  {
    id: "security-requirement-removed",
    severity: "breaking",
    source: "openapi",
    description: "A way to authenticate was removed.",
  },
  {
    id: "security-scope-added",
    severity: "breaking",
    source: "openapi",
    description: "An additional scope is now required.",
  },
  {
    id: "security-scope-removed",
    severity: "info",
    source: "openapi",
    description: "A scope is no longer required.",
  },
  // MCP: server
  {
    id: "server-name-changed",
    severity: "info",
    source: "mcp",
    description: "The server name changed.",
  },
  {
    id: "server-version-changed",
    severity: "info",
    source: "mcp",
    description: "The server version changed.",
  },
  {
    id: "server-instructions-changed",
    severity: "warning",
    source: "mcp",
    description: "The server instructions changed; this alters agent behavior.",
  },
  {
    id: "server-instructions-injection-suspected",
    severity: "warning",
    source: "mcp",
    description:
      "The server instructions contain language that looks aimed at overriding an agent.",
  },
  {
    id: "server-capability-added",
    severity: "info",
    source: "mcp",
    description: "The server advertises a new capability.",
  },
  {
    id: "server-capability-removed",
    severity: "breaking",
    source: "mcp",
    description: "The server no longer advertises a capability.",
  },
  // MCP: tools
  { id: "tool-added", severity: "info", source: "mcp", description: "A tool was added." },
  { id: "tool-removed", severity: "breaking", source: "mcp", description: "A tool was removed." },
  {
    id: "tool-title-changed",
    severity: "info",
    source: "mcp",
    description: "A tool's title changed.",
  },
  {
    id: "tool-description-changed",
    severity: "warning",
    source: "mcp",
    description: "A tool's description changed; agents choose and use tools by description.",
  },
  {
    id: "tool-description-injection-suspected",
    severity: "warning",
    source: "mcp",
    description: "A tool description contains language that looks aimed at overriding an agent.",
  },
  {
    id: "tool-annotation-changed",
    severity: "warning",
    source: "mcp",
    description: "A tool's behavior annotations changed (for example destructiveHint).",
  },
  {
    id: "tool-output-schema-added",
    severity: "info",
    source: "mcp",
    description: "A tool now declares an output schema.",
  },
  {
    id: "tool-output-schema-removed",
    severity: "warning",
    source: "mcp",
    description: "A tool no longer declares an output schema.",
  },
  // MCP: resources
  { id: "resource-added", severity: "info", source: "mcp", description: "A resource was added." },
  {
    id: "resource-removed",
    severity: "breaking",
    source: "mcp",
    description: "A resource was removed.",
  },
  {
    id: "resource-name-changed",
    severity: "info",
    source: "mcp",
    description: "A resource's name changed.",
  },
  {
    id: "resource-description-changed",
    severity: "info",
    source: "mcp",
    description: "A resource's description changed.",
  },
  {
    id: "resource-mime-type-changed",
    severity: "warning",
    source: "mcp",
    description: "A resource's MIME type changed.",
  },
  {
    id: "resource-template-added",
    severity: "info",
    source: "mcp",
    description: "A resource template was added.",
  },
  {
    id: "resource-template-removed",
    severity: "breaking",
    source: "mcp",
    description: "A resource template was removed.",
  },
  {
    id: "resource-template-changed",
    severity: "warning",
    source: "mcp",
    description: "A resource template's name, description or MIME type changed.",
  },
  // MCP: prompts
  { id: "prompt-added", severity: "info", source: "mcp", description: "A prompt was added." },
  {
    id: "prompt-removed",
    severity: "breaking",
    source: "mcp",
    description: "A prompt was removed.",
  },
  {
    id: "prompt-description-changed",
    severity: "info",
    source: "mcp",
    description: "A prompt's description changed.",
  },
  {
    id: "prompt-argument-added",
    severity: "info",
    source: "mcp",
    description: "An optional prompt argument was added.",
  },
  {
    id: "prompt-required-argument-added",
    severity: "breaking",
    source: "mcp",
    description: "A required prompt argument was added.",
  },
  {
    id: "prompt-argument-removed",
    severity: "warning",
    source: "mcp",
    description: "A prompt argument was removed.",
  },
  {
    id: "prompt-argument-became-required",
    severity: "breaking",
    source: "mcp",
    description: "A prompt argument became required.",
  },
  {
    id: "prompt-argument-became-optional",
    severity: "info",
    source: "mcp",
    description: "A prompt argument became optional.",
  },
  {
    id: "prompt-argument-description-changed",
    severity: "info",
    source: "mcp",
    description: "A prompt argument's description changed.",
  },
];

function buildRegistry(): ReadonlyMap<string, RuleDefinition> {
  const map = new Map<string, RuleDefinition>();
  const add = (def: RuleDefinition) => {
    if (map.has(def.id)) throw new Error(`duplicate rule id ${def.id}`);
    map.set(def.id, def);
  };
  for (const def of EXPLICIT) add(def);
  for (const [prefix, meta] of Object.entries(SCHEMA_PREFIXES)) {
    for (const ev of SCHEMA_EVENTS) {
      const severity = ev[meta.polarity];
      if (severity === null) continue;
      add({
        id: `${prefix}-${ev.event}`,
        severity,
        source: meta.source,
        description: `${ev.description} (${meta.polarity} schema under ${prefix})`,
      });
    }
  }
  return map;
}

export const RULES: ReadonlyMap<string, RuleDefinition> = buildRegistry();

export function listRules(): RuleDefinition[] {
  return [...RULES.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Default severity for a rule. Throws for unknown IDs: that is a bug in the engine. */
export function ruleSeverity(id: string): Severity {
  const def = RULES.get(id);
  if (def === undefined) throw new Error(`unknown rule id ${id}`);
  return def.severity;
}

export function schemaEventId(prefix: SchemaPrefix, event: string): string {
  return `${prefix}-${event}`;
}

/** Whether a schema event is reported at all for a polarity. */
export function schemaEventReported(prefix: SchemaPrefix, event: string): boolean {
  return RULES.has(`${prefix}-${event}`);
}
