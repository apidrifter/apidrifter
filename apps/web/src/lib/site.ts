export const SITE = {
  name: "API Drifter",
  handle: "apidrifter",
  url: "https://apidrifter.com",
  repo: "https://github.com/apidrifter/apidrifter",
  resultsUrl: "https://github.com/apidrifter/apidrifter/tree/main/tools/survey/results",
  tagline: "Finds where your API drifted from its spec.",
  description:
    "Open-source CLI and MCP server that runs your OpenAPI spec against a live implementation and tells you which side to fix.",
} as const;

export const DOC_PAGES = [
  { id: "cli", title: "CLI reference", description: "Every command and flag." },
  {
    id: "rules",
    title: "Rules reference",
    description: "Every change rule and finding rule, with default severities.",
  },
  {
    id: "design",
    title: "Design",
    description: "How the engine, CLI and hosted service are built, and why.",
  },
] as const;

/** Format a date as YYYY-MM-DD without timezone surprises. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
