import type { APIRoute } from "astro";
import { exampleUrl, GUIDES, type Guide, guideSteps } from "../../../lib/guides";
import { SITE } from "../../../lib/site";

export async function getStaticPaths() {
  return GUIDES.map((g) => ({ params: { framework: g.id }, props: { g } }));
}

/** Markdown twin of a framework guide, for agents and anyone who prefers text. */
export const GET: APIRoute = async ({ props }) => {
  const g = props.g as Guide;
  const url = `${SITE.url}/guides/${g.id}/`;
  const steps = guideSteps(g);
  const text = [
    "---",
    `title: "${g.title.replace(/"/g, "'")}"`,
    `description: "${g.description.replace(/"/g, "'")}"`,
    `date: ${g.reviewed}`,
    `author: ${SITE.name}`,
    `canonical: ${url}`,
    `example: ${exampleUrl(g)}`,
    "license: Apache-2.0",
    "---",
    "",
    `# ${g.title}`,
    "",
    `By ${SITE.name}. Canonical: ${url}. Runnable example: ${exampleUrl(g)}`,
    "",
    g.intro,
    "",
    "## Steps",
    "",
    ...steps.map((s, i) => `${i + 1}. **${s.name}.** ${s.text}`),
    "",
    `## Where the ${g.framework} spec comes from`,
    "",
    ...g.specSource.flatMap((p) => [p, ""]),
    "## Start the app",
    "",
    "```sh",
    g.startCommands,
    "```",
    "",
    "## Run apidrifter",
    "",
    "```sh",
    g.runCommands,
    "```",
    "",
    g.runNotes,
    "",
    "## Read the findings and decide which side to fix",
    "",
    "The real report for the example, which has one deliberate mismatch (path separators shown as >):",
    "",
    "```markdown",
    g.findingExcerpt,
    "```",
    "",
    ...g.findingNotes.flatMap((p) => [p, ""]),
    "## Make it automatic",
    "",
    g.automationIntro,
    "",
    "Instructions file (CLAUDE.md, AGENTS.md or equivalent):",
    "",
    "```markdown",
    g.claudeMd,
    "```",
    "",
    "CI job (see .github/workflows/apidrifter.yml in the example for the full file):",
    "",
    "```yaml",
    g.ciSnippet,
    "```",
    "",
    g.automationOutro,
    "",
    "## Frequently asked questions",
    "",
    ...g.faq.flatMap((f) => [`**${f.q}**`, "", f.a, ""]),
    `Last reviewed ${g.reviewed} against apidrifter 0.1.0. CLI reference: ${SITE.url}/docs/cli/. All guides: ${SITE.url}/guides/`,
    "",
  ].join("\n");
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
};
