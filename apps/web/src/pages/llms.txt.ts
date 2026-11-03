import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { COMPARISONS } from "../lib/compare";
import { GUIDES } from "../lib/guides";
import { DOC_PAGES, SITE } from "../lib/site";
import { loadSummary } from "../lib/survey";

export const GET: APIRoute = async () => {
  const posts = (await getCollection("research", (p) => !p.data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  const summary = await loadSummary();
  const lines: string[] = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.tagline} ${SITE.description}`,
    "",
    `Open source (Apache-2.0). CLI package: \`apidrifter\` on npm (${SITE.npm}). Engine package: \`@apidrifter/core\`.`,
    `Repository: ${SITE.repo}`,
    `Full text of this site in one Markdown file: ${SITE.url}/llms-full.txt`,
    "",
    "## Commands",
    "",
    "- `npx apidrifter plan openapi.yaml`: turn a spec into a request plan with the values an agent or a person must fill in.",
    "- `npx apidrifter run openapi.yaml --base-url http://localhost:3000`: execute the plan against a live server and verify every response; each finding carries a fix for the spec and a fix for the implementation.",
    "- `npx apidrifter verify openapi.yaml --observations recorded.json`: verify from recorded request/response pairs.",
    "- `npx apidrifter breaking old.yaml new.yaml`: diff two spec versions, exit 1 on breaking changes.",
    "- `npx apidrifter mcp snapshot <url>` and `npx apidrifter mcp diff <snapshot> <url>`: snapshot and diff MCP servers, including tool description changes.",
    "- `npx apidrifter serve`: run the same capabilities as an MCP server over stdio.",
    "",
    "## For coding agents",
    "",
    `- [apidrifter for coding agents](${SITE.url}/agents/): install the MCP server in Claude Code (\`claude mcp add apidrifter -- npx -y apidrifter serve\`), Cursor, Codex or any MCP client, with the tool list and a CLAUDE.md / AGENTS.md snippet.`,
    "",
    "## Guides",
    "",
    `- [Guides](${SITE.url}/guides/): verify an app against its OpenAPI spec, one guide per framework, each with a runnable example under ${SITE.repo}/tree/main/examples.`,
    ...GUIDES.map(
      (g) =>
        `- [${g.title}](${SITE.url}/guides/${g.id}/): ${g.oneLine} Markdown twin: ${SITE.url}/guides/${g.id}/index.md`,
    ),
    "",
    "## Docs",
    "",
    ...DOC_PAGES.map((d) => `- [${d.title}](${SITE.url}/docs/${d.id}/): ${d.description}`),
    "",
    "## Comparisons",
    "",
    `- [Compare](${SITE.url}/compare/): honest feature tables against other tools.`,
    ...COMPARISONS.map((c) => `- [${c.title}](${SITE.url}/compare/${c.id}/): ${c.oneLine}`),
    "",
    "## Research",
    "",
    ...posts.map(
      (p) =>
        `- [${p.data.title}](${SITE.url}/research/${p.id}/): ${p.data.description} Markdown twin: ${SITE.url}/research/${p.id}/index.md`,
    ),
    "",
    `- [Public API drift index](${SITE.url}/drift-index/): the surveyed APIs ranked by hard spec violations, with method and status per API; updated monthly. Markdown twin: ${SITE.url}/drift-index/index.md`,
    "",
    `Survey data: ${summary.totals.withHard} of ${summary.totals.apis} surveyed public APIs had hard spec violations on successful responses (${summary.totals.hard} distinct schema locations). Per-API pages: ${SITE.url}/research/<post>/<api-id>/ with Markdown twins at .../index.md. Raw JSON: ${SITE.resultsUrl}`,
    "",
    "## Optional",
    "",
    `- [Full text](${SITE.url}/llms-full.txt): all research posts, per-API summaries and the CLI reference in one file.`,
    `- [RSS](${SITE.url}/research/rss.xml): new research posts.`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
