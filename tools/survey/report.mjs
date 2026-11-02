#!/usr/bin/env node
/**
 * Aggregate out/<id>/result.json into results/summary.md and results/<id>.findings.json.
 *
 * Findings are classified so a reader can tell drift from noise:
 *   body      a successful (2xx) response whose body does not match the documented schema
 *   media     a successful response in a media type the spec does not list
 *   errors    a 3xx/4xx status or error media type the spec does not document
 *   server    a 5xx response; transient until reproduced
 *   input     our own request values violated the spec, or hit no operation; not the API's fault
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
const INPUT_PREFIX =
  /^(request-|undocumented-operation|pattern-not-checked|deprecated-operation-in-use)/;

function classify(f, obs) {
  const status = obs?.response.status ?? 0;
  if (INPUT_PREFIX.test(f.id) && f.id !== "request-rejected-but-valid") return "input";
  if (status >= 500) return "server";
  if (f.id === "request-rejected-but-valid") return hasInputFinding(f, obs) ? "input" : "errors";
  if (f.id === "undocumented-status" || f.id === "undocumented-response-media-type") {
    return status >= 200 && status < 300 ? "media" : "errors";
  }
  if (BODY.has(f.id)) return status >= 200 && status < 300 ? "body" : "errors";
  return "errors";
}
let currentFindings = [];
function hasInputFinding(f) {
  return currentFindings.some(
    (g) =>
      g.observation === f.observation &&
      INPUT_PREFIX.test(g.id) &&
      g.id !== "request-rejected-but-valid",
  );
}

const lines = [
  "# Public API conformance survey",
  "",
  "Read-only GET requests against public APIs that publish their own OpenAPI document, checked with `apidrifter run`.",
  "",
  "Columns: **body** = successful responses whose body does not match the documented schema (the headline number);",
  "**media** = successful responses in an undocumented media type; **errors** = undocumented 3xx/4xx statuses, usually",
  "auth or not-found cases the spec omits; **server** = 5xx, transient until reproduced; **input** = our own request",
  "values were wrong, not the API's fault. Counts are distinct schema locations, not raw occurrences.",
  "",
  "| API | Spec | Ops in spec | GET sent | 2xx | body | media | errors | server | input | Reviewer note |",
  "|-----|------|-------------|----------|-----|------|-------|--------|--------|-------|---------------|",
];
const totals = { apis: 0, withBody: 0, body: 0, media: 0, errors: 0, server: 0, input: 0 };
for (const t of targets) {
  let r;
  let obs;
  try {
    r = JSON.parse(await readFile(resolve(outDir, t.id, "result.json"), "utf8"));
    obs = JSON.parse(await readFile(resolve(outDir, t.id, "observations.json"), "utf8"));
  } catch {
    lines.push(`| ${t.name} | [spec](${t.spec}) | - | - | - | - | - | - | - | - | not run |`);
    continue;
  }
  currentFindings = r.findings;
  const counts = { body: 0, media: 0, errors: 0, server: 0, input: 0 };
  const findings = r.findings.map((f) => {
    const cls = classify(f, f.observation === undefined ? undefined : obs[f.observation]);
    counts[cls]++;
    return { class: cls, ...f, review: t.review?.[f.id] ?? "unreviewed" };
  });
  const ok = obs.filter((o) => o.response.status >= 200 && o.response.status < 300).length;
  totals.apis++;
  if (counts.body > 0) totals.withBody++;
  for (const k of Object.keys(counts)) totals[k] += counts[k];
  const sent = obs.length + (r.failures?.length ?? 0);
  lines.push(
    `| ${t.name} | [spec](${t.spec}) | ${r.coverage.operations} | ${sent} | ${ok} | ${counts.body} | ${counts.media} | ${counts.errors} | ${counts.server} | ${counts.input} | ${t.note ?? ""} |`,
  );
  await writeFile(
    resolve(resDir, `${t.id}.findings.json`),
    `${JSON.stringify(findings, null, 2)}\n`,
  );
}
lines.push("");
lines.push(
  `**${totals.withBody} of ${totals.apis} APIs** returned at least one successful response whose body does not match their own spec. Totals: ${totals.body} body, ${totals.media} media, ${totals.errors} error-documentation, ${totals.server} server, ${totals.input} input.`,
);
lines.push("");
lines.push(
  "Method: one GET request per operation, values from the spec's own examples or a small hand-written set, a delay between requests, a named User-Agent, and no credentials. Operations that needed values we could not supply were skipped. Each row's findings file in this directory lists every finding with the fix the engine suggests for the spec and for the implementation.",
);
await writeFile(resolve(resDir, "summary.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
