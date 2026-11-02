#!/usr/bin/env node
/**
 * Aggregate out/<id>/result.json into results/: summary.md, summary.json,
 * <id>.findings.json and <id>.observations.json (requests and statuses, no bodies).
 *
 * Findings are classified so a reader can tell drift from noise:
 *   body    a successful (2xx) response whose body does not match the documented schema
 *   media   a successful response in a media type the spec does not list
 *   errors  a 3xx/4xx status or error media type the spec does not document
 *   server  a 5xx response; transient until reproduced
 *   input   our own request values violated the spec, or hit no operation; not the API's fault
 * A finding is additionally marked `strict` when a typed client generated from the spec
 * would break on it: wrong type, missing required field, forbidden field, disallowed null,
 * wrong media type.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const targets = JSON.parse(await readFile(resolve(here, "targets.json"), "utf8"));
const outDir = resolve(here, "out");
const resDir = resolve(here, "results");
await mkdir(resDir, { recursive: true });

const BODY = new Set([
  "response-type-mismatch",
  "response-null-not-allowed",
  "response-missing-required-property",
  "response-undocumented-property",
  "response-forbidden-property",
  "response-enum-violation",
  "response-composition-violation",
  "response-constraint-violation",
  "response-body-not-json",
  "response-header-missing",
]);
const HARD = new Set([
  "response-type-mismatch",
  "response-missing-required-property",
  "response-forbidden-property",
  "response-null-not-allowed",
  "response-enum-violation",
  "response-body-not-json",
  "undocumented-response-media-type",
]);
const INPUT_PREFIX = /^(request-|undocumented-operation|pattern-not-checked|deprecated-operation-in-use)/;
const SWAGGER2 = new Set(["gitea", "codeberg", "httpbin"]);

function isInputFinding(f) {
  return INPUT_PREFIX.test(f.id) && f.id !== "request-rejected-but-valid";
}

function classify(f, obs, all) {
  const status = obs?.response.status ?? 0;
  if (isInputFinding(f)) return "input";
  if (status >= 500) return "server";
  if (f.id === "request-rejected-but-valid") {
    const ours = all.some((g) => g.observation === f.observation && isInputFinding(g));
    return ours ? "input" : "errors";
  }
  if (f.id === "undocumented-status" || f.id === "undocumented-response-media-type") {
    return status >= 200 && status < 300 ? "media" : "errors";
  }
  if (BODY.has(f.id)) return status >= 200 && status < 300 ? "body" : "errors";
  return "errors";
}

const lines = [
  "# Public API conformance survey",
  "",
  "Read-only GET requests against public APIs that publish their own OpenAPI document, checked with `apidrifter run`.",
  "",
  "Columns: **body** = successful responses whose body does not match the documented schema;",
  "**hard** = the subset a typed client would break on (wrong type, missing required field, forbidden field, disallowed null, wrong media type);",
  "**media** = successful responses in an undocumented media type; **errors** = undocumented 3xx/4xx statuses, usually",
  "auth or not-found cases the spec omits; **server** = 5xx, transient until reproduced; **input** = our own request",
  "values were wrong, not the API's fault. Counts are distinct schema locations, not raw occurrences.",
  "",
  "| API | Spec | Ops in spec | GET sent | 2xx | body | hard | media | errors | server | input | Reviewer note |",
  "|-----|------|-------------|----------|-----|------|------|-------|--------|--------|-------|---------------|",
];
const totals = { apis: 0, withBody: 0, withHard: 0, body: 0, hard: 0, media: 0, errors: 0, server: 0, input: 0 };
const summaryRows = [];

for (const t of targets) {
  let r;
  let obs;
  try {
    r = JSON.parse(await readFile(resolve(outDir, t.id, "result.json"), "utf8"));
    obs = JSON.parse(await readFile(resolve(outDir, t.id, "observations.json"), "utf8"));
  } catch {
    lines.push(`| ${t.name} | [spec](${t.spec}) | - | - | - | - | - | - | - | - | - | not run |`);
    continue;
  }
  const counts = { body: 0, hard: 0, media: 0, errors: 0, server: 0, input: 0 };
  const findings = r.findings.map((f) => {
    const o = f.observation === undefined ? undefined : obs[f.observation];
    const cls = classify(f, o, r.findings);
    counts[cls]++;
    const strict = (cls === "body" || cls === "media") && HARD.has(f.id);
    if (strict) counts.hard++;
    const request =
      o === undefined
        ? undefined
        : {
            method: o.request.method,
            path: o.request.path,
            query: o.request.query ?? {},
            status: o.response.status,
            mediaType: o.response.mediaType ?? null,
          };
    return { class: cls, strict, ...f, request, review: t.review?.[f.id] ?? "unreviewed" };
  });
  const ok = obs.filter((o) => o.response.status >= 200 && o.response.status < 300).length;
  const sent = obs.length + (r.failures?.length ?? 0);
  totals.apis++;
  if (counts.body > 0) totals.withBody++;
  if (counts.hard > 0) totals.withHard++;
  for (const k of Object.keys(counts)) totals[k] += counts[k];
  lines.push(
    `| ${t.name} | [spec](${t.spec}) | ${r.coverage.operations} | ${sent} | ${ok} | ${counts.body} | ${counts.hard} | ${counts.media} | ${counts.errors} | ${counts.server} | ${counts.input} | ${t.note ?? ""} |`,
  );
  await writeFile(resolve(resDir, `${t.id}.findings.json`), `${JSON.stringify(findings, null, 2)}\n`);
  const trimmed = obs.map((o, i) => ({
    index: i,
    operationKey: o.operationKey,
    method: o.request.method,
    path: o.request.path,
    query: o.request.query ?? {},
    status: o.response.status,
    mediaType: o.response.mediaType ?? null,
    capturedAt: o.capturedAt ?? null,
  }));
  await writeFile(resolve(resDir, `${t.id}.observations.json`), `${JSON.stringify(trimmed, null, 2)}\n`);
  summaryRows.push({
    id: t.id,
    name: t.name,
    spec: t.spec,
    baseUrl: t.baseUrl,
    specFormat: SWAGGER2.has(t.id) ? "swagger-2.0" : "openapi-3",
    operations: r.coverage.operations,
    sent,
    ok,
    observed: r.coverage.observed,
    counts,
    note: t.note ?? "",
    ranAt: trimmed[0]?.capturedAt ?? null,
  });
}
lines.push("");
lines.push(
  `**${totals.withBody} of ${totals.apis} APIs** returned at least one successful response whose body does not match their own spec. Strict count, hard violations only: **${totals.withHard} of ${totals.apis}**, ${totals.hard} distinct schema locations. Totals: ${totals.body} body, ${totals.media} media, ${totals.errors} error-documentation, ${totals.server} server, ${totals.input} input.`,
);
lines.push("");
lines.push(
  "Method: one GET request per operation, values from the spec's own examples or a small hand-written set, a delay between requests, a named User-Agent, and no credentials. Operations that needed values we could not supply were skipped. Each row's findings file in this directory lists every finding with the fix the engine suggests for the spec and for the implementation, and the observations file lists every request sent and the status it got.",
);
await writeFile(resolve(resDir, "summary.md"), `${lines.join("\n")}\n`);
await writeFile(
  resolve(resDir, "summary.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), totals, apis: summaryRows }, null, 2)}\n`,
);
console.log(lines.join("\n"));
