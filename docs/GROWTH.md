# Growth runbook

How apidrifter gets found, with as little recurring human work as possible. Most of it runs on a schedule; the rest is a one-time checklist and a launch sequence for the research post.

Facts the copy below relies on, all from `tools/survey/results/summary.md`: 13 public APIs, read-only unauthenticated GETs, one request per operation, 9 of 13 returned a successful response with at least one hard violation, 171 distinct schema locations, every finding hand-reviewed, one validator false positive found and fixed during review. It is a sample, not a rate. Do not round any of this up.

## 1. What runs by itself

| Workflow                                 | Schedule                        | Output                                                                                                                               | What a human does                                                            |
| ---------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`               | every push and pull request     | lint, typecheck, build, test                                                                                                         | nothing                                                                      |
| `.github/workflows/release.yml`          | every push to `main`            | "Version packages" PR; npm publish with provenance on merge                                                                          | merge the version PR when a release is wanted (see `docs/RELEASING.md`)      |
| `.github/workflows/growth-digest.yml`    | Monday 07:00 UTC                | one GitHub issue per ISO week labeled `growth` with npm, stars, traffic, registry status, threads worth replying to, and a checklist | glance at it weekly; reply by hand to at most a few threads                  |
| `.github/workflows/research-monthly.yml` | monthly                         | a pull request with a draft research post from a fresh survey run                                                                    | read the draft, check the numbers against the findings files, merge or close |
| `.github/workflows/watch-daily.yml`      | daily                           | spec changes published to `/changes/` on the site and a post on X when something changed                                             | nothing                                                                      |
| `.github/workflows/sync-action.yml`      | on changes to `packages/action` | mirrors the composite action to `apidrifter/action` so `uses: apidrifter/action@v1` works                                            | nothing once `ACTION_SYNC_TOKEN` exists                                      |

The digest never posts outside this repository. The watch workflow is the only thing that posts anywhere public, and it only posts facts the engine produced.

## 2. One-time setup

Do these once, in order. Each step says exactly where to click or what to run.

1. **Make the repository public.** GitHub > `apidrifter/apidrifter` > Settings > General > scroll to "Danger Zone" > Change visibility > Make public. Traffic numbers, the research post links, and every directory below need this.
2. **Let Actions open pull requests.** Settings > Actions > General > "Workflow permissions" > select "Read and write permissions" and tick "Allow GitHub Actions to create and approve pull requests" > Save. `research-monthly.yml` and `release.yml` need it.
3. **Create the action mirror and its token.**
   1. GitHub > New repository > owner `apidrifter`, name `action`, public, no README (the sync workflow writes everything). Create.
   2. GitHub > your avatar > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token. Name `action-sync`. Resource owner: `apidrifter`. Expiration: 1 year (put a reminder in the calendar). Repository access: "Only select repositories" > `apidrifter/action`. Permissions > Repository permissions > Contents: Read and write. Nothing else. Generate and copy.
   3. If the org refuses the token: `apidrifter` org > Settings > Third-party Access > Personal access tokens > allow fine-grained tokens.
   4. `apidrifter/apidrifter` > Settings > Secrets and variables > Actions > New repository secret > name `ACTION_SYNC_TOKEN`, paste. Run `sync-action.yml` once from the Actions tab to seed the mirror.
4. **X developer account and the four secrets.**
   1. Sign in to X as the apidrifter account, open https://developer.x.com and sign up for the free tier (write access is included; read is limited, which the watch workflow does not need).
   2. In the developer portal: Projects & Apps > create a project, then an app inside it.
   3. App > Settings > "User authentication settings" > Set up. App permissions: "Read and write". Type of App: "Web App, Automated App or Bot". Callback URI and Website URL: `https://apidrifter.com/` (the watch workflow never uses the callback; the form requires one). Save.
   4. App > Keys and tokens. Copy "API Key" and "API Key Secret". Then under "Access Token and Secret" click Generate. If it shows "Created with Read permissions", regenerate; it must say "Read and Write".
   5. Repository Settings > Secrets and variables > Actions > add four secrets: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`. The workflow signs requests with OAuth 1.0a user context from these four values.
5. **Google Search Console.**
   1. https://search.google.com/search-console > Add property > "Domain" > `apidrifter.com` > Continue. Copy the TXT record value (`google-site-verification=...`).
   2. Cloudflare dashboard > `apidrifter.com` > DNS > Records > Add record. Type `TXT`, Name `@`, Content: the copied value, TTL Auto. Save.
   3. Back in Search Console > Verify. If it fails, wait ten minutes and retry; Cloudflare propagation is fast but Google caches.
   4. Search Console > Sitemaps > enter `https://apidrifter.com/sitemap-index.xml` > Submit. Also submit the research post and the compare pages once via URL inspection > Request indexing: `/research/public-api-spec-drift-2026-11/`, `/compare/schemathesis/`, `/compare/oasdiff/`, `/agents/`, `/drift-index/`.
6. **Bing Webmaster Tools.** https://www.bing.com/webmasters > sign in > "Import your sites from GSC" > authorize the Google account used above > select `apidrifter.com` > Import. The sitemap comes across with it. This also covers DuckDuckGo and, in practice, most of the answer engines that lean on Bing's index.
7. **Cloudflare AI Crawl Control.** Cloudflare dashboard > `apidrifter.com` > AI Crawl Control (older dashboards call it AI Audit). Leave all crawlers set to "Allow". The site publishes `llms-full.txt` and Markdown twins on purpose; blocking crawlers would undo that. Use the "Crawlers" view for the count of GPTBot, ClaudeBot, PerplexityBot and Bingbot hits; it is one of the metrics in section 4.
8. **Directory submissions.** Paste the text below. Short description (under 120 characters): `Verify a running API against its OpenAPI spec; get a fix for whichever side drifted. Also diffs specs and MCP servers.` Long description:

   > apidrifter runs an OpenAPI document against a live implementation and reports every mismatch with two fixes: one if the spec is the source of truth, one if the implementation is. The same engine diffs spec versions (357 polarity-aware change rules) and snapshots and diffs MCP servers, including tool description changes. `apidrifter serve` exposes all of it over MCP: plan_requests, run_requests, verify_observations, diff_specs, breaking_changes, changelog, mcp_snapshot, mcp_diff, list_rules. No telemetry, no account, Apache-2.0.

   Install snippet for every listing: `npx -y apidrifter serve`, or the JSON block from the README (`{"mcpServers":{"apidrifter":{"command":"npx","args":["-y","apidrifter","serve"]}}}`).
   1. **MCP Registry.** Follow the "MCP Registry" section of `docs/RELEASING.md` after the 0.2.0 release: bump `version` in `packages/cli/server.json`, `mcp-publisher login dns --domain apidrifter.com`, `mcp-publisher publish`. Check with `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.apidrifter/apidrifter"`. The weekly digest reports whether the listing exists.
   2. **Smithery.** https://smithery.ai > sign in with the apidrifter GitHub account > Add server > pick `apidrifter/apidrifter`. It reads the root `smithery.yaml`. Paste the short description.
   3. **Glama.** Glama indexes public GitHub repositories that contain an MCP server; the root `glama.json` carries the maintainer and metadata. After the repo is public, search https://glama.ai/mcp/servers for apidrifter and claim the listing from the GitHub account; if it has not been picked up within a week, use the "Add server" link on that page.
   4. **PulseMCP.** https://www.pulsemcp.com/submit. Fields: name `apidrifter`, repository URL, short description, the install snippet above.
   5. **mcp.so.** https://mcp.so/submit, or the standing submission issue at https://github.com/chatmcp/mcpso/issues/1: comment with the repository URL and the short description.
   6. **awesome-mcp-servers.** Fork https://github.com/punkpeye/awesome-mcp-servers, edit `README.md`, add one line under "Developer Tools" in alphabetical position, open a PR titled "Add apidrifter". The repository's CONTRIBUTING asks for the name linked to its repository, a brief description, alphabetical order within the category, and local-only servers (ours is). The line, with the two legend markers copied from the README's Legend section (the TypeScript codebase marker and the local service marker, which are emoji and therefore not reproduced in this ASCII file):

      `- [apidrifter/apidrifter](https://github.com/apidrifter/apidrifter) <TypeScript marker> <local marker> - Verify a running API against its OpenAPI document, diff spec versions, and snapshot and diff MCP servers, with a fix for whichever side drifted.`

   7. **Claude Code plugin.** The plugin lives in `plugins/apidrifter` and installs with `/plugin marketplace add apidrifter/apidrifter` followed by `/plugin install apidrifter@apidrifter`. Put those two lines in the README's agent section and on `/agents/`. For Anthropic's official plugin directory, check the current submission process in https://github.com/anthropics/claude-plugins-official (it has changed; read its CONTRIBUTING before opening a PR) and submit with the short description.
9. **GitHub Marketplace for the action.** In `apidrifter/action` (after the first sync): confirm `action.yml` is at the root with `name`, `description`, and `branding` (`icon: git-compare`, `color: orange`). Releases > Draft a new release > tag `v1.0.0` > tick "Publish this Action to the GitHub Marketplace" > accept the Marketplace Developer Agreement when prompted > choose the primary category "Continuous integration" and secondary "Code quality" > Publish release. Then create and push a moving `v1` tag so `uses: apidrifter/action@v1` works.
10. **Repository About and topics.** Repository home > the gear next to "About". Description: `Finds where your API drifted from its OpenAPI spec. CLI and MCP server; also diffs specs and MCP servers.` Website: `https://apidrifter.com`. Topics, all of them: `openapi`, `api-testing`, `contract-testing`, `mcp`, `mcp-server`, `breaking-changes`, `api-diff`, `schema-validation`, `claude-code`, `ai-agents`. Tick "Releases" and "Packages", untick "Deployments".
11. **dev.to and Hashnode cross-posts.** Both support a canonical URL so the site keeps the search credit.
    - dev.to: New post > paste the post body from section 3 > the three-dot menu or front matter > `canonical_url: https://apidrifter.com/research/public-api-spec-drift-2026-11/` > tags `openapi`, `api`, `testing`, `webdev` > Publish.
    - Hashnode: New article > Settings (gear) > "Are you republishing?" > paste the same canonical URL > tags `OpenAPI`, `API`, `Testing` > Publish.
    - Publish both at least a day after the post is live and indexed, not before.

## 3. Launch sequence for the research post

Order: Hacker News first (a plain link, the discussion is the point), the same morning Lobsters, Reddit the next day, dev.to and Hashnode two days later, the X thread the day the post goes up, the email to Kin Lane the same day, Show HN for the tool itself one week later. Never post the same link twice to the same venue.

All numbers below are the survey's numbers. If the post is updated (for example, GitHub rerun with a token), update this copy first.

### Hacker News (plain link)

Title options, pick one, 80 characters max:

1. `We checked 13 public APIs against their own OpenAPI specs; 9 had hard mismatches`
2. `13 public APIs vs. their OpenAPI specs: what the live responses actually return`
3. `How often do public APIs match their own OpenAPI documents? A read-only survey`

URL: `https://apidrifter.com/research/public-api-spec-drift-2026-11/`

First comment, posted by the author right after submitting:

> Author here. This is a sample, not a rate: 13 APIs that publish their own spec, one read-only unauthenticated GET per operation, every finding hand-reviewed, and only mismatches a generated client would break on counted (wrong type, missing required field, forbidden field, null where none is allowed, wrong media type). We found and fixed one false positive in our own validator during review, in how nullable combines with oneOf, and re-verified everything from the recorded responses before publishing; every request and finding is in the repo if you want to check our work.

### Show HN (one week later)

Title: `Show HN: Apidrifter, finds where an API drifted from its OpenAPI spec and says which side to fix`

URL: `https://github.com/apidrifter/apidrifter`

Text:

> apidrifter runs an OpenAPI document against a running server and reports each mismatch with two fixes: one if the spec is right, one if the implementation is. It is a CLI (`npx apidrifter run openapi.yaml --base-url http://localhost:3000`) and an MCP server (`apidrifter serve`) so an agent can supply the request values a fuzzer cannot. The same engine diffs spec versions with polarity-aware rules and snapshots and diffs MCP servers, including tool description changes.
>
> Last week we posted a survey of 13 public APIs against their own specs (9 had hard mismatches); this is the tool behind it. No telemetry, Apache-2.0. Happy to answer questions about the validator, the false positive we found in it, or the two-fix model.

### Reddit

r/programming title: `We checked 13 public APIs against their own OpenAPI specs. 9 had hard mismatches.`

r/webdev title: `13 public APIs vs their OpenAPI specs: 9 return responses a generated client would break on`

r/devops title: `A read-only survey of 13 public APIs against their own OpenAPI documents (9 drifted), and a CLI to run the same check in CI`

Body for all three (link post with a comment, or text post where links are not allowed):

> We pointed a conformance checker at 13 public APIs that publish their own OpenAPI document (Discourse, GitLab, Wikimedia, APIs.guru, PokeAPI, Open Library, Gitea, Forgejo, httpbin, Nager.Date, Open-Meteo, Swagger Petstore, GitHub). One read-only unauthenticated GET per operation, values from the spec's own examples.
>
> 9 of 13 returned at least one successful response that does not match their own schema in a way a typed client would break on: wrong types, required fields missing, fields where the schema forbids extras, nulls the schema does not allow, wrong media type. 171 distinct schema locations in total. Undocumented extra fields and undocumented error statuses are reported separately and kept out of that number.
>
> Everything was hand-reviewed. We found one false positive in our own validator while reviewing (nullable combined with oneOf), fixed it, and re-verified from the recorded responses. It is a sample, not a rate.
>
> Write-up with every request and finding: https://apidrifter.com/research/public-api-spec-drift-2026-11/
> Data and runner: https://github.com/apidrifter/apidrifter/tree/main/tools/survey

### Lobsters

Tags: `api`, `testing`, `web`. Title as HN option 1. No text; add the HN first comment as the first comment if a discussion starts.

### dev.to post outline

Title: `We checked 13 public APIs against their own OpenAPI specs. 9 had hard mismatches.` Canonical URL set as in section 2.

1. Why this matters: generated clients, typed SDKs, mocks and contract tests all assume the document is true.
2. What counts as hard and what does not (the four excluded categories, quoted from the post).
3. The table, pasted as Markdown from `tools/survey/results/summary.md`, with links to the per-API pages.
4. The ones worth reading: Discourse (generated from test fixtures; tags as objects, forbidden plugin keys in custom_fields), GitLab (list endpoints declared as object), Wikimedia (array where object, undocumented fields, problem+json), APIs.guru (per-API endpoint returns a version entry, not the API entry), Gitea and Forgejo (Swagger 2.0 cannot say null), Petstore (text under application/json), GitHub (rate-limited, understated).
5. The false positive we found in our own validator and what we did about it.
6. What this does not show: a sample, not a rate.
7. How to run it on your own API, two commands, and a link to the per-API pages.

### Email to API Evangelist (Kin Lane)

Subject: `Read-only survey: 13 public APIs vs. their own OpenAPI documents`

> Hi Kin,
>
> We checked 13 public APIs that publish their own OpenAPI document against what they actually return: one read-only, unauthenticated GET per operation, values from the spec's own examples, every finding hand-reviewed. 9 of the 13 returned a successful response a generated client would break on; 171 distinct schema locations in total. Undocumented extra fields and error statuses are reported separately, not counted.
>
> Every request and finding is reproducible, and the tool is open source: https://apidrifter.com/research/public-api-spec-drift-2026-11/
>
> If any of it is useful for API Evangelist, or if you think the method is wrong somewhere, I would like to hear it.
>
> Ryan

(118 words.)

### X launch thread

1. `We checked 13 public APIs against their own OpenAPI specs: read-only, one GET per operation. 9 of 13 returned a successful response a generated client would break on. Every request and finding: https://apidrifter.com/research/public-api-spec-drift-2026-11/`
2. `What counted: wrong type, missing required field, field where the schema forbids extras, null where none is allowed, wrong media type. 171 distinct schema locations across the 9. Undocumented extra fields and error statuses were reported separately, not counted.`
3. `Examples. Discourse: topic tags come back as objects, the spec says strings. GitLab: list endpoints declared as object return arrays. APIs.guru: the per-API endpoint returns a version entry, not the API entry the spec documents. Per-API pages are linked from the write-up.`
4. `During review we found one false positive in our own validator (how nullable combines with oneOf), fixed it, added a test, and re-verified every API from the recorded responses. It is a sample of 13, not a rate.`
5. `The tool is open source. Run it on your own API: npx apidrifter run openapi.yaml --base-url http://localhost:3000. It reports each mismatch with a fix for the spec and a fix for the implementation. https://github.com/apidrifter/apidrifter`

## 4. Metrics that matter and where to read them

| Metric                                | Where                                                                                                | How to read it                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| npm weekly downloads, both packages   | weekly digest issue; https://npmjs.com/package/apidrifter                                            | trend only. CI runs, mirrors and `npx` retries inflate the absolute. A step change after a launch is the signal.      |
| GitHub stars and forks                | weekly digest issue                                                                                  | stars lag downloads; a star after a reply in a thread tells you which replies work.                                   |
| Repo referrers and popular paths      | weekly digest issue (14-day window from the traffic API); Insights > Traffic on the repo             | which venue sent people. Record the venue next to the number in the digest issue so next month's launch can copy it.  |
| Site referrers                        | Cloudflare dashboard > Analytics & Logs > Web Analytics > Referers                                   | same question for the site. Compare with the repo's referrers to see whether people go to the post or the code first. |
| Search Console impressions and clicks | Search Console > Performance > filter page by `/research/`, `/compare/`, `/agents/`, `/drift-index/` | impressions first, clicks later. Queries containing a competitor's name landing on `/compare/` are the ones to watch. |
| AI crawler hits                       | Cloudflare > AI Crawl Control > Crawlers                                                             | whether GPTBot, ClaudeBot, PerplexityBot fetch `llms-full.txt`, the Markdown twins and the research pages.            |
| MCP registry listing and installs     | weekly digest issue (listed or not); Smithery and Glama listing pages show their own install counts  | presence first; counts are small and noisy.                                                                           |
| Threads replied to                    | the digest issue's checklist, ticked by hand                                                         | a count of real conversations beats any of the above.                                                                 |

Nothing in the product reports anything back, so these are the only numbers there are.

## 5. What we deliberately do not do

- **No CLI telemetry.** The CLI and MCP server make no network calls other than the ones the user asked for. `docs/DESIGN.md` section 2 is the reason; nothing in this runbook changes it.
- **No auto-replies.** The digest finds threads and drafts one line; a person reads the thread and decides. No bot comments, no scheduled replies, no DM sequences.
- **No paid ads, for now.** The product is found through the research post, the directories, and replies where the tool answers a question. Revisit when there is a hosted product to sell.
- **No star or download inflation.** No bots, no "star to unlock", no CI jobs that install the package to move the number.
- **No posting the same link twice to the same venue**, and no posting findings about an API before the upstream issue in `docs/outreach/` has been filed where one exists.
