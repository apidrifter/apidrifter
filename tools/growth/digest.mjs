#!/usr/bin/env node
// Weekly growth digest. Node 24, no dependencies.
//
// Collects npm downloads, GitHub repo and traffic numbers, MCP registry presence, fresh
// GitHub issues and discussions that complain about spec/implementation drift, and new
// mentions of apidrifter. Renders Markdown. Every section degrades to
// "unavailable: <reason>" so the digest always renders.
//
//   node tools/growth/digest.mjs --dry-run            print to stdout, do not touch state
//   node tools/growth/digest.mjs --out digest.md      write digest, update state file
//
// Options: --state <path> (default tools/growth/state/latest.json), --out <path>,
// --dry-run. GITHUB_TOKEN is optional; traffic and discussions need it.
//
// This script never posts anything anywhere. Reply templates are for a human to paste.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORG = "apidrifter";
const REPO = "apidrifter/apidrifter";
const PACKAGES = ["apidrifter", "@apidrifter/core"];
const USER_AGENT = "apidrifter-growth-digest (+https://apidrifter.com)";
const TIMEOUT_MS = 15_000;
const COMPLAINT_QUERIES = [
  '"openapi" "does not match" response schema',
  '"swagger" "out of date" spec',
  '"openapi spec" "doesn\'t match" implementation',
  '"does not conform" openapi response schema',
];
const COMPLAINT_LIMIT = 15;

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const dryRun = Boolean(args["dry-run"]);
const statePath = path.resolve(args.state ?? path.join(here, "state", "latest.json"));
const outPath = args.out ? path.resolve(args.out) : null;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const now = new Date();
const sinceDate = isoDate(new Date(now.getTime() - 7 * 86_400_000));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// ISO 8601 week, e.g. 2026-W45.
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function getJson(url, { headers = {}, method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    body,
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const detail = json?.message ? `: ${json.message}` : "";
    const err = new Error(`HTTP ${res.status}${detail}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function ghHeaders() {
  const h = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

async function gh(pathname, params) {
  const url = new URL(`https://api.github.com${pathname}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  return getJson(url, { headers: ghHeaders() });
}

async function ghGraphql(query, variables) {
  if (!token) throw new Error("needs GITHUB_TOKEN");
  const json = await getJson("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...ghHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (json?.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

// Runs a collector and turns any throw into { error }.
async function section(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ---------------------------------------------------------------------------
// Collectors

async function collectNpm() {
  const out = {};
  for (const pkg of PACKAGES) {
    const [week, month] = await Promise.all([
      getJson(`https://api.npmjs.org/downloads/point/last-week/${pkg}`),
      getJson(`https://api.npmjs.org/downloads/point/last-month/${pkg}`),
    ]);
    out[pkg] = { week: week.downloads ?? 0, month: month.downloads ?? 0 };
  }
  return out;
}

async function collectRepo() {
  const r = await gh(`/repos/${REPO}`);
  return {
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    openIssues: r.open_issues_count ?? 0,
    watchers: r.subscribers_count ?? 0,
  };
}

async function collectTraffic() {
  if (!token) throw new Error("needs GITHUB_TOKEN with push access");
  const [views, clones, referrers, paths] = await Promise.all([
    gh(`/repos/${REPO}/traffic/views`),
    gh(`/repos/${REPO}/traffic/clones`),
    gh(`/repos/${REPO}/traffic/popular/referrers`),
    gh(`/repos/${REPO}/traffic/popular/paths`),
  ]);
  return {
    views: views.count ?? 0,
    viewUniques: views.uniques ?? 0,
    clones: clones.count ?? 0,
    cloneUniques: clones.uniques ?? 0,
    referrers: (referrers ?? []).map((r) => ({
      referrer: r.referrer,
      count: r.count,
      uniques: r.uniques,
    })),
    paths: (paths ?? []).map((p) => ({ path: p.path, count: p.count, uniques: p.uniques })),
  };
}

async function collectRegistry() {
  const urls = [
    "https://registry.modelcontextprotocol.io/v0.1/servers?search=apidrifter",
    "https://registry.modelcontextprotocol.io/v0/servers?search=apidrifter",
  ];
  let lastError = null;
  for (const url of urls) {
    try {
      const json = await getJson(url);
      const servers = Array.isArray(json?.servers) ? json.servers : [];
      const names = servers
        .map((s) => s?.server?.name ?? s?.name ?? "")
        .filter((n) => typeof n === "string" && n.length > 0);
      return { listed: names.length > 0, names, endpoint: url };
    } catch (err) {
      lastError = err;
      if (err?.status && err.status !== 404) break;
    }
  }
  if (lastError?.status === 404) return { listed: false, names: [], endpoint: "none (404)" };
  throw lastError ?? new Error("no registry endpoint answered");
}

function issueFromSearch(item) {
  return {
    title: item.title ?? "",
    url: item.html_url ?? "",
    repo: (item.repository_url ?? "").replace("https://api.github.com/repos/", ""),
    reactions: item.reactions?.total_count ?? 0,
    comments: item.comments ?? 0,
    updated: (item.updated_at ?? "").slice(0, 10),
    kind: item.pull_request ? "pr" : "issue",
  };
}

async function collectComplaints() {
  const seen = new Map();
  for (const q of COMPLAINT_QUERIES) {
    const query = `${q} is:issue -org:${ORG} updated:>=${sinceDate}`;
    const json = await gh("/search/issues", {
      q: query,
      sort: "reactions",
      order: "desc",
      per_page: 20,
    });
    for (const item of json.items ?? []) {
      const entry = issueFromSearch(item);
      if (!entry.url || seen.has(entry.url)) continue;
      seen.set(entry.url, { ...entry, query: q });
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.reactions - a.reactions || b.comments - a.comments)
    .slice(0, COMPLAINT_LIMIT);
}

async function collectDiscussions() {
  const seen = new Map();
  const query = `
    query ($q: String!) {
      search(query: $q, type: DISCUSSION, first: 10) {
        nodes {
          ... on Discussion {
            title
            url
            updatedAt
            upvoteCount
            repository { nameWithOwner }
            reactions { totalCount }
          }
        }
      }
    }`;
  for (const q of COMPLAINT_QUERIES) {
    const data = await ghGraphql(query, { q: `${q} -org:${ORG} updated:>=${sinceDate}` });
    for (const d of data?.search?.nodes ?? []) {
      if (!d?.url || seen.has(d.url)) continue;
      seen.set(d.url, {
        title: d.title,
        url: d.url,
        repo: d.repository?.nameWithOwner ?? "",
        reactions: (d.reactions?.totalCount ?? 0) + (d.upvoteCount ?? 0),
        updated: (d.updatedAt ?? "").slice(0, 10),
        query: q,
      });
    }
  }
  return [...seen.values()].sort((a, b) => b.reactions - a.reactions).slice(0, COMPLAINT_LIMIT);
}

async function collectMentions() {
  const repos = await gh("/search/repositories", {
    q: `apidrifter in:name,description,readme -org:${ORG} pushed:>=${sinceDate}`,
    sort: "updated",
    order: "desc",
    per_page: 20,
  });
  const issues = await gh("/search/issues", {
    q: `"apidrifter" -org:${ORG} updated:>=${sinceDate}`,
    sort: "updated",
    order: "desc",
    per_page: 20,
  });
  return {
    repos: (repos.items ?? []).map((r) => ({
      name: r.full_name,
      url: r.html_url,
      stars: r.stargazers_count ?? 0,
      description: r.description ?? "",
    })),
    issues: (issues.items ?? []).map(issueFromSearch),
  };
}

// ---------------------------------------------------------------------------
// Rendering

function delta(current, previous) {
  if (typeof current !== "number") return "";
  if (typeof previous !== "number") return " (no prior data)";
  const d = current - previous;
  if (d === 0) return " (no change)";
  const pct = previous === 0 ? "" : ` / ${d > 0 ? "+" : ""}${Math.round((d / previous) * 100)}%`;
  return ` (${d > 0 ? "+" : ""}${d}${pct})`;
}

function unavailable(reason) {
  return `unavailable: ${reason}`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

// Never auto-posted. A human pastes it after reading the thread, with the spec file and base
// URL from that thread filled in.
const REPLY_TEMPLATE =
  "If the spec is reachable, `npx apidrifter run <openapi.yaml> --base-url <http://localhost:3000>` " +
  "lists each response field that differs from the schema with a fix for the spec and one for " +
  "the implementation, so the thread can settle which side is wrong.";

function renderComplaints(result, label) {
  if (!result.ok) return `${label}: ${unavailable(result.error)}\n`;
  const items = result.value;
  if (items.length === 0) return `${label}: none found in the last 7 days.\n`;
  const lines = [
    `${label}: ${items.length} thread${items.length === 1 ? "" : "s"} updated since ${sinceDate}, sorted by reactions.\n`,
    "| Reactions | Updated | Repo | Thread | Matched query |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const it of items) {
    lines.push(
      `| ${it.reactions} | ${it.updated} | ${esc(it.repo)} | [${esc(it.title)}](${it.url}) | \`${esc(it.query)}\` |`,
    );
  }
  lines.push(
    "",
    "Suggested reply, one line, paste by hand only after reading the thread and only where it answers the question:",
    "",
    `> ${REPLY_TEMPLATE}`,
  );
  return `${lines.join("\n")}\n`;
}

function render({ week, npm, repo, traffic, registry, complaints, discussions, mentions, prev }) {
  const out = [];
  out.push(`# Growth digest ${week}`, "");
  out.push(
    `Generated ${now.toISOString()} by \`tools/growth/digest.mjs\`. Nothing here is posted automatically; the reply templates are for a human.`,
    "",
  );

  // npm
  out.push("## npm downloads", "");
  if (npm.ok) {
    out.push("| Package | Last 7 days | Last 30 days |", "| --- | --- | --- |");
    for (const pkg of PACKAGES) {
      const cur = npm.value[pkg];
      const old = prev?.npm?.[pkg];
      out.push(
        `| \`${pkg}\` | ${cur.week}${delta(cur.week, old?.week)} | ${cur.month}${delta(cur.month, old?.month)} |`,
      );
    }
    out.push("", "Watch the trend, not the absolute: CI runs and mirrors inflate counts.");
  } else {
    out.push(unavailable(npm.error));
  }
  out.push("");

  // GitHub repo
  out.push(`## GitHub: ${REPO}`, "");
  if (repo.ok) {
    const r = repo.value;
    const o = prev?.github ?? {};
    out.push(
      `- Stars: ${r.stars}${delta(r.stars, o.stars)}`,
      `- Forks: ${r.forks}${delta(r.forks, o.forks)}`,
      `- Open issues and PRs: ${r.openIssues}${delta(r.openIssues, o.openIssues)}`,
      `- Watchers: ${r.watchers}${delta(r.watchers, o.watchers)}`,
    );
  } else {
    out.push(unavailable(repo.error));
  }
  out.push("");

  // Traffic
  out.push("## Repo traffic, last 14 days", "");
  if (traffic.ok) {
    const t = traffic.value;
    const o = prev?.traffic ?? {};
    out.push(
      `- Views: ${t.views}${delta(t.views, o.views)} (${t.viewUniques} unique)`,
      `- Clones: ${t.clones}${delta(t.clones, o.clones)} (${t.cloneUniques} unique)`,
      "",
    );
    if (t.referrers.length) {
      out.push("Referrers:", "", "| Source | Views | Unique |", "| --- | --- | --- |");
      for (const r of t.referrers) out.push(`| ${esc(r.referrer)} | ${r.count} | ${r.uniques} |`);
    } else {
      out.push("Referrers: none recorded.");
    }
    out.push("");
    if (t.paths.length) {
      out.push("Popular paths:", "", "| Path | Views | Unique |", "| --- | --- | --- |");
      for (const p of t.paths) out.push(`| ${esc(p.path)} | ${p.count} | ${p.uniques} |`);
    } else {
      out.push("Popular paths: none recorded.");
    }
  } else {
    out.push(unavailable(traffic.error));
  }
  out.push("");

  // Registry
  out.push("## MCP Registry", "");
  if (registry.ok) {
    const reg = registry.value;
    if (reg.listed) {
      out.push(`Listed: ${reg.names.map((n) => `\`${n}\``).join(", ")} (via ${reg.endpoint}).`);
    } else {
      out.push(
        `Not listed yet (searched ${reg.endpoint}). Publish steps are in docs/RELEASING.md, after 0.2.0.`,
      );
    }
    const wasListed = prev?.registry?.listed;
    if (typeof wasListed === "boolean" && wasListed !== reg.listed) {
      out.push(`Changed since last week: was ${wasListed ? "listed" : "not listed"}.`);
    }
  } else {
    out.push(unavailable(registry.error));
  }
  out.push("");

  // Complaints
  out.push("## Threads to reply to", "");
  out.push(
    "Fresh GitHub threads where someone hit a spec that does not match an implementation. Reply only when it genuinely helps; never paste the template without reading the thread.",
    "",
  );
  out.push(renderComplaints(complaints, "Issues"));
  out.push(renderComplaints(discussions, "Discussions"));

  // Mentions
  out.push("## Mentions of apidrifter outside the org", "");
  if (mentions.ok) {
    const m = mentions.value;
    if (m.repos.length === 0 && m.issues.length === 0) {
      out.push("None in the last 7 days.");
    }
    if (m.repos.length) {
      out.push("Repositories:", "");
      for (const r of m.repos) {
        out.push(`- [${esc(r.name)}](${r.url}) (${r.stars} stars) ${esc(r.description)}`);
      }
      out.push("");
    }
    if (m.issues.length) {
      out.push("Issues and pull requests:", "");
      for (const i of m.issues) {
        out.push(`- [${esc(i.title)}](${i.url}) in ${esc(i.repo)}, updated ${i.updated}`);
      }
    }
  } else {
    out.push(unavailable(mentions.error));
  }
  out.push("");

  // Checklist
  out.push("## Checklist", "");
  out.push(
    "- [ ] Read the threads above; reply by hand to at most three where the tool actually answers the question.",
    "- [ ] Merge or close the open research PR from `research-monthly.yml` if one exists.",
    "- [ ] Glance at `/changes/` and the last `watch-daily.yml` run for failures.",
    "- [ ] Check Search Console for new queries landing on `/research/` and `/compare/`.",
    "- [ ] If npm or stars moved more than usual, find the referrer and note it in docs/GROWTH.md.",
    "- [ ] Anything to file upstream from docs/outreach/?",
    "",
    `Previous numbers: ${prev?.generatedAt ? `from ${prev.generatedAt}` : "none on record"}; state file \`${path.relative(process.cwd(), statePath)}\`.`,
  );
  return `${out.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Main

async function readState() {
  try {
    const raw = await readFile(statePath, "utf8");
    const json = JSON.parse(raw);
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

async function main() {
  const prev = await readState();
  const week = isoWeek(now);
  const [npm, repo, traffic, registry, complaints, discussions, mentions] = await Promise.all([
    section(collectNpm),
    section(collectRepo),
    section(collectTraffic),
    section(collectRegistry),
    section(collectComplaints),
    section(collectDiscussions),
    section(collectMentions),
  ]);

  const markdown = render({
    week,
    npm,
    repo,
    traffic,
    registry,
    complaints,
    discussions,
    mentions,
    prev,
  });

  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, markdown);
  }
  if (dryRun || !outPath) process.stdout.write(markdown);

  if (!dryRun) {
    // Only overwrite the parts we actually fetched, so one failed section does not erase
    // last week's baseline for it.
    const next = {
      version: 1,
      generatedAt: now.toISOString(),
      week,
      npm: npm.ok ? npm.value : (prev?.npm ?? null),
      github: repo.ok ? repo.value : (prev?.github ?? null),
      traffic: traffic.ok
        ? {
            views: traffic.value.views,
            viewUniques: traffic.value.viewUniques,
            clones: traffic.value.clones,
            cloneUniques: traffic.value.cloneUniques,
          }
        : (prev?.traffic ?? null),
      registry: registry.ok ? { listed: registry.value.listed } : (prev?.registry ?? null),
    };
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`);
  }
}

main().catch((err) => {
  // Even a total failure should leave a readable digest behind.
  const msg = `# Growth digest ${isoWeek(now)}\n\nunavailable: ${err?.message ?? err}\n`;
  process.stdout.write(msg);
  process.exitCode = 1;
});
