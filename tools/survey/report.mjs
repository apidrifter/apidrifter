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
 *
 * Usage: node report.mjs [--month YYYY-MM] [--targets <file>] [--skip-post]
 *   Without --month: reads out/ and writes results/ (the hand-curated survey).
 *   With --month: reads out/YYYY-MM/, writes results/YYYY-MM/ plus results/YYYY-MM/targets.json,
 *   records every target in surveyed.json, writes a draft post from post-template.mdx to
 *   apps/web/src/content/research/public-api-spec-drift-YYYY-MM.mdx (unless --skip-post or the
 *   post exists and is no longer a draft) and a pull-request body at out/YYYY-MM/pr-body.md.
 *   APIs with no successful response are dropped from the month's results: without a 2xx there
 *   is nothing to check, and the usual cause is an API that needs credentials after all.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const { values: opts } = parseArgs({
  options: {
    month: { type: "string" },
    targets: { type: "string" },
    "skip-post": { type: "boolean", default: false },
  },
});
const month = opts.month;
if (month !== undefined && !/^\d{4}-\d{2}$/.test(month)) {
  throw new Error(`--month must be YYYY-MM, got ${month}`);
}
const targetsPath = resolve(opts.targets ?? resolve(here, "targets.json"));
const targets = JSON.parse(await readFile(targetsPath, "utf8"));
const outDir = month === undefined ? resolve(here, "out") : resolve(here, "out", month);
const resDir = month === undefined ? resolve(here, "results") : resolve(here, "results", month);
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
const INPUT_PREFIX =
  /^(request-|undocumented-operation|pattern-not-checked|deprecated-operation-in-use)/;
/** Hand-curated targets that serve Swagger 2.0; automated targets carry specFormat themselves. */
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

async function readJsonOr(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

function reviewerNote(t, meta) {
  if (t.note) return t.note;
  if (t.auto !== true) return "";
  const parts = ["Unreviewed, automated run."];
  if (t.specUpdated)
    parts.push(`Spec is the apis.guru mirror updated ${t.specUpdated.slice(0, 10)}.`);
  if (meta?.unfillable)
    parts.push(`${meta.unfillable} operations skipped for lack of example values.`);
  return parts.join(" ");
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
const totals = {
  apis: 0,
  withBody: 0,
  withHard: 0,
  body: 0,
  hard: 0,
  media: 0,
  errors: 0,
  server: 0,
  input: 0,
};
const summaryRows = [];
/** Per-API detail for the draft post: the first hard finding, or none. */
const details = [];
const notRun = [];
const dropped = [];

for (const t of targets) {
  let r;
  let obs;
  try {
    r = JSON.parse(await readFile(resolve(outDir, t.id, "result.json"), "utf8"));
    obs = JSON.parse(await readFile(resolve(outDir, t.id, "observations.json"), "utf8"));
  } catch {
    lines.push(`| ${t.name} | [spec](${t.spec}) | - | - | - | - | - | - | - | - | - | not run |`);
    notRun.push(t);
    continue;
  }
  const meta = await readJsonOr(resolve(outDir, t.id, "meta.json"), undefined);
  const ok = obs.filter((o) => o.response.status >= 200 && o.response.status < 300).length;
  const sent = obs.length + (r.failures?.length ?? 0);
  if (month !== undefined && ok === 0) {
    const statuses = {};
    for (const o of obs) statuses[o.response.status] = (statuses[o.response.status] ?? 0) + 1;
    dropped.push({ target: t, sent, statuses });
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
  totals.apis++;
  if (counts.body > 0) totals.withBody++;
  if (counts.hard > 0) totals.withHard++;
  for (const k of Object.keys(counts)) totals[k] += counts[k];
  const note = reviewerNote(t, meta);
  lines.push(
    `| ${t.name} | [spec](${t.spec}) | ${r.coverage.operations} | ${sent} | ${ok} | ${counts.body} | ${counts.hard} | ${counts.media} | ${counts.errors} | ${counts.server} | ${counts.input} | ${note} |`,
  );
  await writeFile(
    resolve(resDir, `${t.id}.findings.json`),
    `${JSON.stringify(findings, null, 2)}\n`,
  );
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
  await writeFile(
    resolve(resDir, `${t.id}.observations.json`),
    `${JSON.stringify(trimmed, null, 2)}\n`,
  );
  const specFormat =
    meta?.specFormat ?? t.specFormat ?? (SWAGGER2.has(t.id) ? "swagger-2.0" : "openapi-3");
  summaryRows.push({
    id: t.id,
    name: t.name,
    spec: t.spec,
    baseUrl: t.baseUrl,
    specFormat,
    operations: r.coverage.operations,
    sent,
    ok,
    observed: r.coverage.observed,
    counts,
    note,
    ranAt: trimmed[0]?.capturedAt ?? null,
  });
  details.push({
    target: t,
    ok,
    sent,
    counts,
    firstHard: findings.find((f) => f.strict),
    otherHardIds: [...new Set(findings.filter((f) => f.strict).map((f) => f.id))],
  });
}
lines.push("");
lines.push(
  `**${totals.withBody} of ${totals.apis} APIs** returned at least one successful response whose body does not match their own spec. Strict count, hard violations only: **${totals.withHard} of ${totals.apis}**, ${totals.hard} distinct schema locations. Totals: ${totals.body} body, ${totals.media} media, ${totals.errors} error-documentation, ${totals.server} server, ${totals.input} input.`,
);
if (dropped.length > 0) {
  lines.push("");
  lines.push(
    `Dropped for lack of any successful response (usually an API that needs credentials after all): ${dropped.map((d) => `${d.target.id} (${JSON.stringify(d.statuses)})`).join(", ")}.`,
  );
}
lines.push("");
lines.push(
  "Method: one GET request per operation, values from the spec's own examples or a small hand-written set, a delay between requests, a named User-Agent, and no credentials. Operations that needed values we could not supply were skipped. Each row's findings file in this directory lists every finding with the fix the engine suggests for the spec and for the implementation, and the observations file lists every request sent and the status it got.",
);
await writeFile(resolve(resDir, "summary.md"), `${lines.join("\n")}\n`);
const generatedAt = new Date().toISOString();
await writeFile(
  resolve(resDir, "summary.json"),
  `${JSON.stringify(
    { generatedAt, ...(month === undefined ? {} : { month }), totals, apis: summaryRows },
    null,
    2,
  )}\n`,
);
console.log(lines.join("\n"));

if (month !== undefined) {
  await writeFile(resolve(resDir, "targets.json"), `${JSON.stringify(targets, null, 2)}\n`);
  await recordSurveyed();
  if (!opts["skip-post"]) await writeDraftPost();
  await writePrBody();
}

async function recordSurveyed() {
  const path = resolve(here, "surveyed.json");
  const surveyed = await readJsonOr(path, {});
  for (const t of targets) {
    for (const key of [t.id, t.apisGuruId]) {
      if (typeof key === "string" && surveyed[key] === undefined) surveyed[key] = month;
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(surveyed).sort((a, b) => a[0].localeCompare(b[0])),
  );
  await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** Plain prose for MDX: no expressions, no JSX, no emphasis from third-party text. */
function mdxText(s) {
  return String(s)
    .replace(/\r?\n+/g, " ")
    .replace(/[\\{}<>`*_[\]]/g, (c) => `\\${c}`);
}

/** A code span for MDX; backticks inside are neutralized. */
function mdxCode(s) {
  return `\`${String(s)
    .replace(/\r?\n+/g, " ")
    .replace(/`/g, "'")}\``;
}

function clip(s, max) {
  const t = String(s);
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
}

function yamlString(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function topFindings() {
  const ranked = [...details].sort(
    (a, b) => b.counts.hard - a.counts.hard || a.target.id.localeCompare(b.target.id),
  );
  const out = [];
  for (const d of ranked) {
    const name = mdxText(d.target.name);
    if (d.firstHard === undefined) {
      out.push(
        `**${name}** returned ${d.ok} successful responses in ${d.sent} requests and no hard violations.`,
      );
      continue;
    }
    const f = d.firstHard;
    const where = f.location.subject === undefined ? "a response" : mdxCode(f.location.subject);
    const sentence = [
      `**${name}**, ${d.counts.hard} hard violation${d.counts.hard === 1 ? "" : "s"} in ${d.ok} successful responses.`,
      `First one: ${where}, ${mdxText(clip(f.message, 240))}.`,
      `If the spec is right: ${mdxText(clip(f.fix.implementation, 200))}`,
      `If the implementation is right: ${mdxText(clip(f.fix.spec, 240))}`,
    ];
    if (d.otherHardIds.length > 1) {
      sentence.push(
        `Other hard finding types: ${d.otherHardIds
          .filter((id) => id !== f.id)
          .map(mdxCode)
          .join(", ")}.`,
      );
    }
    out.push(sentence.join(" "));
  }
  return out.join("\n\n");
}

function reviewerNotes() {
  const items = [
    "TODO: verify the first hard finding of each API by hand with the curl command on its page; remove any API where the validator was wrong (delete its entry from `tools/survey/results/MONTH/targets.json`, its two JSON files, and its row in `summary.json`).".replace(
      "MONTH",
      month,
    ),
    "TODO: for each API that stays, replace the automated reviewer note in `summary.json` with what you confirmed.",
    "TODO: rewrite the headline and the title if the numbers changed, then set `draft: false` and delete this section.",
  ];
  if (dropped.length > 0) {
    items.push(
      `Dropped before the table because no request succeeded (status counts in brackets): ${dropped.map((d) => `${mdxCode(d.target.id)} ${mdxText(JSON.stringify(d.statuses))}`).join(", ")}.`,
    );
  }
  if (notRun.length > 0) {
    items.push(
      `Not run (spec fetch, conversion or planning failed): ${notRun.map((t) => mdxCode(t.id)).join(", ")}.`,
    );
  }
  return items.map((i) => `- ${i}`).join("\n");
}

async function writeDraftPost() {
  const postPath = resolve(
    root,
    "apps/web/src/content/research",
    `public-api-spec-drift-${month}.mdx`,
  );
  const existing = await readFile(postPath, "utf8").catch(() => undefined);
  if (existing !== undefined && !/^draft:\s*true\s*$/m.test(existing)) {
    console.error(`[report] ${postPath} exists and is not a draft; leaving it alone`);
    return;
  }
  const template = await readFile(resolve(here, "post-template.mdx"), "utf8");
  const sent = summaryRows.reduce((n, a) => n + a.sent, 0);
  const ok = summaryRows.reduce((n, a) => n + a.ok, 0);
  const vars = {
    MONTH: month,
    DATE: generatedAt.slice(0, 10),
    APIS: String(totals.apis),
    SENT: String(sent),
    OK: String(ok),
    WITH_HARD: String(totals.withHard),
    HARD_LOCATIONS: String(totals.hard),
    TITLE: yamlString(
      `We checked ${totals.apis} public APIs against their own OpenAPI specs. ${totals.withHard} had hard mismatches.`,
    ),
    SHORT_TITLE: yamlString(
      // Under 56 characters so the browser title stays under 70 with the site suffix.
      `${totals.apis} public APIs vs their specs: ${totals.withHard} drifted (${month})`,
    ),
    DESCRIPTION: yamlString(
      `Read-only survey, ${month}: ${totals.apis} public APIs from the apis.guru directory checked against their own OpenAPI specs. ${totals.withHard} had hard mismatches, all reproducible.`,
    ),
    TOP_FINDINGS: topFindings(),
    REVIEWER_NOTES: reviewerNotes(),
  };
  const text = template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
    if (vars[key] === undefined) throw new Error(`post-template.mdx: unknown placeholder ${m}`);
    return vars[key];
  });
  await writeFile(postPath, text);
  console.error(`[report] wrote draft post ${postPath}`);
}

async function writePrBody() {
  const ranked = [...details].sort(
    (a, b) => b.counts.hard - a.counts.hard || a.target.id.localeCompare(b.target.id),
  );
  const body = [
    `Automated public API spec drift survey for ${month}. Draft post: \`apps/web/src/content/research/public-api-spec-drift-${month}.mdx\` (\`draft: true\`, not built). Data: \`tools/survey/results/${month}/\`.`,
    "",
    `**${totals.withHard} of ${totals.apis} APIs** had at least one hard violation on a successful response, ${totals.hard} distinct schema locations; ${dropped.length} dropped with no successful response, ${notRun.length} not run.`,
    "",
    "## Review checklist",
    "",
    "- [ ] Verify the first hard finding of each API by hand (the `curl` on each per-API page reproduces it). Tick the API below when confirmed.",
    ...ranked.map(
      (d) =>
        `  - [ ] ${d.target.name}: ${d.counts.hard} hard, ${d.ok} of ${d.sent} successful${d.firstHard === undefined ? "" : `; first: \`${d.firstHard.id}\` at \`${d.firstHard.location.subject ?? "?"}\` ${d.firstHard.location.pointer ?? ""}`}`,
    ),
    "- [ ] Remove every API where our validator was wrong: delete its entry from `targets.json` in the results directory, its `.findings.json` and `.observations.json`, and its row in `summary.json` (adjust `totals`). If the engine was wrong, open an issue with the finding.",
    "- [ ] Replace each automated reviewer note in `summary.json` with what you confirmed.",
    "- [ ] Rewrite the headline, title and description in the post if the numbers changed; delete the Reviewer notes section.",
    "- [ ] Set `draft: false` in the post and run `cd apps/web && pnpm build && pnpm verify`.",
    "- [ ] Small projects get a fixing pull request on their spec before this is published.",
    "",
  ];
  if (dropped.length > 0) {
    body.push(
      "## Dropped (no successful response)",
      "",
      ...dropped.map(
        (d) => `- ${d.target.id}: ${d.sent} sent, statuses ${JSON.stringify(d.statuses)}`,
      ),
      "",
    );
  }
  if (notRun.length > 0) {
    body.push("## Not run", "", ...notRun.map((t) => `- ${t.id}: ${t.spec}`), "");
  }
  body.push(
    "Generated by `.github/workflows/research-monthly.yml`; see `tools/survey/README.md` for the pipeline and how to rerun a month locally.",
  );
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "pr-body.md"), `${body.join("\n")}\n`);
}
