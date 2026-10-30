import { isRecord } from "../parse.js";
import {
  createNormalizeContext,
  type NormalizeContext,
  normalizeSchema,
  resolveLocalRef,
} from "../schema/normalize.js";
import type { DocumentMeta, Limits } from "../types.js";
import type {
  Header,
  MediaType,
  Operation,
  Parameter,
  RequestBody,
  Response,
  SecurityAlternative,
  SecurityScheme,
  Surface,
} from "./model.js";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export function isOpenApiDocument(doc: unknown): doc is Record<string, unknown> {
  return isRecord(doc) && typeof doc["openapi"] === "string";
}

export function isSwagger2Document(doc: unknown): boolean {
  return isRecord(doc) && typeof doc["swagger"] === "string";
}

export function openApiMeta(doc: Record<string, unknown>): DocumentMeta {
  const meta: DocumentMeta = { kind: "openapi" };
  const info = doc["info"];
  if (isRecord(info)) {
    if (typeof info["title"] === "string") meta.title = info["title"];
    if (typeof info["version"] === "string") meta.version = info["version"];
  }
  return meta;
}

/** Deref an object that may be a `$ref` to a component. Schemas go through normalizeSchema instead. */
function deref(
  ctx: NormalizeContext,
  value: unknown,
  hops = 0,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const ref = value["$ref"];
  if (typeof ref !== "string") return value;
  if (hops >= ctx.limits.maxRefDepth) return undefined;
  return deref(ctx, resolveLocalRef(ctx.root, ref), hops + 1);
}

export function normalizeOpenApi(doc: Record<string, unknown>, limits: Limits): Surface {
  const ctx = createNormalizeContext(doc, limits);
  const surface: Surface = {
    servers: [],
    securitySchemes: new Map(),
    operations: new Map(),
  };
  const meta = openApiMeta(doc);
  if (meta.title !== undefined) surface.title = meta.title;
  if (meta.version !== undefined) surface.version = meta.version;

  const servers = doc["servers"];
  if (Array.isArray(servers)) {
    for (const s of servers) {
      if (isRecord(s) && typeof s["url"] === "string") surface.servers.push(s["url"]);
    }
    surface.servers.sort();
  }

  const components = isRecord(doc["components"]) ? doc["components"] : undefined;
  const schemes = components !== undefined ? components["securitySchemes"] : undefined;
  if (isRecord(schemes)) {
    for (const [name, raw] of Object.entries(schemes)) {
      const s = deref(ctx, raw);
      if (s === undefined) continue;
      surface.securitySchemes.set(name, normalizeSecurityScheme(s));
    }
  }

  const docSecurity = normalizeSecurity(doc["security"]);
  if (docSecurity !== undefined) surface.security = docSecurity;

  const paths = doc["paths"];
  if (isRecord(paths)) {
    for (const [path, rawItem] of Object.entries(paths)) {
      const item = deref(ctx, rawItem);
      if (item === undefined) continue;
      const pathParams = collectParameters(ctx, item["parameters"]);
      for (const method of METHODS) {
        const rawOp = item[method];
        if (!isRecord(rawOp)) continue;
        const op = normalizeOperation(ctx, method, path, rawOp, pathParams);
        surface.operations.set(op.key, op);
      }
    }
  }
  return surface;
}

/** `/pets/{petId}` and `/pets/{id}` are the same path. */
export function normalizePath(path: string): string {
  return path.replace(/\{[^}]*\}/g, "{}").replace(/\/+$/, "") || "/";
}

function normalizeOperation(
  ctx: NormalizeContext,
  method: string,
  path: string,
  raw: Record<string, unknown>,
  inherited: Map<string, Parameter>,
): Operation {
  const op: Operation = {
    key: `${method.toUpperCase()} ${normalizePath(path)}`,
    method: method.toUpperCase(),
    path,
    deprecated: raw["deprecated"] === true,
    parameters: new Map(inherited),
    responses: new Map(),
  };
  if (typeof raw["operationId"] === "string") op.operationId = raw["operationId"];
  if (typeof raw["summary"] === "string") op.summary = raw["summary"];
  if (typeof raw["description"] === "string") op.description = raw["description"];
  for (const [k, p] of collectParameters(ctx, raw["parameters"])) op.parameters.set(k, p);

  const body = deref(ctx, raw["requestBody"]);
  if (body !== undefined) op.requestBody = normalizeRequestBody(ctx, body);

  const responses = raw["responses"];
  if (isRecord(responses)) {
    for (const [status, rawRes] of Object.entries(responses)) {
      const res = deref(ctx, rawRes);
      if (res === undefined) continue;
      op.responses.set(status, normalizeResponse(ctx, status, res));
    }
  }
  const security = normalizeSecurity(raw["security"]);
  if (security !== undefined) op.security = security;
  return op;
}

function collectParameters(ctx: NormalizeContext, raw: unknown): Map<string, Parameter> {
  const out = new Map<string, Parameter>();
  if (!Array.isArray(raw)) return out;
  for (const rawParam of raw) {
    const p = deref(ctx, rawParam);
    if (p === undefined) continue;
    const name = p["name"];
    const where = p["in"];
    if (typeof name !== "string" || typeof where !== "string") continue;
    const param: Parameter = {
      key: `${where}:${name}`,
      in: where,
      name,
      // Path parameters are always required per the spec, whatever the document says.
      required: where === "path" ? true : p["required"] === true,
      deprecated: p["deprecated"] === true,
    };
    if (typeof p["description"] === "string") param.description = p["description"];
    const schema = parameterSchema(ctx, p);
    if (schema !== undefined) param.schema = schema;
    out.set(param.key, param);
  }
  return out;
}

function parameterSchema(ctx: NormalizeContext, p: Record<string, unknown>) {
  if (p["schema"] !== undefined) return normalizeSchema(p["schema"], ctx);
  const content = p["content"];
  if (isRecord(content)) {
    const first = Object.values(content)[0];
    if (isRecord(first) && first["schema"] !== undefined)
      return normalizeSchema(first["schema"], ctx);
  }
  return undefined;
}

function normalizeContent(ctx: NormalizeContext, raw: unknown): Map<string, MediaType> {
  const out = new Map<string, MediaType>();
  if (!isRecord(raw)) return out;
  for (const [mediaType, rawMt] of Object.entries(raw)) {
    const mt: MediaType = {};
    if (isRecord(rawMt) && rawMt["schema"] !== undefined)
      mt.schema = normalizeSchema(rawMt["schema"], ctx);
    out.set(normalizeMediaType(mediaType), mt);
  }
  return out;
}

/** `application/json; charset=utf-8` and `application/json` are the same media type. */
export function normalizeMediaType(mt: string): string {
  return (mt.split(";")[0] ?? mt).trim().toLowerCase();
}

function normalizeRequestBody(ctx: NormalizeContext, raw: Record<string, unknown>): RequestBody {
  return { required: raw["required"] === true, content: normalizeContent(ctx, raw["content"]) };
}

function normalizeResponse(
  ctx: NormalizeContext,
  status: string,
  raw: Record<string, unknown>,
): Response {
  const res: Response = {
    status,
    headers: new Map(),
    content: normalizeContent(ctx, raw["content"]),
  };
  if (typeof raw["description"] === "string") res.description = raw["description"];
  const headers = raw["headers"];
  if (isRecord(headers)) {
    for (const [name, rawHeader] of Object.entries(headers)) {
      const h = deref(ctx, rawHeader);
      if (h === undefined) continue;
      const header: Header = { name: name.toLowerCase(), required: h["required"] === true };
      const schema = parameterSchema(ctx, h);
      if (schema !== undefined) header.schema = schema;
      res.headers.set(header.name, header);
    }
  }
  return res;
}

function normalizeSecurityScheme(raw: Record<string, unknown>): SecurityScheme {
  const s: SecurityScheme = {};
  for (const k of ["type", "scheme", "in", "name", "bearerFormat"] as const) {
    const v = raw[k];
    if (typeof v === "string") s[k] = v;
  }
  const flows = raw["flows"];
  if (isRecord(flows)) s.flows = Object.keys(flows).sort();
  return s;
}

/** Security requirement list \u2192 sorted alternatives. `[]` means "no auth"; undefined means "not declared". */
export function normalizeSecurity(raw: unknown): SecurityAlternative[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const alts: SecurityAlternative[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const schemes = new Map<string, string[]>();
    for (const [name, scopes] of Object.entries(entry)) {
      schemes.set(
        name,
        Array.isArray(scopes)
          ? scopes.filter((s): s is string => typeof s === "string").sort()
          : [],
      );
    }
    const key = [...schemes.keys()].sort().join("+") || "(none)";
    alts.push({ key, schemes });
  }
  alts.sort((a, b) => a.key.localeCompare(b.key));
  return alts;
}
