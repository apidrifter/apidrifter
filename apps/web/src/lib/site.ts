export const SITE = {
  name: "API Drifter",
  handle: "apidrifter",
  url: "https://apidrifter.com",
  repo: "https://github.com/apidrifter/apidrifter",
  npm: "https://www.npmjs.com/package/apidrifter",
  resultsUrl: "https://github.com/apidrifter/apidrifter/tree/main/tools/survey/results",
  resultsRaw: "https://raw.githubusercontent.com/apidrifter/apidrifter/main/tools/survey/results",
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  tagline: "Finds where your API drifted from its spec.",
  /** Home page title: the most specific words first, under 60 characters. */
  homeTitle: "API Drifter: find where your API drifted from its spec",
  description:
    "Open-source CLI and MCP server that runs your OpenAPI spec against a live implementation and tells you which side to fix.",
} as const;

export const DOC_PAGES = [
  {
    id: "cli",
    title: "CLI reference",
    description:
      "Every apidrifter command and flag: plan, run and verify a live API against its OpenAPI spec, diff specs and MCP servers, and serve the engine over MCP.",
  },
  {
    id: "rules",
    title: "Rules reference",
    description:
      "Every change rule and verification finding the engine can report, with its stable ID and default severity, so CI config and reports can refer to them.",
  },
  {
    id: "design",
    title: "Design",
    description:
      "How API Drifter is built and why: the pure diff engine, polarity-aware classification, the CLI and MCP server, the hosted service and its security model.",
  },
] as const;

/** Format a date as YYYY-MM-DD without timezone surprises. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
