import { type DiffResult, renderMarkdown, renderText } from "@driftwatch/core";
import { UsageError } from "./errors.js";

export type Format = "json" | "markdown" | "text";
export type Level = "breaking" | "warning" | "info";

export function resolveFormat(raw: string | undefined, isTTY: boolean): Format {
  if (raw === undefined) return isTTY ? "text" : "json";
  if (raw === "json" || raw === "markdown" || raw === "text") return raw;
  throw new UsageError(`--format must be json, markdown or text, got ${raw}`);
}

export function resolveLevel(raw: string | undefined): Level {
  if (raw === undefined) return "breaking";
  if (raw === "breaking" || raw === "warning" || raw === "info") return raw;
  throw new UsageError(`--fail-on must be breaking, warning or info, got ${raw}`);
}

/** Whether a summary has anything at or above the level. */
export function exceeds(
  summary: { breaking: number; warning: number; info: number },
  level: Level,
): boolean {
  if (level === "breaking") return summary.breaking > 0;
  if (level === "warning") return summary.breaking + summary.warning > 0;
  return summary.breaking + summary.warning + summary.info > 0;
}

export function renderDiff(result: DiffResult, format: Format): string {
  if (format === "json") return `${JSON.stringify(result, null, 2)}\n`;
  if (format === "markdown") return renderMarkdown(result);
  return renderText(result);
}

/** Keep only breaking changes and recompute the summary. */
export function breakingOnly(result: DiffResult): DiffResult {
  const changes = result.changes.filter((c) => c.severity === "breaking");
  return {
    ...result,
    changes,
    summary: {
      breaking: changes.length,
      warning: 0,
      info: 0,
      suppressed: result.summary.suppressed,
    },
    hasBreaking: changes.length > 0,
  };
}
