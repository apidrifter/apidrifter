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
export { listRules, RULES, type RuleDefinition } from "./rules/registry.js";
export { diffSchemas, type SchemaEvent } from "./schema/diff.js";
export type { SchemaNode } from "./schema/model.js";
export { createNormalizeContext, normalizeSchema } from "./schema/normalize.js";
export { clean, clip, quote, safeString, truncate } from "./text.js";
export {
  type Change,
  type Config,
  DEFAULT_LIMITS,
  type DiffOptions,
  type DiffResult,
  type DiffSummary,
  type DocumentKind,
  type DocumentMeta,
  DriftwatchError,
  type DriftwatchErrorCode,
  type Limits,
  type Location,
  type Polarity,
  type Severity,
} from "./types.js";
