import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
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
    "Open source (Apache-2.0). CLI package: `apidrifter` on npm. Engine package: `@apidrifter/core`.",
    `Repository: ${SITE.repo}`,
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
    "## Docs",
    "",
    ...DOC_PAGES.map((d) => `- [${d.title}](${SITE.url}/docs/${d.id}/): ${d.description}`),
    "",
    "## Research",
    "",
    ...posts.map(
      (p) => `- [${p.data.title}](${SITE.url}/research/${p.id}/): ${p.data.description}`,
    ),
    "",
    `Survey data: ${summary.totals.withHard} of ${summary.totals.apis} surveyed public APIs had hard spec violations on successful responses (${summary.totals.hard} distinct schema locations). Per-API pages: ${SITE.url}/research/<post>/<api-id>/. Raw JSON: ${SITE.resultsUrl}`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
