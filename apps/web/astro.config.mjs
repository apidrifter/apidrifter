// @ts-check
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

const SITE_URL = "https://apidrifter.com";
const BUILD_TIME = new Date();

/** Research post dates from frontmatter, keyed by slug, for sitemap lastmod. */
function postDates() {
  const dir = resolve("src/content/research");
  const out = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".mdx") && !f.endsWith(".md")) continue;
    const text = readFileSync(resolve(dir, f), "utf8");
    const m = text.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m);
    if (m) out.set(f.replace(/\.(mdx|md)$/, ""), new Date(m[1]));
  }
  return out;
}

/** The survey's generation time, for per-API pages. */
function surveyDate() {
  try {
    const json = JSON.parse(
      readFileSync(resolve("../../tools/survey/results/summary.json"), "utf8"),
    );
    return new Date(json.generatedAt);
  } catch {
    return BUILD_TIME;
  }
}

const POST_DATES = postDates();
const SURVEY_DATE = surveyDate();
/** The framework guides were last reviewed on this date; bump it when their content changes. */
const GUIDES_DATE = new Date("2026-11-03T00:00:00Z");

export default defineConfig({
  site: SITE_URL,
  output: "static",
  trailingSlash: "always",
  integrations: [
    mdx(),
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname;
        const research = path.match(/^\/research\/([^/]+)\/(?:([^/]+)\/)?$/);
        if (path === "/") {
          return {
            ...item,
            lastmod: BUILD_TIME.toISOString(),
            changefreq: "weekly",
            priority: 1.0,
          };
        }
        if (research && research[2] !== undefined) {
          return {
            ...item,
            lastmod: SURVEY_DATE.toISOString(),
            changefreq: "monthly",
            priority: 0.7,
          };
        }
        if (research && research[1] !== undefined) {
          const d = POST_DATES.get(research[1]) ?? BUILD_TIME;
          const lastmod = new Date(Math.max(d.getTime(), SURVEY_DATE.getTime()));
          return { ...item, lastmod: lastmod.toISOString(), changefreq: "monthly", priority: 0.9 };
        }
        if (path === "/research/") {
          return {
            ...item,
            lastmod: BUILD_TIME.toISOString(),
            changefreq: "weekly",
            priority: 0.8,
          };
        }
        if (path === "/drift-index/") {
          return {
            ...item,
            lastmod: SURVEY_DATE.toISOString(),
            changefreq: "monthly",
            priority: 0.8,
          };
        }
        if (path.startsWith("/guides/")) {
          return {
            ...item,
            lastmod: GUIDES_DATE.toISOString(),
            changefreq: "monthly",
            priority: 0.7,
          };
        }
        if (path === "/agents/" || path.startsWith("/compare/")) {
          return {
            ...item,
            lastmod: BUILD_TIME.toISOString(),
            changefreq: "monthly",
            priority: 0.7,
          };
        }
        if (path.startsWith("/docs/")) {
          return {
            ...item,
            lastmod: BUILD_TIME.toISOString(),
            changefreq: "monthly",
            priority: 0.6,
          };
        }
        return { ...item, lastmod: BUILD_TIME.toISOString(), changefreq: "monthly", priority: 0.5 };
      },
    }),
  ],
  // Markdown rendered here comes only from files in this repository. Survey data
  // (third-party strings) goes through components with Astro's default escaping.
  markdown: {
    shikiConfig: { theme: "github-dark-default" },
  },
  build: { format: "directory" },
});
