import type { Config, Limits, Location, Severity } from "../types.js";

/**
 * Verification: does a running implementation match its spec?
 *
 * The engine never sends requests. A caller (the CLI, an agent, a proxy) executes
 * requests and hands back `Observation`s. The engine matches each observation to an
 * operation in the spec, validates both sides, and returns `Finding`s that say what is
 * wrong and how to fix it depending on which side is the source of truth.
 */

export interface ObservedRequest {
  method: string;
  /** Path as sent, without the server base URL. Query string may be included or given separately. */
  path: string;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  mediaType?: string;
  body?: unknown;
}

export interface ObservedResponse {
  status: number;
  headers?: Record<string, string>;
  mediaType?: string;
  body?: unknown;
}

export interface Observation {
  /** Caller-chosen identifier, echoed in findings. */
  id?: string;
  /** Hint from the caller, e.g. `GET /pets/{}`. The engine still verifies the match. */
  operationKey?: string;
  request: ObservedRequest;
  response: ObservedResponse;
  capturedAt?: string;
}

export interface Finding {
  /** From `verify/rules.ts`. Stable, documented, never renamed. */
  id: string;
  severity: Severity;
  location: Location;
  /** Plain text, control characters stripped, third-party text quoted. */
  message: string;
  /** Index into the observations array this finding came from, when there is one. */
  observation?: number;
  expected?: unknown;
  actual?: unknown;
  /** What to change, depending on which side is the source of truth. */
  fix: {
    /** If the spec is the source of truth: what to change in the implementation. */
    implementation: string;
    /** If the implementation is the source of truth: what to change in the spec. */
    spec: string;
  };
}

export interface VerifyCoverage {
  /** Operations in the spec. */
  operations: number;
  /** Operations with at least one matched observation. */
  observed: number;
  /** Observations that matched no operation. */
  unmatchedObservations: number;
}

export interface VerifyResult {
  kind: "openapi";
  findings: Finding[];
  summary: { breaking: number; warning: number; info: number; suppressed: number };
  coverage: VerifyCoverage;
}

export interface VerifyOptions {
  config?: Config;
  limits?: Partial<Limits>;
}

/** One parameter the caller must supply to exercise an operation. */
export interface PlannedParameter {
  in: string;
  name: string;
  required: boolean;
  /** A compact, serializable description of the schema (type, enum, format, constraints). */
  schema?: unknown;
  /** From the spec's example/examples/default, if any. */
  example?: unknown;
}

/**
 * A request the engine proposes from the spec, with the slots a caller or agent needs to
 * fill. The engine does not invent values; that is the caller's job.
 */
export interface PlannedRequest {
  operationKey: string;
  operationId?: string;
  method: string;
  /** Path template from the spec, e.g. `/pets/{petId}`. */
  pathTemplate: string;
  summary?: string;
  deprecated: boolean;
  parameters: PlannedParameter[];
  body?: { mediaType: string; required: boolean; schema?: unknown; example?: unknown };
  /** Security scheme names from the first alternative, so the caller knows what auth to attach. */
  security: string[];
  /** Status codes the spec documents for this operation. */
  expectedStatuses: string[];
}

/** A planned request with values filled in by the caller. */
export interface FilledRequest {
  operationKey: string;
  /** Keyed by `in:name`, e.g. `path:petId`, `query:limit`, `header:X-Tenant`. */
  values?: Record<string, unknown>;
  mediaType?: string;
  body?: unknown;
  headers?: Record<string, string>;
}
