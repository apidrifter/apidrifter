/**
 * MIRROR of packages/core/src/verify/types.ts.
 *
 * MERGE NOTE: once @driftwatch/core exports the verify contract, delete this file and
 * change the `import type` lines in core-verify.ts and executor.ts to import these names
 * from "@driftwatch/core". Nothing else in the CLI references this file.
 */
import type { Config, Limits, Location, Severity } from "@driftwatch/core";

export interface ObservedRequest {
  method: string;
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
  id?: string;
  operationKey?: string;
  request: ObservedRequest;
  response: ObservedResponse;
  capturedAt?: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  location: Location;
  message: string;
  observation?: number;
  expected?: unknown;
  actual?: unknown;
  fix: { implementation: string; spec: string };
}

export interface VerifyCoverage {
  operations: number;
  observed: number;
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

export interface PlannedParameter {
  in: string;
  name: string;
  required: boolean;
  schema?: unknown;
  example?: unknown;
}

export interface PlannedRequest {
  operationKey: string;
  operationId?: string;
  method: string;
  pathTemplate: string;
  summary?: string;
  deprecated: boolean;
  parameters: PlannedParameter[];
  body?: { mediaType: string; required: boolean; schema?: unknown; example?: unknown };
  security: string[];
  expectedStatuses: string[];
}

export interface FilledRequest {
  operationKey: string;
  values?: Record<string, unknown>;
  mediaType?: string;
  body?: unknown;
  headers?: Record<string, string>;
}
