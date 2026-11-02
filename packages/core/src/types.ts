/**
 * Public types for the Apidrifter engine.
 *
 * Everything here is serializable. The engine is a pure function from documents to a
 * `DiffResult`; nothing in this module touches I/O.
 */

/** How a change affects a consumer of the API or tool. */
export type Severity = "breaking" | "warning" | "info";

/** Which kind of document a diff was computed over. */
export type DocumentKind = "openapi" | "mcp";

/**
 * Whether a schema describes a value the consumer sends (`input`) or receives (`output`).
 * Narrowing an input is breaking; widening an output is breaking.
 */
export type Polarity = "input" | "output";

/**
 * Where a change happened. `subject` identifies the operation, tool, resource or prompt;
 * `part` narrows to a component of it; `pointer` is a JSON pointer within that part.
 */
export interface Location {
  kind: "document" | "operation" | "tool" | "resource" | "prompt" | "server";
  /** `"GET /pets/{id}"`, tool name, resource URI, prompt name. Absent for document/server. */
  subject?: string;
  part?:
    | "parameter"
    | "requestBody"
    | "response"
    | "responseHeader"
    | "security"
    | "input"
    | "output"
    | "argument"
    | "annotations"
    | "description";
  /** Parameter `in:name`, response status, header name, argument name. */
  name?: string;
  mediaType?: string;
  /** JSON pointer within the schema of the part, e.g. `/properties/email`. */
  pointer?: string;
}

export interface Change {
  /** Stable, documented identifier. Produced by exactly one rule. */
  id: string;
  severity: Severity;
  source: DocumentKind;
  location: Location;
  /** Small, sanitized, serializable. May be truncated. */
  before?: unknown;
  after?: unknown;
  /** Plain text. Control characters stripped. Never contains unquoted third-party text. */
  message: string;
}

export interface DiffSummary {
  breaking: number;
  warning: number;
  info: number;
  /** Changes removed by config (ignored or baselined). */
  suppressed: number;
}

export interface DocumentMeta {
  kind: DocumentKind;
  title?: string;
  version?: string;
}

export interface DiffResult {
  kind: DocumentKind;
  before: DocumentMeta;
  after: DocumentMeta;
  changes: Change[];
  summary: DiffSummary;
  hasBreaking: boolean;
}

/** Resource limits applied to untrusted documents. */
export interface Limits {
  /** Maximum serialized size in bytes accepted by `parseDocument`. */
  maxBytes: number;
  /** Maximum nesting depth of the parsed value. */
  maxDepth: number;
  /** Maximum number of values (objects, arrays, scalars) in the parsed value. */
  maxNodes: number;
  /** Maximum `$ref` chain length followed during normalization. */
  maxRefDepth: number;
  /** Maximum YAML alias expansions. Guards against billion-laughs documents. */
  maxAliases: number;
  /** Maximum bytes kept for any single string in output. */
  maxStringBytes: number;
  /** Maximum bytes kept for `before`/`after` values in a change. */
  maxValueBytes: number;
}

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxBytes: 32 * 1024 * 1024,
  maxDepth: 128,
  maxNodes: 2_000_000,
  maxRefDepth: 64,
  maxAliases: 200,
  maxStringBytes: 2_000,
  maxValueBytes: 1_000,
});

/** User configuration. Can make the engine quieter or louder; never changes what it detects. */
export interface Config {
  /** Override the severity of a change ID, or `"ignore"` to drop it. */
  severity?: Record<string, Severity | "ignore">;
  ignore?: {
    /** Change IDs to drop entirely. */
    ids?: string[];
    /**
     * Subjects to drop, matched against `"METHOD /path"`, tool names, resource URIs and
     * prompt names. `*` matches within a path segment, `**` matches across segments.
     */
    subjects?: string[];
  };
  /** Fingerprints of changes that have been reviewed and accepted. See `fingerprint()`. */
  baseline?: string[];
}

export interface DiffOptions {
  /** Force a document kind instead of detecting it. */
  kind?: DocumentKind;
  config?: Config;
  limits?: Partial<Limits>;
}

/** Thrown for documents the engine refuses to process. Never thrown for ordinary diffs. */
export class ApidrifterError extends Error {
  readonly code: ApidrifterErrorCode;
  constructor(code: ApidrifterErrorCode, message: string) {
    super(message);
    this.name = "ApidrifterError";
    this.code = code;
  }
}

export type ApidrifterErrorCode =
  | "document-too-large"
  | "document-too-deep"
  | "document-too-many-nodes"
  | "parse-failed"
  | "unsupported-document"
  | "kind-mismatch"
  | "invalid-config";
