import { makeChange, schemaEventsToChanges } from "../change.js";
import { diffSchemas } from "../schema/diff.js";
import { quote } from "../text.js";
import type { Change, Limits, Location } from "../types.js";
import type { Operation, Parameter, Response, SecurityAlternative, Surface } from "./model.js";

const SRC = "openapi" as const;

export function diffOpenApi(before: Surface, after: Surface, limits: Limits): Change[] {
  const out: Change[] = [];
  const doc: Location = { kind: "document" };

  if ((before.title ?? "") !== (after.title ?? "")) {
    out.push(
      makeChange("api-title-changed", SRC, doc, "the API title changed", before.title, after.title),
    );
  }
  if ((before.version ?? "") !== (after.version ?? "")) {
    out.push(
      makeChange(
        "api-version-changed",
        SRC,
        doc,
        "the API version changed",
        before.version,
        after.version,
      ),
    );
  }
  for (const s of after.servers) {
    if (!before.servers.includes(s))
      out.push(
        makeChange("api-server-added", SRC, doc, `server ${quote(s)} was added`, undefined, s),
      );
  }
  for (const s of before.servers) {
    if (!after.servers.includes(s))
      out.push(
        makeChange("api-server-removed", SRC, doc, `server ${quote(s)} was removed`, s, undefined),
      );
  }

  diffSecuritySchemes(before, after, out);
  diffSecurity(before.security, after.security, { kind: "document", part: "security" }, out);

  for (const [key, aOp] of after.operations) {
    const bOp = before.operations.get(key);
    const loc: Location = { kind: "operation", subject: `${aOp.method} ${aOp.path}` };
    if (bOp === undefined) {
      out.push(makeChange("endpoint-added", SRC, loc, "operation was added"));
      continue;
    }
    diffOperation(bOp, aOp, loc, limits, out);
  }
  for (const [key, bOp] of before.operations) {
    if (after.operations.has(key)) continue;
    const loc: Location = { kind: "operation", subject: `${bOp.method} ${bOp.path}` };
    if (bOp.deprecated)
      out.push(
        makeChange("deprecated-endpoint-removed", SRC, loc, "deprecated operation was removed"),
      );
    else
      out.push(
        makeChange("endpoint-removed", SRC, loc, "operation was removed without prior deprecation"),
      );
  }
  return out;
}

function diffSecuritySchemes(before: Surface, after: Surface, out: Change[]): void {
  const loc: Location = { kind: "document", part: "security" };
  for (const [name, a] of after.securitySchemes) {
    const b = before.securitySchemes.get(name);
    if (b === undefined) {
      out.push(
        makeChange(
          "security-scheme-added",
          SRC,
          { ...loc, name },
          `security scheme ${quote(name)} was added`,
          undefined,
          a,
        ),
      );
    } else if (JSON.stringify(b) !== JSON.stringify(a)) {
      out.push(
        makeChange(
          "security-scheme-changed",
          SRC,
          { ...loc, name },
          `security scheme ${quote(name)} changed`,
          b,
          a,
        ),
      );
    }
  }
  for (const [name, b] of before.securitySchemes) {
    if (!after.securitySchemes.has(name)) {
      out.push(
        makeChange(
          "security-scheme-removed",
          SRC,
          { ...loc, name },
          `security scheme ${quote(name)} was removed`,
          b,
          undefined,
        ),
      );
    }
  }
}

function diffSecurity(
  before: SecurityAlternative[] | undefined,
  after: SecurityAlternative[] | undefined,
  loc: Location,
  out: Change[],
): void {
  if (before === undefined && after === undefined) return;
  const b = before ?? [];
  const a = after ?? [];
  const bNone = b.length === 0 || b.every((alt) => alt.schemes.size === 0);
  const aNone = a.length === 0 || a.every((alt) => alt.schemes.size === 0);
  if (bNone && aNone) return;
  if (bNone) {
    out.push(
      makeChange(
        "security-added",
        SRC,
        loc,
        "authentication is now required",
        undefined,
        a.map((x) => x.key),
      ),
    );
    return;
  }
  if (aNone) {
    out.push(
      makeChange(
        "security-removed",
        SRC,
        loc,
        "authentication is no longer required",
        b.map((x) => x.key),
        undefined,
      ),
    );
    return;
  }
  const bMap = new Map(b.map((alt) => [alt.key, alt] as const));
  const aMap = new Map(a.map((alt) => [alt.key, alt] as const));
  for (const [key, aAlt] of aMap) {
    const bAlt = bMap.get(key);
    if (bAlt === undefined) {
      out.push(
        makeChange(
          "security-requirement-added",
          SRC,
          { ...loc, name: key },
          `authentication alternative ${quote(key)} was added`,
        ),
      );
      continue;
    }
    for (const [scheme, aScopes] of aAlt.schemes) {
      const bScopes = bAlt.schemes.get(scheme) ?? [];
      for (const s of aScopes) {
        if (!bScopes.includes(s))
          out.push(
            makeChange(
              "security-scope-added",
              SRC,
              { ...loc, name: key },
              `scope ${quote(s)} is now required for ${quote(scheme)}`,
              undefined,
              s,
            ),
          );
      }
      for (const s of bScopes) {
        if (!aScopes.includes(s))
          out.push(
            makeChange(
              "security-scope-removed",
              SRC,
              { ...loc, name: key },
              `scope ${quote(s)} is no longer required for ${quote(scheme)}`,
              s,
              undefined,
            ),
          );
      }
    }
  }
  for (const key of bMap.keys()) {
    if (!aMap.has(key))
      out.push(
        makeChange(
          "security-requirement-removed",
          SRC,
          { ...loc, name: key },
          `authentication alternative ${quote(key)} was removed`,
        ),
      );
  }
}

function diffOperation(
  b: Operation,
  a: Operation,
  loc: Location,
  limits: Limits,
  out: Change[],
): void {
  if (!b.deprecated && a.deprecated)
    out.push(makeChange("endpoint-deprecated", SRC, loc, "operation was marked deprecated"));
  if (b.deprecated && !a.deprecated)
    out.push(makeChange("endpoint-undeprecated", SRC, loc, "operation is no longer deprecated"));
  if (b.operationId !== a.operationId) {
    if (b.operationId === undefined)
      out.push(
        makeChange(
          "endpoint-operation-id-added",
          SRC,
          loc,
          `operationId ${quote(a.operationId)} was added`,
          undefined,
          a.operationId,
        ),
      );
    else if (a.operationId === undefined)
      out.push(
        makeChange(
          "endpoint-operation-id-removed",
          SRC,
          loc,
          `operationId ${quote(b.operationId)} was removed`,
          b.operationId,
          undefined,
        ),
      );
    else
      out.push(
        makeChange(
          "endpoint-operation-id-changed",
          SRC,
          loc,
          `operationId changed from ${quote(b.operationId)} to ${quote(a.operationId)}`,
          b.operationId,
          a.operationId,
        ),
      );
  }
  if ((b.summary ?? "") !== (a.summary ?? ""))
    out.push(
      makeChange("endpoint-summary-changed", SRC, loc, "summary changed", b.summary, a.summary),
    );
  if ((b.description ?? "") !== (a.description ?? ""))
    out.push(
      makeChange(
        "endpoint-description-changed",
        SRC,
        loc,
        "description changed",
        b.description,
        a.description,
      ),
    );

  diffParameters(b, a, loc, limits, out);
  diffRequestBody(b, a, loc, limits, out);
  diffResponses(b, a, loc, limits, out);
  if (b.security !== undefined || a.security !== undefined) {
    diffSecurity(b.security, a.security, { ...loc, part: "security" }, out);
  }
}

function diffParameters(
  b: Operation,
  a: Operation,
  loc: Location,
  limits: Limits,
  out: Change[],
): void {
  for (const [key, aParam] of a.parameters) {
    const pLoc: Location = { ...loc, part: "parameter", name: `${aParam.in}:${aParam.name}` };
    const bParam = b.parameters.get(key);
    if (bParam === undefined) {
      const id = aParam.required ? "request-required-parameter-added" : "request-parameter-added";
      out.push(
        makeChange(
          id,
          SRC,
          pLoc,
          `${aParam.required ? "required " : ""}${aParam.in} parameter ${quote(aParam.name)} was added`,
        ),
      );
      continue;
    }
    diffParameter(bParam, aParam, pLoc, limits, out);
  }
  for (const [key, bParam] of b.parameters) {
    if (a.parameters.has(key)) continue;
    out.push(
      makeChange(
        "request-parameter-removed",
        SRC,
        { ...loc, part: "parameter", name: `${bParam.in}:${bParam.name}` },
        `${bParam.in} parameter ${quote(bParam.name)} was removed`,
      ),
    );
  }
}

function diffParameter(
  b: Parameter,
  a: Parameter,
  loc: Location,
  limits: Limits,
  out: Change[],
): void {
  if (!b.required && a.required)
    out.push(
      makeChange(
        "request-parameter-became-required",
        SRC,
        loc,
        `${a.in} parameter ${quote(a.name)} became required`,
      ),
    );
  if (b.required && !a.required)
    out.push(
      makeChange(
        "request-parameter-became-optional",
        SRC,
        loc,
        `${a.in} parameter ${quote(a.name)} became optional`,
      ),
    );
  if (!b.deprecated && a.deprecated)
    out.push(
      makeChange(
        "request-parameter-deprecated",
        SRC,
        loc,
        `${a.in} parameter ${quote(a.name)} was deprecated`,
      ),
    );
  if (b.deprecated && !a.deprecated)
    out.push(
      makeChange(
        "request-parameter-undeprecated",
        SRC,
        loc,
        `${a.in} parameter ${quote(a.name)} is no longer deprecated`,
      ),
    );
  const events = diffSchemas(b.schema, a.schema, "input", limits);
  out.push(...schemaEventsToChanges(events, "request-parameter", loc));
}

function diffRequestBody(
  b: Operation,
  a: Operation,
  loc: Location,
  limits: Limits,
  out: Change[],
): void {
  const bLoc: Location = { ...loc, part: "requestBody" };
  if (b.requestBody === undefined && a.requestBody === undefined) return;
  if (b.requestBody === undefined && a.requestBody !== undefined) {
    const id = a.requestBody.required ? "request-required-body-added" : "request-body-added";
    out.push(
      makeChange(
        id,
        SRC,
        bLoc,
        `${a.requestBody.required ? "required " : ""}request body was added`,
      ),
    );
    return;
  }
  if (b.requestBody !== undefined && a.requestBody === undefined) {
    out.push(makeChange("request-body-removed", SRC, bLoc, "request body was removed"));
    return;
  }
  if (b.requestBody === undefined || a.requestBody === undefined) return;
  if (!b.requestBody.required && a.requestBody.required)
    out.push(makeChange("request-body-became-required", SRC, bLoc, "request body became required"));
  if (b.requestBody.required && !a.requestBody.required)
    out.push(makeChange("request-body-became-optional", SRC, bLoc, "request body became optional"));

  for (const [mt, aMt] of a.requestBody.content) {
    const mLoc: Location = { ...bLoc, mediaType: mt };
    const bMt = b.requestBody.content.get(mt);
    if (bMt === undefined) {
      out.push(
        makeChange(
          "request-body-media-type-added",
          SRC,
          mLoc,
          `request body now accepts ${quote(mt)}`,
        ),
      );
      continue;
    }
    const events = diffSchemas(bMt.schema, aMt.schema, "input", limits);
    out.push(...schemaEventsToChanges(events, "request-property", mLoc));
  }
  for (const mt of b.requestBody.content.keys()) {
    if (!a.requestBody.content.has(mt))
      out.push(
        makeChange(
          "request-body-media-type-removed",
          SRC,
          { ...bLoc, mediaType: mt },
          `request body no longer accepts ${quote(mt)}`,
        ),
      );
  }
}

function diffResponses(
  b: Operation,
  a: Operation,
  loc: Location,
  limits: Limits,
  out: Change[],
): void {
  for (const [status, aRes] of a.responses) {
    const rLoc: Location = { ...loc, part: "response", name: status };
    const bRes = b.responses.get(status);
    if (bRes === undefined) {
      out.push(makeChange("response-added", SRC, rLoc, `response ${quote(status)} was added`));
      continue;
    }
    diffResponse(bRes, aRes, rLoc, limits, out);
  }
  for (const status of b.responses.keys()) {
    if (!a.responses.has(status))
      out.push(
        makeChange(
          "response-removed",
          SRC,
          { ...loc, part: "response", name: status },
          `response ${quote(status)} was removed`,
        ),
      );
  }
}

function diffResponse(
  b: Response,
  a: Response,
  loc: Location,
  limits: Limits,
  out: Change[],
): void {
  if ((b.description ?? "") !== (a.description ?? "")) {
    out.push(
      makeChange(
        "response-description-changed",
        SRC,
        loc,
        "response description changed",
        b.description,
        a.description,
      ),
    );
  }
  for (const [mt, aMt] of a.content) {
    const mLoc: Location = { ...loc, mediaType: mt };
    const bMt = b.content.get(mt);
    if (bMt === undefined) {
      out.push(
        makeChange("response-media-type-added", SRC, mLoc, `response may now be ${quote(mt)}`),
      );
      continue;
    }
    const events = diffSchemas(bMt.schema, aMt.schema, "output", limits);
    out.push(...schemaEventsToChanges(events, "response-property", mLoc));
  }
  for (const mt of b.content.keys()) {
    if (!a.content.has(mt))
      out.push(
        makeChange(
          "response-media-type-removed",
          SRC,
          { ...loc, mediaType: mt },
          `response is no longer returned as ${quote(mt)}`,
        ),
      );
  }
  for (const [name, aH] of a.headers) {
    const hLoc: Location = { ...loc, part: "responseHeader", name };
    const bH = b.headers.get(name);
    if (bH === undefined) {
      out.push(
        makeChange("response-header-added", SRC, hLoc, `response header ${quote(name)} was added`),
      );
      continue;
    }
    if (bH.required && !aH.required)
      out.push(
        makeChange(
          "response-header-became-optional",
          SRC,
          hLoc,
          `response header ${quote(name)} became optional`,
        ),
      );
    if (!bH.required && aH.required)
      out.push(
        makeChange(
          "response-header-became-required",
          SRC,
          hLoc,
          `response header ${quote(name)} became required`,
        ),
      );
    const events = diffSchemas(bH.schema, aH.schema, "output", limits);
    out.push(...schemaEventsToChanges(events, "response-header", hLoc));
  }
  for (const name of b.headers.keys()) {
    if (!a.headers.has(name))
      out.push(
        makeChange(
          "response-header-removed",
          SRC,
          { ...loc, part: "responseHeader", name },
          `response header ${quote(name)} was removed`,
        ),
      );
  }
}
