/**
 * Markdown renderings of site content for agents: the llms-full.txt file and the
 * Markdown twins of research pages. Third-party strings are placed in table cells and
 * code spans only; pipes and backticks inside them are neutralized so they cannot break
 * the table or the span.
 */
import { SITE } from "./site";
import {
  type Finding,
  type FindingRequest,
  formatLocation,
  GROUPS,
  groupFindings,
  type SurveyApi,
  type SurveySummary,
} from "./survey";

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function code(s: string): string {
  return `\`${s.replace(/`/g, "'")}\``;
}

export function surveyTableMarkdown(summary: SurveySummary, base: string): string {
  const lines = [
    "| API | Spec | Ops in spec | GET sent | 2xx | Hard | Body | Media | Errors | Input | Reviewer note |",
    "|-----|------|-------------|----------|-----|------|------|-------|--------|-------|---------------|",
  ];
  for (const a of summary.apis) {
    const fmt = a.specFormat === "swagger-2.0" ? "Swagger 2.0" : "OpenAPI 3";
    lines.push(
      `| [${cell(a.name)}](${base}${a.id}/) | [${fmt}](${a.spec}) | ${a.operations} | ${a.sent} | ${a.ok} | ${a.counts.hard} | ${a.counts.body} | ${a.counts.media} | ${a.counts.errors} | ${a.counts.input} | ${cell(a.note)} |`,
    );
  }
  lines.push("");
  lines.push(
    `**${summary.totals.withHard} of ${summary.totals.apis} APIs** had at least one hard violation on a successful response, across ${summary.totals.hard} distinct schema locations. Data generated ${summary.generatedAt.slice(0, 10)}, source: ${SITE.resultsUrl}`,
  );
  return lines.join("\n");
}

/** Turn an MDX post body into plain Markdown with the survey table inlined. */
export function postBodyMarkdown(body: string, summary: SurveySummary, base: string): string {
  return body
    .split("\n")
    .filter((l) => !/^import\s/.test(l))
    .join("\n")
    .replace(/<SurveyTable\s*\/>/g, surveyTableMarkdown(summary, base))
    .trim();
}

export function requestLine(r: FindingRequest): string {
  const q = Object.entries(r.query ?? {});
  const qs =
    q.length === 0
      ? ""
      : `?${q.map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`).join("&")}`;
  return `${r.method} ${r.path}${qs} -> ${r.status}${r.mediaType ? ` ${r.mediaType}` : ""}`;
}

export function curlFor(baseUrl: string, r: FindingRequest): string {
  const q = Object.entries(r.query ?? {});
  const qs =
    q.length === 0
      ? ""
      : `?${q
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(",") : v)}`,
          )
          .join("&")}`;
  const url = `${baseUrl.replace(/\/$/, "")}${r.path}${qs}`;
  const method = r.method.toUpperCase() === "GET" ? "" : `-X ${r.method.toUpperCase()} `;
  return `curl -s ${method}-H 'Accept: application/json' '${url.replace(/'/g, "%27")}'`;
}

export function findingMarkdown(f: Finding): string {
  const lines = [
    `- ${code(f.id)} (${f.strict ? "hard" : f.class}, ${f.severity}) at ${code(formatLocation(f.location))}`,
  ];
  lines.push(`  - ${cell(f.message)}`);
  if (f.request !== undefined) lines.push(`  - Request: ${code(requestLine(f.request))}`);
  if (f.expected !== undefined)
    lines.push(`  - Expected: ${code(JSON.stringify(f.expected) ?? "")}`);
  if (f.actual !== undefined) lines.push(`  - Actual: ${code(JSON.stringify(f.actual) ?? "")}`);
  lines.push(`  - If the spec is the source of truth: ${cell(f.fix.implementation)}`);
  lines.push(`  - If the implementation is the source of truth: ${cell(f.fix.spec)}`);
  return lines.join("\n");
}

export function apiMarkdown(
  postTitle: string,
  postUrl: string,
  api: SurveyApi,
  findings: Finding[],
  generatedAt: string,
): string {
  const groups = groupFindings(findings);
  const url = `${postUrl}${api.id}/`;
  const hard = (groups.get("hard") ?? [])[0];
  const lines: string[] = [
    "---",
    `title: "${api.name.replace(/"/g, "'")}: spec vs live"`,
    `date: ${(api.ranAt ?? generatedAt).slice(0, 10)}`,
    `canonical: ${url}`,
    `part_of: ${postUrl}`,
    "---",
    "",
    `# ${api.name}: spec vs live`,
    "",
    `Part of [${postTitle}](${postUrl}).`,
    "",
    "## Summary",
    "",
    `- Spec: ${api.spec} (${api.specFormat === "swagger-2.0" ? "Swagger 2.0, converted to OpenAPI 3 before checking" : "OpenAPI 3"})`,
    `- Base URL: ${code(api.baseUrl)}`,
    `- Run: ${(api.ranAt ?? generatedAt).slice(0, 10)}, read-only GET requests, no credentials`,
    `- Coverage: ${api.operations} operations in the spec, ${api.sent} requests sent, ${api.ok} successful, ${api.observed} operations observed`,
    `- Hard violations: ${api.counts.hard} distinct schema locations`,
    `- Reviewer note: ${cell(api.note)}`,
    "",
  ];
  for (const g of GROUPS) {
    const list = groups.get(g.key) ?? [];
    if (list.length === 0) continue;
    lines.push(`## ${g.label} (${list.length})`, "", g.blurb, "");
    for (const f of list) lines.push(findingMarkdown(f));
    lines.push("");
  }
  if (hard?.request !== undefined) {
    lines.push("## Reproduce", "", "```sh", curlFor(api.baseUrl, hard.request), "```", "");
  }
  lines.push(
    "## Data",
    "",
    `- Findings: ${SITE.resultsUrl}/${api.id}.findings.json`,
    `- Requests sent: ${SITE.resultsUrl}/${api.id}.observations.json`,
    `- Tool: ${SITE.url}/docs/cli/ (reproduce with apidrifter run; target definition in tools/survey/targets.json)`,
    "",
  );
  return lines.join("\n");
}
