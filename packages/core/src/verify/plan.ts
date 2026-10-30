import { enforceShape, resolveLimits } from "../limits.js";
import type { Operation, Surface } from "../openapi/model.js";
import { isOpenApiDocument, normalizeOpenApi, normalizePath } from "../openapi/normalize.js";
import { isRecord } from "../parse.js";
import { resolveLocalRef } from "../schema/normalize.js";
import { clip } from "../text.js";
import { DriftwatchError, type Limits } from "../types.js";
import { summarizeSchema } from "./summary.js";
import type { PlannedParameter, PlannedRequest } from "./types.js";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

interface OperationExamples {
  parameters: Map<string, unknown>;
  bodies: Map<string, unknown>;
}

/**
 * Propose one request per operation, with the slots a caller must fill. Values are
 * never invented: examples come only from the spec.
 */
export function plan(spec: unknown, options: { limits?: Partial<Limits> } = {}): PlannedRequest[] {
  const limits = resolveLimits(options.limits);
  enforceShape(spec, limits);
  if (!isOpenApiDocument(spec)) {
    throw new DriftwatchError("unsupported-document", "plan requires an OpenAPI 3.x document");
  }
  const surface = normalizeOpenApi(spec, limits);
  const examples = collectExamples(spec, limits);
  const out: PlannedRequest[] = [];
  for (const op of surface.operations.values()) {
    out.push(planOperation(op, surface, examples.get(op.key), limits));
  }
  out.sort((a, b) => a.operationKey.localeCompare(b.operationKey));
  return out;
}

function planOperation(
  op: Operation,
  surface: Surface,
  ex: OperationExamples | undefined,
  limits: Limits,
): PlannedRequest {
  const parameters: PlannedParameter[] = [];
  for (const p of [...op.parameters.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const planned: PlannedParameter = { in: p.in, name: p.name, required: p.required };
    const schema = summarizeSchema(p.schema);
    if (schema !== undefined) planned.schema = schema;
    const example =
      ex?.parameters.get(p.key) ??
      ex?.parameters.get(`${p.in}:${p.name}`) ??
      (p.schema?.hasDefault ? p.schema.default : undefined);
    if (example !== undefined) planned.example = clip(example, limits.maxValueBytes);
    parameters.push(planned);
  }
  const req: PlannedRequest = {
    operationKey: op.key,
    method: op.method,
    pathTemplate: op.path,
    deprecated: op.deprecated,
    parameters,
    security: securityNames(op, surface),
    expectedStatuses: [...op.responses.keys()].sort(),
  };
  if (op.operationId !== undefined) req.operationId = op.operationId;
  if (op.summary !== undefined) req.summary = op.summary;
  if (op.requestBody !== undefined) {
    const preferred = pickMediaType([...op.requestBody.content.keys()]);
    if (preferred !== undefined) {
      const mt = op.requestBody.content.get(preferred);
      const body: NonNullable<PlannedRequest["body"]> = {
        mediaType: preferred,
        required: op.requestBody.required,
      };
      const schema = summarizeSchema(mt?.schema);
      if (schema !== undefined) body.schema = schema;
      const example =
        ex?.bodies.get(preferred) ?? (mt?.schema?.hasDefault ? mt.schema.default : undefined);
      if (example !== undefined) body.example = clip(example, limits.maxValueBytes);
      req.body = body;
    }
  }
  return req;
}

/** Prefer JSON; otherwise the first documented media type. */
function pickMediaType(types: string[]): string | undefined {
  const sorted = [...types].sort();
  return (
    sorted.find((t) => t === "application/json") ??
    sorted.find((t) => t.endsWith("+json")) ??
    sorted[0]
  );
}

function securityNames(op: Operation, surface: Surface): string[] {
  const alts = op.security ?? surface.security ?? [];
  const first = alts[0];
  if (first === undefined) return [];
  return [...first.schemes.keys()].sort();
}

/** Walk the raw document for `example`, `examples` and `default` values. Tolerant of anything. */
function collectExamples(
  doc: Record<string, unknown>,
  limits: Limits,
): Map<string, OperationExamples> {
  const out = new Map<string, OperationExamples>();
  const deref = (v: unknown, hops = 0): Record<string, unknown> | undefined => {
    if (!isRecord(v)) return undefined;
    const ref = v["$ref"];
    if (typeof ref !== "string") return v;
    if (hops >= limits.maxRefDepth) return undefined;
    return deref(resolveLocalRef(doc, ref), hops + 1);
  };
  const paths = doc["paths"];
  if (!isRecord(paths)) return out;
  for (const [path, rawItem] of Object.entries(paths)) {
    const item = deref(rawItem);
    if (item === undefined) continue;
    const pathLevel = parameterExamples(item["parameters"], deref);
    for (const method of METHODS) {
      const op = item[method];
      if (!isRecord(op)) continue;
      const key = `${method.toUpperCase()} ${normalizePath(path)}`;
      const parameters = new Map(pathLevel);
      for (const [k, v] of parameterExamples(op["parameters"], deref)) parameters.set(k, v);
      const bodies = new Map<string, unknown>();
      const body = deref(op["requestBody"]);
      const content = body?.["content"];
      if (isRecord(content)) {
        for (const [mt, rawMt] of Object.entries(content)) {
          const ex = exampleOf(rawMt, deref);
          if (ex !== undefined) bodies.set(normalizeMediaType(mt), ex);
        }
      }
      out.set(key, { parameters, bodies });
    }
  }
  return out;
}

function normalizeMediaType(mt: string): string {
  return (mt.split(";")[0] ?? mt).trim().toLowerCase();
}

type Deref = (v: unknown) => Record<string, unknown> | undefined;

function parameterExamples(raw: unknown, deref: Deref): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!Array.isArray(raw)) return out;
  for (const rawParam of raw) {
    const p = deref(rawParam);
    if (p === undefined || typeof p["name"] !== "string" || typeof p["in"] !== "string") continue;
    const ex = exampleOf(p, deref);
    if (ex !== undefined) out.set(`${p["in"]}:${p["name"]}`, ex);
  }
  return out;
}

/** `example`, then the first of `examples`, then the schema's example/default/examples. */
function exampleOf(raw: unknown, deref: Deref): unknown {
  const obj = deref(raw);
  if (obj === undefined) return undefined;
  if (obj["example"] !== undefined) return obj["example"];
  const examples = obj["examples"];
  if (isRecord(examples)) {
    const first = Object.values(examples)[0];
    const e = deref(first);
    if (e !== undefined && e["value"] !== undefined) return e["value"];
  } else if (Array.isArray(examples) && examples.length > 0) {
    return examples[0];
  }
  const schema = deref(obj["schema"]);
  if (schema !== undefined) {
    if (schema["example"] !== undefined) return schema["example"];
    if (schema["default"] !== undefined) return schema["default"];
    const se = schema["examples"];
    if (Array.isArray(se) && se.length > 0) return se[0];
  }
  return undefined;
}
