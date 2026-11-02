import { applyConfig, validateConfig } from "./config.js";
import { enforceShape, resolveLimits } from "./limits.js";
import { diffMcp } from "./mcp/diff.js";
import { isMcpDocument, mcpMeta, normalizeMcp } from "./mcp/normalize.js";
import { diffOpenApi } from "./openapi/diff.js";
import {
  isOpenApiDocument,
  isSwagger2Document,
  normalizeOpenApi,
  openApiMeta,
} from "./openapi/normalize.js";
import { locationKey } from "./render/location.js";
import { clip, safeString } from "./text.js";
import {
  ApidrifterError,
  type Change,
  type DiffOptions,
  type DiffResult,
  type DocumentKind,
  type DocumentMeta,
  type Limits,
} from "./types.js";

/** Detect what kind of document a parsed value is. */
export function detectKind(doc: unknown): DocumentKind | "swagger2" | "unknown" {
  if (isOpenApiDocument(doc)) return "openapi";
  if (isSwagger2Document(doc)) return "swagger2";
  if (isMcpDocument(doc)) return "mcp";
  return "unknown";
}

/**
 * Diff two parsed documents. Both must be the same kind. Deterministic: the same inputs
 * always produce the same output, byte for byte.
 */
export function diff(before: unknown, after: unknown, options: DiffOptions = {}): DiffResult {
  const limits = resolveLimits(options.limits);
  const config = validateConfig(options.config);
  enforceShape(before, limits);
  enforceShape(after, limits);

  const kind = options.kind ?? resolveKind(before, after);
  if (!isRecordLike(before) || !isRecordLike(after)) {
    throw new ApidrifterError("unsupported-document", "documents must be objects");
  }

  let changes: Change[];
  let beforeMeta: DocumentMeta;
  let afterMeta: DocumentMeta;
  if (kind === "openapi") {
    beforeMeta = openApiMeta(before);
    afterMeta = openApiMeta(after);
    changes = diffOpenApi(
      normalizeOpenApi(before, limits),
      normalizeOpenApi(after, limits),
      limits,
    );
  } else {
    beforeMeta = mcpMeta(before);
    afterMeta = mcpMeta(after);
    changes = diffMcp(normalizeMcp(before, limits), normalizeMcp(after, limits), limits);
  }

  changes = changes.map((c) => finalize(c, limits));
  changes.sort(compareChanges);
  const applied = applyConfig(changes, config);

  const summary = { breaking: 0, warning: 0, info: 0, suppressed: applied.suppressed };
  for (const c of applied.changes) summary[c.severity]++;
  return {
    kind,
    before: sanitizeMeta(beforeMeta, limits),
    after: sanitizeMeta(afterMeta, limits),
    changes: applied.changes,
    summary,
    hasBreaking: summary.breaking > 0,
  };
}

function resolveKind(before: unknown, after: unknown): DocumentKind {
  const b = detectKind(before);
  const a = detectKind(after);
  if (b === "swagger2" || a === "swagger2") {
    throw new ApidrifterError(
      "unsupported-document",
      "Swagger 2.0 is not supported; convert to OpenAPI 3 first",
    );
  }
  if (b === "unknown" || a === "unknown") {
    throw new ApidrifterError(
      "unsupported-document",
      "could not detect document kind; expected OpenAPI 3.x or an MCP snapshot",
    );
  }
  if (b !== a) throw new ApidrifterError("kind-mismatch", `cannot diff ${b} against ${a}`);
  return b;
}

function isRecordLike(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function finalize(c: Change, limits: Limits): Change {
  const out: Change = {
    id: c.id,
    severity: c.severity,
    source: c.source,
    location: c.location,
    message: safeString(c.message, limits.maxStringBytes),
  };
  const before = clip(c.before, limits.maxValueBytes);
  const after = clip(c.after, limits.maxValueBytes);
  if (before !== undefined) out.before = before;
  if (after !== undefined) out.after = after;
  return out;
}

function sanitizeMeta(meta: DocumentMeta, limits: Limits): DocumentMeta {
  const out: DocumentMeta = { kind: meta.kind };
  if (meta.title !== undefined) out.title = safeString(meta.title, limits.maxStringBytes);
  if (meta.version !== undefined) out.version = safeString(meta.version, limits.maxStringBytes);
  return out;
}

const SEVERITY_ORDER = { breaking: 0, warning: 1, info: 2 } as const;

function compareChanges(a: Change, b: Change): number {
  const la = locationKey(a.location);
  const lb = locationKey(b.location);
  if (la !== lb) return la < lb ? -1 : 1;
  const sa = SEVERITY_ORDER[a.severity];
  const sb = SEVERITY_ORDER[b.severity];
  if (sa !== sb) return sa - sb;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}
