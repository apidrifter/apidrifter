export { applyConfig, compileSubjectPattern, validateConfig } from "./config.js";
export { detectKind, diff } from "./diff.js";
export { fingerprint } from "./fingerprint.js";
export { diffMcp } from "./mcp/diff.js";
export type { McpSnapshotDocument, McpSurface } from "./mcp/model.js";
export { isMcpDocument, normalizeMcp } from "./mcp/normalize.js";
export { suspiciousReasons } from "./mcp/suspicious.js";
export { diffOpenApi } from "./openapi/diff.js";
export type { Operation, Surface } from "./openapi/model.js";
export {
  isOpenApiDocument,
  isSwagger2Document,
  normalizeOpenApi,
  normalizePath,
} from "./openapi/normalize.js";
export { isRecord, type ParseOptions, parseDocument } from "./parse.js";
export { formatLocation } from "./render/location.js";
export { renderMarkdown } from "./render/markdown.js";
export { renderText } from "./render/text.js";
// Verification
export { renderVerifyMarkdown } from "./render/verify-markdown.js";
export { renderVerifyText } from "./render/verify-text.js";
export { listRules, RULES, type RuleDefinition } from "./rules/registry.js";
export { diffSchemas, type SchemaEvent } from "./schema/diff.js";
export type { SchemaNode } from "./schema/model.js";
export { createNormalizeContext, normalizeSchema } from "./schema/normalize.js";
export { clean, clip, quote, safeString, truncate } from "./text.js";
export {
  ApidrifterError,
  type ApidrifterErrorCode,
  type Change,
  type Config,
  DEFAULT_LIMITS,
  type DiffOptions,
  type DiffResult,
  type DiffSummary,
  type DocumentKind,
  type DocumentMeta,
  type Limits,
  type Location,
  type Polarity,
  type Severity,
} from "./types.js";
export { inferSchema } from "./verify/infer.js";
export { matchOperation, type OperationMatch, parseQuery } from "./verify/match.js";
export { plan } from "./verify/plan.js";
export { FINDING_RULES, findingSeverity, listFindingRules } from "./verify/rules.js";
export { summarizeSchema } from "./verify/summary.js";
export type {
  FilledRequest,
  Finding,
  Observation,
  ObservedRequest,
  ObservedResponse,
  PlannedParameter,
  PlannedRequest,
  VerifyCoverage,
  VerifyOptions,
  VerifyResult,
} from "./verify/types.js";
export {
  compilePattern,
  looksCatastrophic,
  type Violation,
  type ViolationKind,
  validate,
} from "./verify/validate.js";
export { fingerprintFinding, validateVerifyConfig, verify } from "./verify/verify.js";
