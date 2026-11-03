import type { Change, DiffResult, Severity } from "../types.js";
import { type FooterOptions, renderFooter } from "./footer.js";
import { formatLocation } from "./location.js";

const ORDER: Severity[] = ["breaking", "warning", "info"];
const HEADINGS: Record<Severity, string> = {
  breaking: "Breaking",
  warning: "Warnings",
  info: "Info",
};

/** Escape text for safe inclusion in Markdown. Third-party strings never render as markup. */
function esc(s: string): string {
  // Only characters that can open inline markup or HTML. Punctuation that matters solely at
  // line start (lists, headings) is left alone because our text never starts a line.
  return s.replace(/[\\`*_[\]<>]/g, "\\$&");
}

export interface MarkdownOptions {
  title?: string;
  /** Attribution footer. On by default; pass `false` to omit it. */
  footer?: FooterOptions;
}

export function renderMarkdown(result: DiffResult, options: MarkdownOptions = {}): string {
  const lines: string[] = [];
  const title = options.title ?? `${result.kind === "openapi" ? "API" : "MCP server"} changes`;
  lines.push(`## ${esc(title)}`);
  lines.push("");
  const s = result.summary;
  lines.push(
    `${s.breaking} breaking, ${s.warning} warning, ${s.info} info${s.suppressed > 0 ? `, ${s.suppressed} suppressed` : ""}.`,
  );
  const from = describe(result.before.title, result.before.version);
  const to = describe(result.after.title, result.after.version);
  if (from !== "" || to !== "")
    lines.push(`From ${esc(from || "unknown")} to ${esc(to || "unknown")}.`);
  lines.push("");
  for (const severity of ORDER) {
    const group = result.changes.filter((c) => c.severity === severity);
    if (group.length === 0) continue;
    lines.push(`### ${HEADINGS[severity]} (${group.length})`);
    lines.push("");
    for (const c of group) lines.push(renderChange(c));
    lines.push("");
  }
  if (result.changes.length === 0) lines.push("No changes.");
  return `${lines.join("\n").trimEnd()}\n${renderFooter(options.footer)}`;
}

function describe(title: string | undefined, version: string | undefined): string {
  return [title, version].filter((x): x is string => x !== undefined && x !== "").join(" ");
}

function renderChange(c: Change): string {
  return `- \`${c.id}\` at \`${formatLocation(c.location).replace(/`/g, "'")}\`: ${esc(c.message)}`;
}
