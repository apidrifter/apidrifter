#!/usr/bin/env node
/**
 * Post today's breaking changes to X, one tweet per API, at most 5 per run.
 *
 * Reads tools/watch/changes/<date>.json and `state/posted.json` (which keys the posts
 * already made by `<date>/<id>` so a rerun never double-posts). Posting uses X API v2
 * `POST /2/tweets` with OAuth 1.0a user context, signed here with node:crypto.
 *
 * Secrets: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET. When any is missing,
 * or with --dry-run, the script prints what it would post and exits 0.
 *
 * Usage: node post.mjs --state <dir> [--date YYYY-MM-DD] [--dry-run]
 */
import { createHmac, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CHANGES_DIR,
  clip,
  isValidDate,
  isValidId,
  parseArgs,
  readJson,
  SITE,
  utcDate,
} from "./lib.mjs";

const MAX_POSTS = 5;
const TWEET_LIMIT = 280;
const URL_WEIGHT = 23; // every URL counts as 23 characters on X
const ENDPOINT = "https://api.x.com/2/tweets";

const args = parseArgs(process.argv.slice(2), {
  state: "string",
  date: "string",
  "dry-run": "boolean",
});
if (args.state === undefined) {
  console.error("usage: node post.mjs --state <dir> [--date YYYY-MM-DD] [--dry-run]");
  process.exit(2);
}
const date = args.date ?? utcDate();
if (!isValidDate(date)) {
  console.error(`bad --date ${args.date}`);
  process.exit(2);
}

const creds = {
  key: process.env.X_API_KEY,
  secret: process.env.X_API_SECRET,
  token: process.env.X_ACCESS_TOKEN,
  tokenSecret: process.env.X_ACCESS_SECRET,
};
const live =
  !args["dry-run"] && Object.values(creds).every((v) => typeof v === "string" && v.length > 0);
if (!live)
  console.error("dry run: X credentials absent or --dry-run given; nothing will be posted");

const day = await readJson(resolve(CHANGES_DIR, `${date}.json`));
if (day === undefined || !Array.isArray(day.entries)) {
  console.error(`no change file for ${date}; nothing to post`);
  process.exit(0);
}
const postedPath = resolve(args.state, "posted.json");
const posted = (await readJson(postedPath)) ?? {};

const candidates = day.entries
  .filter(
    (e) => isValidId(e.id) && e.summary?.breaking > 0 && posted[`${date}/${e.id}`] === undefined,
  )
  .sort((a, b) => b.summary.breaking - a.summary.breaking || a.id.localeCompare(b.id))
  .slice(0, MAX_POSTS);
if (candidates.length === 0) {
  console.error(`nothing new to post for ${date}`);
  process.exit(0);
}

let failures = 0;
for (const e of candidates) {
  const text = compose(e);
  if (!live) {
    console.log(`--- would post (${e.id}, ${text.length} chars) ---\n${text}`);
    continue;
  }
  try {
    const id = await postTweet(text);
    posted[`${date}/${e.id}`] = { postedAt: new Date().toISOString(), tweetId: id };
    await writeFile(postedPath, `${JSON.stringify(posted, null, 2)}\n`);
    console.error(`[${e.id}] posted tweet ${id}`);
  } catch (err) {
    failures++;
    console.error(`[${e.id}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}
process.exit(failures > 0 ? 1 : 0);

function compose(e) {
  const url = `${SITE}/changes/${e.id}/`;
  const name = clip(e.name, 60);
  const first = e.changes.find((c) => c.severity === "breaking");
  const n = e.summary.breaking;
  const m = e.summary.warning;
  const what = /\bAPI\b/.test(name) ? `${name} spec` : `${name} API spec`;
  const head = `${what} changed: ${n} breaking, ${m} warning${m === 1 ? "" : "s"}. Top: `;
  const tail = `. Diff and details: ${url} #openapi`;
  const tailWeight = tail.length - url.length + URL_WEIGHT;
  const budget = TWEET_LIMIT - head.length - tailWeight;
  const top = clip(first?.message ?? "see the page", Math.max(20, budget));
  return `${head}${top}${tail}`;
}

/** RFC 3986 percent-encoding as OAuth 1.0a requires it. */
function pct(s) {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Authorization header for a JSON POST: only the oauth_* parameters are signed. */
function oauthHeader(method, url) {
  const params = {
    oauth_consumer_key: creds.key,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.token,
    oauth_version: "1.0",
  };
  const normalized = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join("&");
  const base = `${method.toUpperCase()}&${pct(url)}&${pct(normalized)}`;
  const signingKey = `${pct(creds.secret)}&${pct(creds.tokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(base).digest("base64");
  const all = { ...params, oauth_signature: signature };
  return `OAuth ${Object.keys(all)
    .sort()
    .map((k) => `${pct(k)}="${pct(all[k])}"`)
    .join(", ")}`;
}

async function postTweet(text) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: oauthHeader("POST", ENDPOINT),
      "content-type": "application/json",
      "user-agent": "apidrifter-watch/0.1 (+https://apidrifter.com/changes/)",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  const parsed = JSON.parse(body);
  const id = parsed?.data?.id;
  if (typeof id !== "string") throw new Error(`unexpected response: ${body.slice(0, 300)}`);
  return id;
}
