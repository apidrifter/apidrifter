// @ts-check
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

const SITE_URL = "https://apidrifter.com";
/**
 * Docs, comparison, agents and drift-index copy were last changed on this date; bump it when
 * they change. Sitemap lastmod must come from content, never from the build clock: the daily
 * watch commits rebuild the site, and a build-time lastmod tells every crawler the whole site
 * changed each day.
 */
const CONTENT_DATE = new Date("2026-11-03T00:00:00Z");

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
    return CONTENT_DATE;
  }
}

/** Dates from the daily spec watch: the newest day, and the last day each watched API changed. */
function changeDates() {
  const dir = resolve("../../tools/watch/changes");
  const latest = new Map();
  let newest;
  try {
    for (const f of readdirSync(dir)) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (!m) continue;
      const day = new Date(m[1]);
      if (!newest || day > newest) newest = day;
      const json = JSON.parse(readFileSync(resolve(dir, f), "utf8"));
      for (const e of json.entries ?? []) {
        const prev = latest.get(e.id);
        if (!prev || day > prev) latest.set(e.id, day);
      }
    }
  } catch {
    // no watch output yet
  }
  return { newest: newest ?? CONTENT_DATE, latest };
}

const POST_DATES = postDates();
const SURVEY_DATE = surveyDate();
/** The framework guides were last reviewed on this date; bump it when their content changes. */
const GUIDES_DATE = new Date("2026-11-03T00:00:00Z");
const CHANGES = changeDates();
const RESEARCH_DATE = new Date(
  Math.max(SURVEY_DATE.getTime(), ...[...POST_DATES.values()].map((d) => d.getTime())),
);
const SITE_DATE = new Date(
  Math.max(
    RESEARCH_DATE.getTime(),
    GUIDES_DATE.getTime(),
    CONTENT_DATE.getTime(),
    CHANGES.newest.getTime(),
  ),
);

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
            lastmod: SITE_DATE.toISOString(),
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
          const d = POST_DATES.get(research[1]) ?? SURVEY_DATE;
          const lastmod = new Date(Math.max(d.getTime(), SURVEY_DATE.getTime()));
          return { ...item, lastmod: lastmod.toISOString(), changefreq: "monthly", priority: 0.9 };
        }
        if (path === "/research/") {
          return {
            ...item,
            lastmod: RESEARCH_DATE.toISOString(),
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
            lastmod: CONTENT_DATE.toISOString(),
            changefreq: "monthly",
            priority: 0.7,
          };
        }
        const change = path.match(/^\/changes\/(?:([^/]+)\/)?$/);
        if (change) {
          const d = change[1] ? (CHANGES.latest.get(change[1]) ?? CONTENT_DATE) : CHANGES.newest;
          return { ...item, lastmod: d.toISOString(), changefreq: "daily", priority: 0.6 };
        }
        if (path.startsWith("/docs/")) {
          return {
            ...item,
            lastmod: CONTENT_DATE.toISOString(),
            changefreq: "monthly",
            priority: 0.6,
          };
        }
        return {
          ...item,
          lastmod: CONTENT_DATE.toISOString(),
          changefreq: "monthly",
          priority: 0.5,
        };
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
