#!/usr/bin/env node
/**
 * Post-build checks over apps/web/dist: JSON-LD parses on every page, titles and
 * descriptions are within length, exactly one h1, absolute og:image, html lang, images
 * have alt, and the GEO files exist. Exit 1 on any violation.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const problems = [];
let pages = 0;
let jsonldBlocks = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) checkPage(p);
  }
}

function checkPage(file) {
  pages++;
  const rel = file.slice(dist.length);
  const html = readFileSync(file, "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  if (title.length === 0) problems.push(`${rel}: missing title`);
  if (title.length > 70) problems.push(`${rel}: title ${title.length} chars: ${title}`);
  if (desc.length < 50 || desc.length > 160)
    problems.push(`${rel}: description ${desc.length} chars`);
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) problems.push(`${rel}: ${h1} h1 elements`);
  if (!/<html[^>]*\slang="en"/.test(html)) problems.push(`${rel}: missing html lang`);
  const og = html.match(/property="og:image" content="([^"]*)"/)?.[1] ?? "";
  if (!/^https:\/\//.test(og)) problems.push(`${rel}: og:image not absolute`);
  if (!/rel="canonical"/.test(html)) problems.push(`${rel}: missing canonical`);
  for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
    if (!/\balt=/.test(img)) problems.push(`${rel}: img without alt`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    jsonldBlocks++;
    try {
      const parsed = JSON.parse(m[1]);
      const types = parsed["@graph"] ? parsed["@graph"].map((x) => x["@type"]) : [parsed["@type"]];
      if (types.some((t) => t === undefined)) problems.push(`${rel}: JSON-LD item without @type`);
    } catch (err) {
      problems.push(`${rel}: JSON-LD does not parse: ${err.message}`);
    }
  }
  if (
    rel === "/index.html" ||
    /\/research\/.+\/index\.html$/.test(rel) ||
    /\/changes\/.*index\.html$/.test(rel) ||
    /\/docs\/.+\/index\.html$/.test(rel)
  ) {
    if (!html.includes('type="application/ld+json"')) problems.push(`${rel}: no JSON-LD`);
  }
}

walk(dist);
for (const f of [
  "llms.txt",
  "llms-full.txt",
  "robots.txt",
  "sitemap-index.xml",
  "sitemap-0.xml",
  "research/rss.xml",
  "changes/rss.xml",
  "changes/feed.json",
]) {
  if (!existsSync(join(dist, f))) problems.push(`missing ${f}`);
}
const mdTwins = [];
function findMd(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findMd(p);
    else if (name === "index.md") mdTwins.push(p.slice(dist.length));
  }
}
findMd(join(dist, "research"));
const sitemap = existsSync(join(dist, "sitemap-0.xml"))
  ? readFileSync(join(dist, "sitemap-0.xml"), "utf8")
  : "";
const lastmods = (sitemap.match(/<lastmod>/g) ?? []).length;
const urls = (sitemap.match(/<loc>/g) ?? []).length;
if (urls > 0 && lastmods !== urls) problems.push(`sitemap: ${lastmods} lastmod for ${urls} urls`);

console.log(
  `pages: ${pages}, JSON-LD blocks: ${jsonldBlocks}, markdown twins: ${mdTwins.length}, sitemap urls: ${urls} (lastmod ${lastmods})`,
);
if (problems.length > 0) {
  console.log("problems:");
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log("all checks passed");
