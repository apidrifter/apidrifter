import { getCollection, getEntry } from "astro:content";
import type { APIRoute } from "astro";
import { postBodyMarkdown } from "../lib/markdown";
import { DOC_PAGES, isoDate, SITE } from "../lib/site";
import { loadSummary } from "../lib/survey";

/**
 * Everything an agent needs in one Markdown file: what the tool is, the commands, the
 * research posts in full with their data tables, a summary per surveyed API, and the CLI
 * reference. Third-party strings appear only inside table cells and code spans.
 */
export const GET: APIRoute = async () => {
  const posts = (await getCollection("research", (p) => !p.data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  const summary = await loadSummary();
  const cli = await getEntry("docs", "cli");
  const out: string[] = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.tagline} ${SITE.description}`,
    "",
    `Canonical site: ${SITE.url}/. Open source (Apache-2.0). CLI package: \`apidrifter\` on npm (${SITE.npm}). Engine package: \`@apidrifter/core\`. Repository: ${SITE.repo}`,
    "",
    "This file is the full-text companion to /llms.txt. Every research page also has a Markdown twin at the same path plus `index.md`.",
    "",
    "## What API drift is",
    "",
    "API drift is the gap between what an API's published OpenAPI document says and what the live implementation does. It breaks generated clients, typed SDKs, mocks and contract tests. It appears when a spec is hand-maintained separately from the code, or generated once and edited afterwards. Three forms: the spec is ahead of the implementation; the implementation is ahead of the spec; both drifted from an older shared version.",
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
    "## Pages",
    "",
    ...DOC_PAGES.map((d) => `- ${SITE.url}/docs/${d.id}/ : ${d.title}. ${d.description}`),
    ...posts.map((p) => `- ${SITE.url}/research/${p.id}/ : ${p.data.title}`),
    "",
  ];

  for (const p of posts) {
    const url = `${SITE.url}/research/${p.id}/`;
    out.push(
      `# Research: ${p.data.title}`,
      "",
      `Published ${isoDate(p.data.date)} by ${SITE.name}. Canonical: ${url}. Markdown: ${url}index.md`,
      "",
      postBodyMarkdown(p.body ?? "", summary, url),
      "",
    );
    if (p.data.survey) {
      out.push("## Per-API summaries", "");
      for (const a of summary.apis) {
        out.push(
          `### ${a.name}`,
          "",
          `- Page: ${url}${a.id}/ (Markdown: ${url}${a.id}/index.md)`,
          `- Spec: ${a.spec}`,
          `- ${a.operations} operations in spec, ${a.sent} requests sent, ${a.ok} successful; hard violations: ${a.counts.hard}; other body findings: ${a.counts.body - a.counts.hard < 0 ? 0 : a.counts.body}; undocumented error statuses: ${a.counts.errors}`,
          `- Reviewer note: ${a.note.replace(/\r?\n/g, " ")}`,
          "",
        );
      }
    }
  }

  if (cli !== undefined && cli.body !== undefined) {
    out.push(`# CLI reference (${SITE.url}/docs/cli/)`, "", cli.body.trim(), "");
  }

  return new Response(out.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
