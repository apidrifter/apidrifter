import { compileSubjectPattern, validateConfig } from "../config.js";
import { fnv1a64, stable } from "../fingerprint.js";
import { enforceShape, resolveLimits } from "../limits.js";
import type { Operation, Parameter, Response, Surface } from "../openapi/model.js";
import { isOpenApiDocument, normalizeMediaType, normalizeOpenApi } from "../openapi/normalize.js";
import { locationKey } from "../render/location.js";
import type { SchemaNode } from "../schema/model.js";
import { clip, quote, safeString } from "../text.js";
import { type Config, DriftwatchError, type Limits, type Location } from "../types.js";
import { matchOperation } from "./match.js";
import { findingSeverity } from "./rules.js";
import type { Finding, Observation, VerifyOptions, VerifyResult } from "./types.js";
import { COMPOSITION_KINDS, CONSTRAINT_KINDS, type Violation, validate } from "./validate.js";

const SEVERITY_ORDER = { breaking: 0, warning: 1, info: 2 } as const;

/**
 * Compare observed request and response pairs against a spec. Pure: the caller executes
 * requests. Each finding carries two fixes, one per possible source of truth.
 */
export function verify(
  spec: unknown,
  observations: Observation[],
  options: VerifyOptions = {},
): VerifyResult {
  const limits = resolveLimits(options.limits);
  enforceShape(spec, limits);
  if (!isOpenApiDocument(spec)) {
    throw new DriftwatchError("unsupported-document", "verify requires an OpenAPI 3.x document");
  }
  if (!Array.isArray(observations)) {
    throw new DriftwatchError("invalid-config", "observations must be an array");
  }
  const config = validateVerifyConfig(options.config);
  const surface = normalizeOpenApi(spec, limits);

  const findings: Finding[] = [];
  const observedOps = new Set<string>();
  let unmatched = 0;

  observations.forEach((obs, index) => {
    enforceShape(obs, limits);
    if (!isObservation(obs)) return;
    const out = verifyObservation(surface, obs, index, limits);
    if (out.matched === undefined) unmatched++;
    else observedOps.add(out.matched);
    findings.push(...out.findings);
  });

  const finalized = collapseRepeats(findings.map((f) => finalize(f, limits)));
  finalized.sort(compareFindings);
  const applied = applyFindingConfig(finalized, config);
  const summary = { breaking: 0, warning: 0, info: 0, suppressed: applied.suppressed };
  for (const f of applied.findings) summary[f.severity]++;
  return {
    kind: "openapi",
    findings: applied.findings,
    summary,
    coverage: {
      operations: surface.operations.size,
      observed: observedOps.size,
      unmatchedObservations: unmatched,
    },
  };
}

/**
 * The same defect in every array element, or in every observation of an operation, is one
 * finding. Keep the first occurrence and say how many more there were.
 */
function collapseRepeats(findings: Finding[]): Finding[] {
  const groups = new Map<string, { first: Finding; more: number }>();
  for (const f of findings) {
    const loc = f.location;
    const key = JSON.stringify([
      f.id,
      loc.kind,
      loc.subject ?? "",
      loc.part ?? "",
      loc.name ?? "",
      loc.mediaType ?? "",
      (loc.pointer ?? "").replace(/\/\d+(?=\/|$)/g, "/*"),
      f.message.replace(/\/\d+(?=\/|$)/g, "/*"),
    ]);
    const g = groups.get(key);
    if (g === undefined) groups.set(key, { first: f, more: 0 });
    else g.more++;
  }
  return [...groups.values()].map(({ first, more }) =>
    more === 0 ? first : { ...first, message: `${first.message} (and ${more} more like it)` },
  );
}

function isObservation(v: unknown): v is Observation {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const req = o["request"];
  const res = o["response"];
  return (
    req !== null &&
    typeof req === "object" &&
    typeof (req as Record<string, unknown>)["method"] === "string" &&
    typeof (req as Record<string, unknown>)["path"] === "string" &&
    res !== null &&
    typeof res === "object" &&
    typeof (res as Record<string, unknown>)["status"] === "number"
  );
}

interface ObservationOutcome {
  matched: string | undefined;
  findings: Finding[];
}

function verifyObservation(
  surface: Surface,
  obs: Observation,
  index: number,
  limits: Limits,
): ObservationOutcome {
  const findings: Finding[] = [];
  const method = obs.request.method.toUpperCase();
  const match = matchOperation(surface, method, obs.request.path);
  if (match === undefined) {
    const pathOnly = obs.request.path.split("?")[0] ?? obs.request.path;
    const subject = `${method} ${pathOnly}`;
    findings.push(
      finding(
        "undocumented-operation",
        { kind: "operation", subject },
        `observed request ${quote(subject)} matches no operation in the spec`,
        index,
        {
          implementation: `Stop serving ${subject} if it is not meant to be part of the API.`,
          spec: `Add ${subject} under paths with its parameters and responses.`,
        },
      ),
    );
    return { matched: undefined, findings };
  }

  const op = match.operation;
  const subject = `${op.method} ${op.path}`;
  const base: Location = { kind: "operation", subject };
  const specBase = specPath(op);

  if (op.deprecated) {
    findings.push(
      finding(
        "deprecated-operation-in-use",
        base,
        `${quote(subject)} is deprecated in the spec but still in use`,
        index,
        {
          implementation: `Migrate callers of ${subject} to its replacement before removing it.`,
          spec: `Remove deprecated: true from ${specBase} if the operation is still supported.`,
        },
      ),
    );
  }

  const requestValid = verifyRequest(
    op,
    obs,
    index,
    match.pathParams,
    match.query,
    base,
    specBase,
    limits,
    findings,
  );
  const status = obs.response.status;
  verifyResponse(op, obs, index, base, specBase, limits, findings);

  if (requestValid && (status === 400 || status === 422)) {
    findings.push(
      finding(
        "request-rejected-but-valid",
        base,
        `request to ${quote(subject)} conformed to the spec but was rejected with ${status}`,
        index,
        {
          implementation: `Accept requests to ${subject} that conform to the spec; this one was rejected with ${status}.`,
          spec: `Document the validation ${subject} performs (required fields, formats, constraints) so the spec reflects what is accepted.`,
        },
        undefined,
        status,
      ),
    );
  }
  if (!requestValid && status >= 200 && status < 300) {
    findings.push(
      finding(
        "request-accepted-but-invalid",
        base,
        `request to ${quote(subject)} violated the spec but was accepted with ${status}`,
        index,
        {
          implementation: `Reject requests to ${subject} that violate the spec; see the request findings for this observation.`,
          spec: `Loosen the spec for ${subject} to match what the implementation accepts, if that behavior is intended.`,
        },
        undefined,
        status,
      ),
    );
  }
  return { matched: op.key, findings };
}

// ---------------------------------------------------------------------------
// Request side

function verifyRequest(
  op: Operation,
  obs: Observation,
  index: number,
  pathParams: Record<string, string>,
  pathQuery: Record<string, string | string[]>,
  base: Location,
  specBase: string,
  limits: Limits,
  findings: Finding[],
): boolean {
  let valid = true;
  const query = obs.request.query ?? pathQuery;
  const headers = lowerKeys(obs.request.headers);

  for (const param of op.parameters.values()) {
    const loc: Location = { ...base, part: "parameter", name: `${param.in}:${param.name}` };
    const raw = parameterValue(param, pathParams, query, headers);
    if (raw === undefined) {
      if (param.required && param.in !== "cookie") {
        valid = false;
        findings.push(
          finding(
            "request-missing-required-parameter",
            loc,
            `required ${param.in} parameter ${quote(param.name)} was not sent`,
            index,
            {
              implementation: `Reject requests to ${op.method} ${op.path} that omit the ${param.in} parameter ${param.name}.`,
              spec: `Mark ${param.in} parameter ${param.name} optional at ${specBase}.parameters if it is not needed.`,
            },
            param.name,
          ),
        );
      }
      continue;
    }
    if (param.schema === undefined) continue;
    const value = coerce(raw, param.schema);
    const violations = validate(param.schema, value, "input", limits);
    for (const v of violations) {
      if (v.kind === "pattern-not-checked") {
        findings.push(
          patternNotChecked(loc, v, index, `${specBase}.parameters[${param.name}].schema`),
        );
        continue;
      }
      valid = false;
      findings.push(
        requestFinding(
          v,
          loc,
          index,
          `${param.in} parameter ${param.name}`,
          `${specBase}.parameters[${param.name}].schema`,
        ),
      );
    }
  }

  const body = op.requestBody;
  if (body !== undefined) {
    const bodyLoc: Location = { ...base, part: "requestBody" };
    const hasBody = obs.request.body !== undefined;
    if (!hasBody) {
      if (body.required) {
        valid = false;
        findings.push(
          finding("request-missing-body", bodyLoc, "required request body was not sent", index, {
            implementation: `Reject requests to ${op.method} ${op.path} without a body.`,
            spec: `Set required: false at ${specBase}.requestBody if the body is optional.`,
          }),
        );
      }
    } else {
      const mt = requestMediaType(obs, headers, body.content);
      const media = mt === undefined ? undefined : body.content.get(mt);
      if (media === undefined) {
        valid = false;
        findings.push(
          finding(
            "request-undocumented-media-type",
            bodyLoc,
            `request body media type ${quote(mt ?? "unknown")} is not documented`,
            index,
            {
              implementation: `Reject request bodies for ${op.method} ${op.path} that are not one of: ${[...body.content.keys()].join(", ")}.`,
              spec: `Add ${quote(mt ?? "the media type")} under ${specBase}.requestBody.content.`,
            },
            [...body.content.keys()],
            mt,
          ),
        );
      } else if (media.schema !== undefined && mt !== undefined) {
        const mLoc: Location = { ...bodyLoc, mediaType: mt };
        const specSchema = `${specBase}.requestBody.content["${mt}"].schema`;
        const parsed = maybeParseJson(obs.request.body, mt);
        for (const v of validate(media.schema, parsed, "input", limits)) {
          if (v.kind === "pattern-not-checked") {
            findings.push(patternNotChecked(withPointer(mLoc, v.pointer), v, index, specSchema));
            continue;
          }
          valid = false;
          findings.push(
            requestFinding(v, withPointer(mLoc, v.pointer), index, "request body", specSchema),
          );
        }
      }
    }
  }
  return valid;
}

function parameterValue(
  param: Parameter,
  pathParams: Record<string, string>,
  query: Record<string, string | string[]>,
  headers: Record<string, string>,
): string | string[] | undefined {
  switch (param.in) {
    case "path":
      return pathParams[param.name];
    case "query":
      return query[param.name];
    case "header":
      return headers[param.name.toLowerCase()];
    default:
      return undefined;
  }
}

function lowerKeys(h: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (h === undefined) return out;
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

/** Coerce a transported string to the primitive type the schema declares, when unambiguous. */
function coerce(raw: string | string[], schema: SchemaNode): unknown {
  const types = schema.types ?? [];
  if (types.includes("array")) {
    const list = Array.isArray(raw) ? raw : raw.split(",");
    return schema.items === undefined
      ? list
      : list.map((s) => coerce(s, schema.items as SchemaNode));
  }
  const s = Array.isArray(raw) ? (raw[0] ?? "") : raw;
  if (
    (types.includes("integer") || types.includes("number")) &&
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)
  )
    return Number(s);
  if (types.includes("boolean") && (s === "true" || s === "false")) return s === "true";
  if (types.includes("null") && s === "null") return null;
  if (
    (types.includes("object") || types.length === 0) &&
    (s.startsWith("{") || s.startsWith("["))
  ) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  return s;
}

function requestMediaType(
  obs: Observation,
  headers: Record<string, string>,
  content: Map<string, unknown>,
): string | undefined {
  const declared = obs.request.mediaType ?? headers["content-type"];
  if (declared !== undefined) return normalizeMediaType(declared);
  if (content.size === 1) return content.keys().next().value;
  if (content.has("application/json")) return "application/json";
  return undefined;
}

function isJsonMediaType(mt: string): boolean {
  return mt === "application/json" || mt.endsWith("+json");
}

function maybeParseJson(body: unknown, mt: string): unknown {
  if (typeof body === "string" && isJsonMediaType(mt)) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function requestFinding(
  v: Violation,
  loc: Location,
  index: number,
  what: string,
  specSchema: string,
): Finding {
  const at = schemaPath(specSchema, v.pointer);
  const where = v.pointer === "" ? what : `${what} at ${v.pointer}`;
  let id: string;
  let impl: string;
  let spec: string;
  if (v.kind === "required") {
    id = "request-missing-required-property";
    impl = `Reject requests whose ${what} omits required property ${quote(v.expected)}.`;
    spec = `Remove ${quote(v.expected)} from required at ${at}.`;
  } else if (v.kind === "undocumented-property" || v.kind === "forbidden-property") {
    id = "request-undocumented-property";
    impl = `Reject or ignore property ${quote(v.actual)} in the ${what}.`;
    spec = `Add ${quote(v.actual)} to ${at}.properties.`;
  } else if (v.kind === "type" || v.kind === "null") {
    id = "request-type-mismatch";
    impl = `Reject a ${v.kind === "null" ? "null" : String(v.actual)} value in the ${where}.`;
    spec = `Change the type at ${at} to allow what is sent.`;
  } else if (v.kind === "enum" || v.kind === "const") {
    id = "request-enum-violation";
    impl = `Reject values outside the documented enum in the ${where}.`;
    spec = `Add the sent value to the enum at ${at}.`;
  } else if (CONSTRAINT_KINDS.has(v.kind)) {
    id = "request-constraint-violation";
    impl = `Enforce ${v.kind} in the ${where}.`;
    spec = `Relax ${v.kind} at ${at} to cover what is sent.`;
  } else {
    id = "request-schema-violation";
    impl = `Enforce the documented schema in the ${where}.`;
    spec = `Adjust the composition at ${at} to describe what is sent.`;
  }
  return finding(
    id,
    loc,
    `${what}: ${v.message}`,
    index,
    { implementation: impl, spec },
    v.expected,
    v.actual,
  );
}

// ---------------------------------------------------------------------------
// Response side

function verifyResponse(
  op: Operation,
  obs: Observation,
  index: number,
  base: Location,
  specBase: string,
  limits: Limits,
  findings: Finding[],
): void {
  const status = obs.response.status;
  const resolved = resolveResponse(op, status);
  const rLoc: Location = { ...base, part: "response", name: String(status) };
  if (resolved === undefined) {
    const documented = [...op.responses.keys()].sort().join(", ");
    findings.push(
      finding(
        "undocumented-status",
        rLoc,
        `status ${status} is not documented for ${quote(`${op.method} ${op.path}`)}`,
        index,
        {
          implementation: `Return one of the documented statuses (${documented || "none"}) from ${op.method} ${op.path}.`,
          spec: `Add a "${status}" response under ${specBase}.responses.`,
        },
        documented === "" ? undefined : [...op.responses.keys()].sort(),
        status,
      ),
    );
    return;
  }
  const { key, response } = resolved;
  const headers = lowerKeys(obs.response.headers);

  for (const header of response.headers.values()) {
    if (header.required && headers[header.name] === undefined) {
      findings.push(
        finding(
          "response-header-missing",
          { ...rLoc, part: "responseHeader", name: header.name },
          `required response header ${quote(header.name)} is missing from the ${status} response`,
          index,
          {
            implementation: `Send the ${header.name} header in the ${status} response of ${op.method} ${op.path}.`,
            spec: `Mark ${header.name} optional or remove it at ${specBase}.responses["${key}"].headers.`,
          },
          header.name,
        ),
      );
    }
  }

  const body = obs.response.body;
  if (body === undefined || status === 204 || status === 304 || op.method === "HEAD") return;
  if (response.content.size === 0) return;

  const declared = obs.response.mediaType ?? headers["content-type"];
  const mt = declared === undefined ? guessMediaType(body, response) : normalizeMediaType(declared);
  const mediaKey = resolveMediaType(response, mt);
  if (mediaKey === undefined) {
    findings.push(
      finding(
        "undocumented-response-media-type",
        { ...rLoc, mediaType: mt },
        `media type ${quote(mt)} is not documented for the ${status} response`,
        index,
        {
          implementation: `Return one of ${[...response.content.keys()].join(", ")} from ${op.method} ${op.path}.`,
          spec: `Add "${mt}" under ${specBase}.responses["${key}"].content.`,
        },
        [...response.content.keys()],
        mt,
      ),
    );
    return;
  }
  const media = response.content.get(mediaKey);
  if (media?.schema === undefined) return;
  const mLoc: Location = { ...rLoc, mediaType: mediaKey };
  const specSchema = `${specBase}.responses["${key}"].content["${mediaKey}"].schema`;

  let value = body;
  if (typeof body === "string" && isJsonMediaType(mt)) {
    try {
      value = JSON.parse(body);
    } catch {
      findings.push(
        finding(
          "response-body-not-json",
          mLoc,
          `the ${status} response is documented as ${quote(mediaKey)} but the body is not valid JSON`,
          index,
          {
            implementation: `Return valid JSON from ${op.method} ${op.path} for the ${status} response.`,
            spec: `Change the media type at ${specBase}.responses["${key}"].content to what is actually returned.`,
          },
        ),
      );
      return;
    }
  }
  for (const v of validate(media.schema, value, "output", limits)) {
    const loc = withPointer(mLoc, v.pointer);
    if (v.kind === "pattern-not-checked") {
      findings.push(patternNotChecked(loc, v, index, specSchema));
      continue;
    }
    findings.push(responseFinding(v, loc, index, op, status, specSchema));
  }
}

function resolveResponse(
  op: Operation,
  status: number,
): { key: string; response: Response } | undefined {
  const exact = op.responses.get(String(status));
  if (exact !== undefined) return { key: String(status), response: exact };
  const range = `${Math.floor(status / 100)}XX`;
  for (const [k, r] of op.responses) {
    if (k.toUpperCase() === range) return { key: k, response: r };
  }
  const def = op.responses.get("default");
  if (def !== undefined) return { key: "default", response: def };
  return undefined;
}

function guessMediaType(body: unknown, response: Response): string {
  if (typeof body !== "string") {
    if (response.content.has("application/json")) return "application/json";
    const json = [...response.content.keys()].find(isJsonMediaType);
    if (json !== undefined) return json;
  }
  return response.content.keys().next().value ?? "application/octet-stream";
}

function resolveMediaType(response: Response, mt: string): string | undefined {
  if (response.content.has(mt)) return mt;
  if (response.content.has("*/*")) return "*/*";
  const type = mt.split("/")[0] ?? mt;
  if (response.content.has(`${type}/*`)) return `${type}/*`;
  return undefined;
}

function responseFinding(
  v: Violation,
  loc: Location,
  index: number,
  op: Operation,
  status: number,
  specSchema: string,
): Finding {
  const at = schemaPath(specSchema, v.pointer);
  // For properties that are missing or unknown the pointer names the property; the fix
  // belongs on the object schema that holds it.
  const parentAt = schemaPath(specSchema, parentPointer(v.pointer));
  const where = v.pointer === "" ? "the response body" : `response body at ${v.pointer}`;
  const subject = `${op.method} ${op.path}`;
  let id: string;
  let impl: string;
  let spec: string;
  switch (v.kind) {
    case "required":
      id = "response-missing-required-property";
      impl = `Include ${quote(v.expected)} in the ${status} response of ${subject}.`;
      spec = `Remove ${quote(v.expected)} from required at ${parentAt}.`;
      break;
    case "undocumented-property":
      id = "response-undocumented-property";
      impl = `Stop returning ${quote(v.actual)} from ${subject} if it is not part of the contract.`;
      spec = `Add ${quote(v.actual)} to ${parentAt}.properties.`;
      break;
    case "forbidden-property":
      id = "response-forbidden-property";
      impl = `Stop returning ${quote(v.actual)} from ${subject}; the spec forbids unknown properties here.`;
      spec = `Add ${quote(v.actual)} to ${parentAt}.properties or allow additionalProperties.`;
      break;
    case "type":
      id = "response-type-mismatch";
      impl = `Return ${quote(Array.isArray(v.expected) ? v.expected.join(", ") : v.expected)} in ${where}.`;
      spec = `Change the type at ${at} to ${quote(v.actual)}.`;
      break;
    case "null":
      id = "response-null-not-allowed";
      impl = `Return a non-null value in ${where}.`;
      spec = `Allow null at ${at} (add "null" to type, or nullable: true in OpenAPI 3.0).`;
      break;
    case "enum":
    case "const":
      id = "response-enum-violation";
      impl = `Return one of the documented values in ${where}.`;
      spec = `Add the returned value to the enum at ${at}.`;
      break;
    default:
      if (CONSTRAINT_KINDS.has(v.kind)) {
        id = "response-constraint-violation";
        impl =
          `Make ${where} satisfy ${v.kind} ${v.expected === undefined ? "" : quote(v.expected)}.`.replace(
            /\s+\.$/,
            ".",
          );
        spec = `Relax ${v.kind} at ${at} to cover what is returned.`;
      } else if (COMPOSITION_KINDS.has(v.kind)) {
        id = "response-composition-violation";
        impl = `Return a value in ${where} that matches the documented alternatives.`;
        spec = `Adjust the oneOf, anyOf, allOf or not at ${at} to describe what is returned.`;
      } else {
        id = "response-constraint-violation";
        impl = `Make ${where} conform to the spec.`;
        spec = `Adjust the schema at ${at} to describe what is returned.`;
      }
  }
  return finding(
    id,
    loc,
    `${where}: ${v.message}`,
    index,
    { implementation: impl, spec },
    v.expected,
    v.actual,
  );
}

function patternNotChecked(
  loc: Location,
  v: Violation,
  index: number,
  specSchema: string,
): Finding {
  return finding(
    "pattern-not-checked",
    loc,
    v.message,
    index,
    {
      implementation: "No action needed.",
      spec: `Simplify the pattern at ${schemaPath(specSchema, v.pointer)} so it can be evaluated safely.`,
    },
    v.expected,
  );
}

// ---------------------------------------------------------------------------
// Helpers

function finding(
  id: string,
  location: Location,
  message: string,
  observation: number,
  fix: Finding["fix"],
  expected?: unknown,
  actual?: unknown,
): Finding {
  const f: Finding = { id, severity: findingSeverity(id), location, message, observation, fix };
  if (expected !== undefined) f.expected = expected;
  if (actual !== undefined) f.actual = actual;
  return f;
}

function withPointer(loc: Location, pointer: string): Location {
  if (pointer === "") return loc;
  return { ...loc, pointer };
}

/** Readable path into the spec document for an operation. */
function specPath(op: Operation): string {
  return `paths["${op.path}"].${op.method.toLowerCase()}`;
}

function parentPointer(pointer: string): string {
  const i = pointer.lastIndexOf("/");
  return i <= 0 ? "" : pointer.slice(0, i);
}

/** Map a pointer into a VALUE to a readable path into the SCHEMA that describes it. */
function schemaPath(specSchema: string, valuePointer: string): string {
  if (valuePointer === "") return specSchema;
  const parts = valuePointer
    .split("/")
    .slice(1)
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let out = specSchema;
  for (const part of parts) {
    out += /^\d+$/.test(part) ? ".items" : `.properties["${part}"]`;
  }
  return out;
}

function finalize(f: Finding, limits: Limits): Finding {
  const out: Finding = {
    id: f.id,
    severity: f.severity,
    location: f.location,
    message: safeString(f.message, limits.maxStringBytes),
    fix: {
      implementation: safeString(f.fix.implementation, limits.maxStringBytes),
      spec: safeString(f.fix.spec, limits.maxStringBytes),
    },
  };
  if (f.observation !== undefined) out.observation = f.observation;
  const expected = clip(f.expected, limits.maxValueBytes);
  const actual = clip(f.actual, limits.maxValueBytes);
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return out;
}

function compareFindings(a: Finding, b: Finding): number {
  const la = locationKey(a.location);
  const lb = locationKey(b.location);
  if (la !== lb) return la < lb ? -1 : 1;
  const sa = SEVERITY_ORDER[a.severity];
  const sb = SEVERITY_ORDER[b.severity];
  if (sa !== sb) return sa - sb;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.message !== b.message) return a.message < b.message ? -1 : 1;
  return (a.observation ?? -1) - (b.observation ?? -1);
}

// ---------------------------------------------------------------------------
// Config: same semantics as `applyConfig`, over finding IDs.

/** Kept for API compatibility; `validateConfig` now accepts finding IDs as well. */
export function validateVerifyConfig(raw: unknown): Config {
  return validateConfig(raw);
}

function applyFindingConfig(
  findings: Finding[],
  config: Config,
): { findings: Finding[]; suppressed: number } {
  const patterns = (config.ignore?.subjects ?? []).map(compileSubjectPattern);
  const ignoredIds = new Set(config.ignore?.ids ?? []);
  const baseline = new Set(config.baseline ?? []);
  const out: Finding[] = [];
  let suppressed = 0;
  for (const f of findings) {
    const override = config.severity?.[f.id];
    const subject = f.location.subject;
    if (
      ignoredIds.has(f.id) ||
      override === "ignore" ||
      (subject !== undefined && patterns.some((p) => p.test(subject))) ||
      (baseline.size > 0 && baseline.has(fingerprintFinding(f)))
    ) {
      suppressed++;
      continue;
    }
    out.push(override === undefined ? f : { ...f, severity: override });
  }
  return { findings: out, suppressed };
}

/** Stable identity for a finding, mirroring `fingerprint()` for changes. */
export function fingerprintFinding(f: Finding): string {
  const canonical = JSON.stringify([
    f.id,
    f.location.kind,
    f.location.subject ?? "",
    f.location.part ?? "",
    f.location.name ?? "",
    f.location.mediaType ?? "",
    f.location.pointer ?? "",
    stable(f.expected),
    stable(f.actual),
  ]);
  return fnv1a64(canonical);
}
