/**
 * The rules reference (docs/rules.md) is a generated file with two Markdown tables. We
 * parse it here so every rule row gets a stable element id, which lets findings link to
 * `/docs/rules/#<rule-id>`. The file is ours (generated from the engine's tables), not
 * third-party text, but it is still rendered through Astro's escaping.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface RuleRow {
  id: string;
  severity: string;
  source: string;
  description: string;
}

export interface RuleSection {
  heading: string;
  anchor: string;
  intro: string[];
  rows: RuleRow[];
}

export interface RulesDoc {
  title: string;
  preamble: string[];
  sections: RuleSection[];
}

const RULES_PATH = resolve(process.cwd(), "../../docs/rules.md");

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unbacktick(s: string): string {
  return s.replace(/^`|`$/g, "").trim();
}

export async function loadRules(): Promise<RulesDoc> {
  const text = await readFile(RULES_PATH, "utf8");
  const doc: RulesDoc = { title: "Rules reference", preamble: [], sections: [] };
  let current: RuleSection | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      doc.title = line.slice(2).trim();
      continue;
    }
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      current = { heading, anchor: slugify(heading), intro: [], rows: [] };
      doc.sections.push(current);
      continue;
    }
    if (line.startsWith("|")) {
      const cells = line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((c) => c.trim());
      if (cells.length < 4) continue;
      if (cells[0] === "ID" || /^-+$/.test(cells[0] ?? "")) continue;
      current?.rows.push({
        id: unbacktick(cells[0] ?? ""),
        severity: cells[1] ?? "",
        source: cells[2] ?? "",
        description: (cells[3] ?? "").replace(/\\\|/g, "|"),
      });
      continue;
    }
    if (line.length === 0) continue;
    if (current === undefined) doc.preamble.push(line);
    else current.intro.push(line);
  }
  return doc;
}
