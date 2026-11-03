import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/** Research posts written for the site. */
const research = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/research" }),
  schema: z.object({
    title: z.string(),
    /** Optional shorter title for the browser tab and search results. */
    shortTitle: z.string().optional(),
    description: z.string(),
    date: z.coerce.date(),
    survey: z.boolean().default(false),
    draft: z.boolean().default(false),
    /** Survey data lives in tools/survey/results/<month>/ instead of tools/survey/results/. */
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
});

/** Repository markdown rendered as documentation pages. Read in place, never copied. */
const DOC_IDS: Record<string, string> = {
  "packages/cli/README.md": "cli",
  "docs/rules.md": "rules",
  "docs/DESIGN.md": "design",
  /** Optional: rendered at /agents/ when present, with a built-in fallback otherwise. */
  "docs/agents.md": "agents",
};

const docs = defineCollection({
  loader: glob({
    pattern: Object.keys(DOC_IDS),
    base: "../../",
    generateId: ({ entry }) => DOC_IDS[entry] ?? entry,
  }),
  schema: z.object({}).passthrough(),
});

export const collections = { research, docs };
