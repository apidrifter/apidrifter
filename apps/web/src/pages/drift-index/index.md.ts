import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { driftIndexMarkdown } from "../../lib/markdown";
import { SITE } from "../../lib/site";
import { loadSummary } from "../../lib/survey";

/** Markdown twin of the drift index, for agents and anyone who prefers text. */
export const GET: APIRoute = async () => {
  const summary = await loadSummary();
  const posts = (await getCollection("research", (p) => !p.data.draft && p.data.survey)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  const post = posts[0];
  const postBase =
    post === undefined ? `${SITE.url}/research/` : `${SITE.url}/research/${post.id}/`;
  const url = `${SITE.url}/drift-index/`;
  const generated = summary.generatedAt.slice(0, 10);
  const text = [
    "---",
    'title: "Public API drift index"',
    `description: "${summary.totals.apis} public APIs ranked by how far their live responses drift from their own OpenAPI spec; updated monthly."`,
    `date: ${generated}`,
    `author: ${SITE.name}`,
    `canonical: ${url}`,
    "license: Apache-2.0 (text and data)",
    "---",
    "",
    "# Public API drift index",
    "",
    `By ${SITE.name}. Data generated ${generated}; updates monthly. Canonical: ${url}`,
    "",
    "Public APIs that publish an OpenAPI document, checked read-only against that document and ranked by hard violations: the mismatches a client generated from the spec would break on (wrong type, missing required field, forbidden field, disallowed null, wrong media type). Each API links to a page with every request sent and every finding, with a fix for the spec and a fix for the implementation.",
    "",
    driftIndexMarkdown(summary, postBase),
    "",
    `**${summary.totals.withHard} of ${summary.totals.apis} APIs** had at least one hard violation on a successful response, ${summary.totals.hard} distinct schema locations in total. Counts are distinct schema locations, not raw occurrences. Operations observed is the number of operations we got a response for, out of the operations in the spec.`,
    "",
    "## Methodology",
    "",
    "- Read-only: one GET per operation, values from the spec's own examples or a small hand-written set, a delay between requests, a named User-Agent, one polite retry on 429, a hard request budget. Nothing is created, changed or deleted.",
    "- Unauthenticated: no credentials were sent, so the undocumented-status count in the per-API findings mostly reflects our own unauthenticated requests (401, 403, 429), not drift. It is kept out of this table.",
    "- Hand-reviewed: every hard violation was read by a person before it counted; the note says what was confirmed.",
    "- Status: Drift confirmed = at least one hard violation on a successful response. Clean = successful responses, none with a hard violation; read it with the coverage column. Not verified = nothing sent or nothing succeeded, usually rate limiting.",
    "- A sample, not a rate: these APIs were chosen because they publish a spec. The ranking says which drifted furthest in the operations we could reach, not what fraction of all APIs drift.",
    "- Swagger 2.0 documents were converted to OpenAPI 3 before checking; Swagger 2.0 cannot express null, so some null findings on those rows are a format limitation as much as drift.",
    "",
    "## How to get your API on the index",
    "",
    `Run apidrifter against your public API and its published spec, then open an issue at ${SITE.repo}/issues/new with the report and the spec URL. We rerun it read-only, review the findings by hand, and add the row at the next monthly update. Clean rows are welcome.`,
    "",
    "```sh",
    "npx apidrifter run https://api.example.com/openapi.json --base-url https://api.example.com --format markdown > report.md",
    "```",
    "",
    "## Data",
    "",
    `- Table as data: ${SITE.resultsRaw}/summary.json`,
    `- Per-API findings and observations: ${SITE.resultsUrl}`,
    `- Write-up: ${postBase}`,
    `- Tool: ${SITE.url}/docs/cli/`,
    "",
    "## Cite this",
    "",
    `${SITE.name} (${generated.slice(0, 4)}). Public API drift index. ${url}`,
    "",
  ].join("\n");
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
};
