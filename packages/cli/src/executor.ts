import { InputError } from "./errors.js";
import { errorMessage, readBounded } from "./fetch-text.js";
import type { FilledRequest, Observation, PlannedRequest } from "./verify-types.js";

export interface BuiltRequest {
  operationKey: string;
  method: string;
  url: string;
  /** Path with path parameters substituted, relative to the base URL. */
  path: string;
  query: Record<string, string | string[]>;
  /** Lowercase header names. */
  headers: Record<string, string>;
  mediaType?: string;
  body?: string;
}

export type BuildResult = { ok: true; request: BuiltRequest } | { ok: false; missing: string[] };

/** Header names whose values are never stored or printed. Compared lowercase. */
export const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "api-key",
]);

export const REDACTED = "[redacted]";

/**
 * Build a concrete request from a planned request and the values a caller supplied.
 * Returns the list of missing required slots instead of guessing values.
 */
export function buildRequest(
  planned: PlannedRequest,
  filled: FilledRequest | undefined,
  baseUrl: string,
  extraHeaders: Record<string, string> = {},
): BuildResult {
  const values = filled?.values ?? {};
  const missing: string[] = [];
  let path = planned.pathTemplate;
  const query: Record<string, string | string[]> = {};
  const headers: Record<string, string> = {};
  const cookies: string[] = [];

  for (const p of planned.parameters) {
    const key = `${p.in}:${p.name}`;
    const value = values[key];
    if (value === undefined) {
      if (p.required) missing.push(key);
      continue;
    }
    if (p.in === "path") {
      path = path.split(`{${p.name}}`).join(encodeURIComponent(scalar(value)));
    } else if (p.in === "query") {
      query[p.name] = Array.isArray(value) ? value.map(scalar) : scalar(value);
    } else if (p.in === "header") {
      headers[p.name.toLowerCase()] = scalar(value);
    } else if (p.in === "cookie") {
      cookies.push(`${p.name}=${encodeURIComponent(scalar(value))}`);
    }
  }
  for (const m of path.matchAll(/\{([^}]+)\}/g)) missing.push(`path:${m[1] ?? ""}`);
  if (planned.body?.required && filled?.body === undefined) missing.push("body");
  if (missing.length > 0) return { ok: false, missing: [...new Set(missing)] };

  for (const [k, v] of Object.entries(filled?.headers ?? {})) headers[k.toLowerCase()] = v;
  for (const [k, v] of Object.entries(extraHeaders)) headers[k.toLowerCase()] = v;
  if (cookies.length > 0) {
    const existing = headers["cookie"];
    headers["cookie"] =
      existing === undefined ? cookies.join("; ") : `${existing}; ${cookies.join("; ")}`;
  }

  const built: BuiltRequest = {
    operationKey: planned.operationKey,
    method: planned.method.toUpperCase(),
    url: joinUrl(baseUrl, path, query),
    path,
    query,
    headers,
  };
  if (filled?.body !== undefined) {
    const mediaType = filled.mediaType ?? planned.body?.mediaType ?? "application/json";
    built.mediaType = mediaType;
    built.body = isJsonMediaType(mediaType) ? JSON.stringify(filled.body) : scalar(filled.body);
    headers["content-type"] = mediaType;
  }
  return { ok: true, request: built };
}

function scalar(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null) return "null";
  return JSON.stringify(v);
}

export function isJsonMediaType(mt: string): boolean {
  const base = (mt.split(";")[0] ?? "").trim().toLowerCase();
  return base === "application/json" || base.endsWith("+json");
}

export function joinUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | string[]>,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, item);
    else url.searchParams.append(k, v);
  }
  return url.href;
}

export interface ExecuteOptions {
  timeoutMs: number;
  maxBodyBytes: number;
  fetchImpl?: typeof fetch;
  /** Extra header names (lowercase) to redact in stored observations. */
  redact?: ReadonlySet<string>;
  now?: () => string;
}

/** Execute built requests one at a time and return observations with secrets redacted. */
export async function executeRequests(
  requests: BuiltRequest[],
  options: ExecuteOptions,
): Promise<Observation[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const redact = new Set([...SENSITIVE_HEADERS, ...(options.redact ?? [])]);
  const now = options.now ?? (() => new Date().toISOString());
  const observations: Observation[] = [];
  for (const req of requests) {
    let res: Response;
    try {
      const init: RequestInit = {
        method: req.method,
        headers: req.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
      };
      if (req.body !== undefined) init.body = req.body;
      res = await fetchImpl(req.url, init);
    } catch (err) {
      throw new InputError(`request ${req.method} ${req.path} failed: ${errorMessage(err)}`);
    }
    const responseMediaType = res.headers.get("content-type") ?? undefined;
    const text = await readBounded(res, options.maxBodyBytes, `${req.method} ${req.path}`);
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k] = redact.has(k.toLowerCase()) ? REDACTED : v;
    });
    const observation: Observation = {
      operationKey: req.operationKey,
      request: {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: redactHeaders(req.headers, redact),
      },
      response: { status: res.status, headers: responseHeaders },
      capturedAt: now(),
    };
    if (req.mediaType !== undefined) observation.request.mediaType = req.mediaType;
    if (req.body !== undefined) {
      observation.request.body = isJsonMediaType(req.mediaType ?? "")
        ? safeJson(req.body)
        : req.body;
    }
    if (responseMediaType !== undefined) observation.response.mediaType = responseMediaType;
    if (text.length > 0) {
      observation.response.body = isJsonMediaType(responseMediaType ?? "") ? safeJson(text) : text;
    }
    observations.push(observation);
  }
  return observations;
}

export function redactHeaders(
  headers: Record<string, string>,
  redact: ReadonlySet<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k] = redact.has(k.toLowerCase()) ? REDACTED : v;
  return out;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Parse `--header "Name: value"` flags into lowercase-keyed headers. */
export function parseHeaderFlags(flags: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of flags) {
    const idx = raw.indexOf(":");
    if (idx <= 0) {
      throw new InputError(`--header must look like "Name: value", got ${JSON.stringify(raw)}`);
    }
    out[raw.slice(0, idx).trim().toLowerCase()] = raw.slice(idx + 1).trim();
  }
  return out;
}
