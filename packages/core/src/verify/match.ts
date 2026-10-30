import type { Operation, Surface } from "../openapi/model.js";

export interface OperationMatch {
  operation: Operation;
  /** Decoded path parameter values keyed by the template name, e.g. `{ petId: "42" }`. */
  pathParams: Record<string, string>;
  /** Query parameters parsed from the path's query string, if it had one. */
  query: Record<string, string | string[]>;
}

const MAX_PATH_LENGTH = 8_192;

/**
 * Resolve an observed request to an operation. Server base paths from the spec are
 * stripped, trailing slashes ignored, and literal segments win over templated ones.
 */
export function matchOperation(
  surface: Surface,
  method: string,
  path: string,
): OperationMatch | undefined {
  if (path.length > MAX_PATH_LENGTH) return undefined;
  const m = method.toUpperCase();
  const qIndex = path.indexOf("?");
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  const query = qIndex === -1 ? {} : parseQuery(path.slice(qIndex + 1));

  const candidates = new Set<string>();
  candidates.add(trimSlash(pathname));
  for (const base of basePaths(surface)) {
    if (pathname === base || pathname.startsWith(`${base}/`))
      candidates.add(trimSlash(pathname.slice(base.length)));
  }

  let best: { op: Operation; params: Record<string, string>; score: number } | undefined;
  for (const op of surface.operations.values()) {
    if (op.method !== m) continue;
    const template = compileTemplate(op.path);
    if (template === undefined) continue;
    for (const candidate of candidates) {
      const hit = template.re.exec(candidate);
      if (hit === null) continue;
      const params: Record<string, string> = {};
      template.names.forEach((name, i) => {
        params[name] = safeDecode(hit[i + 1] ?? "");
      });
      const score = template.literalScore;
      if (best === undefined || score > best.score) best = { op, params, score };
    }
  }
  if (best === undefined) return undefined;
  return { operation: best.op, pathParams: best.params, query };
}

function trimSlash(p: string): string {
  const t = p.replace(/\/+$/, "");
  return t === "" ? "/" : t;
}

/** Path components of the spec's server URLs, when they have one. */
function basePaths(surface: Surface): string[] {
  const out: string[] = [];
  for (const s of surface.servers) {
    let p: string;
    try {
      p = new URL(s).pathname;
    } catch {
      p = s.startsWith("/") ? s : "";
    }
    p = trimSlash(p);
    if (p !== "/" && !p.includes("{")) out.push(p);
  }
  return out;
}

interface CompiledTemplate {
  re: RegExp;
  names: string[];
  literalScore: number;
}

const templateCache = new Map<string, CompiledTemplate | null>();

/** `/pets/{petId}/files/{name}.json` to a regex with one capture per parameter. */
function compileTemplate(path: string): CompiledTemplate | undefined {
  const cached = templateCache.get(path);
  if (cached !== undefined) return cached ?? undefined;
  const names: string[] = [];
  let re = "";
  let literalScore = 0;
  const segments = trimSlash(path).split("/");
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si] ?? "";
    if (si > 0) re += "/";
    let rest = seg;
    let hasParam = false;
    while (rest.length > 0) {
      const open = rest.indexOf("{");
      if (open === -1) {
        re += escapeRegex(rest);
        rest = "";
        break;
      }
      const close = rest.indexOf("}", open);
      if (close === -1) {
        re += escapeRegex(rest);
        rest = "";
        break;
      }
      re += escapeRegex(rest.slice(0, open));
      names.push(rest.slice(open + 1, close));
      re += "([^/]+)";
      hasParam = true;
      rest = rest.slice(close + 1);
    }
    if (!hasParam && seg !== "") literalScore += 2;
    else if (hasParam && seg.replace(/\{[^}]*\}/g, "") !== "") literalScore += 1;
  }
  let compiled: CompiledTemplate | null;
  try {
    compiled = { re: new RegExp(`^${re}$`), names, literalScore };
  } catch {
    compiled = null;
  }
  if (templateCache.size > 5_000) templateCache.clear();
  templateCache.set(path, compiled);
  return compiled ?? undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Parse a query string; repeated keys become arrays. */
export function parseQuery(qs: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (qs.length > MAX_PATH_LENGTH) return out;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(qs);
  } catch {
    return out;
  }
  for (const [k, v] of params) {
    const existing = out[k];
    if (existing === undefined) out[k] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[k] = [existing, v];
  }
  return out;
}
