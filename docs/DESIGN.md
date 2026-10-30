# Driftwatch design

Driftwatch tells you when an API you depend on changes, and whether that change will break you. It covers OpenAPI documents and MCP servers with one engine, ships as an open-source CLI, and runs as a hosted service that watches public and private sources and alerts humans and agents.

This document is the standing opinion on how it is built. It is short on purpose. If a decision is not here, it is open; if it is here, change the document before changing the code.

## 1. What we are building

Three surfaces, one engine:

1. **Engine** (`@driftwatch/core`). Pure TypeScript. Takes two documents, returns a typed, classified, deterministic list of changes. No I/O.
2. **CLI and CI** (`driftwatch`, GitHub Action). Diff files and URLs, snapshot MCP servers, fail builds on breaking changes.
3. **Hosted** (`apps/web`, `apps/worker`). A public catalog of APIs and MCP servers with full change history, watches and alerts for private and public sources, and an MCP server so agents can ask "what changed since."

Non-goals, so they do not creep in: hosting API documentation, mocking, linting style rules, generating SDKs, runtime traffic monitoring.

## 2. Principles

- **The core never does I/O.** No filesystem, no network, no environment, no `eval`, no dynamic import. It is a function from documents to changes. Everything that touches the outside world lives in the CLI or the hosted apps. This is the main security boundary and the main testability property.
- **Every input is hostile.** Specs and MCP tool lists come from third parties. They can be huge, deeply nested, self-referential, full of control characters, or written to inject instructions into an agent that reads our output. Parse with limits, render as data, never execute.
- **Deterministic and stable.** Same inputs, same output, byte for byte. Change IDs are stable public identifiers that people will put in config files and CI. We do not rename them.
- **Polarity, not symmetry.** A schema change is breaking or not depending on whether the schema describes what a consumer sends or what it receives. The engine carries that direction through every comparison instead of guessing at the end.
- **Fewest dependencies that are correct.** The core has a hard cap of three runtime dependencies. Every dependency anywhere is pinned by the lockfile and reviewed on update.
- **Public is free, private is paid.** Public specs, public MCP servers and their histories are free forever and are the entire content surface. Money comes from private sources, team features and the agent interface at volume.
- **Boring infrastructure.** Postgres, one worker, one web app, object storage. Nothing that needs a platform team.

## 3. Open source model

- **License: Apache-2.0 for the whole repository**, including the hosted apps. The moat is the catalog data, the history and the operation, not the code. A copyleft license would cost adoption and buy little.
- **Contributions under the Developer Certificate of Origin** (sign-off on commits). No contributor license agreement.
- **One monorepo**, pnpm workspaces. Packages publish to npm under the `@driftwatch` scope; the CLI publishes as `driftwatch`. Apps do not publish.
- **Versioning with Changesets.** Semver. The change ID list is part of the public API: adding an ID is a minor, removing or changing the meaning of one is a major.
- **Releases only from CI** with npm provenance. Nobody publishes from a laptop.
- **The name is a placeholder** and lives in exactly one place (`package.json` names and the CLI binary). Renaming is a find-and-replace.

```
driftwatch/
  docs/            design, rules reference, threat model, ADRs
  packages/
    core/          engine: model, diff, rules, render
    cli/           driftwatch binary
    action/        GitHub Action (thin wrapper over cli)
  apps/
    web/           public catalog, dashboard, HTTP API, MCP server
    worker/        fetcher and scheduler, isolated egress
  tools/
    oracle/        oasdiff comparison harness, not in CI by default
```

## 4. Engine

### 4.1 Normalize, then diff

Documents are never diffed as written. Each adapter converts its input into a **surface model**: the set of things a consumer can observe. For OpenAPI that is operations keyed by method and path, their parameters, request bodies by media type, responses by status and media type, and the resolved schemas behind each. For MCP it is tools keyed by name, with description, annotations, input schema and output schema, plus resources and prompts.

Normalizing first means that moving a schema into `components`, reordering keys, or changing `$ref` layout produces no change, because nothing observable changed. It also means the two adapters share one schema differ.

### 4.2 Polarity

Every schema is diffed with a polarity:

- `input`: the consumer produces this value. Narrowing is breaking: a new required property, a removed enum value, a tighter maximum, a removed property the consumer might have been sending.
- `output`: the producer produces this value. Narrowing is safe and widening is breaking: a removed property, a property becoming optional, a new enum value the consumer may not handle, a type change.

Request bodies, parameters and MCP tool inputs are `input`. Responses and MCP tool outputs are `output`. The schema differ takes the polarity as an argument and classifies with it, so the same code path handles both sides correctly.

### 4.3 Changes and rules

The output is a flat list of `Change` records:

```ts
interface Change {
  id: ChangeId; // stable, documented, e.g. "request-property-became-required"
  severity: "breaking" | "warning" | "info";
  source: "openapi" | "mcp";
  location: Location; // operation / tool, then a JSON pointer within it
  before?: unknown; // small, serializable, already truncated
  after?: unknown;
  message: string; // plain text, control characters stripped
}
```

Each `ChangeId` is produced by exactly one rule. Rules are small pure functions registered in one table with an ID, default severity, polarity applicability and a one-paragraph description. The rules reference in `docs/rules.md` is generated from that table, so the documentation cannot drift from the code.

Where our rule matches an oasdiff check in meaning, we use the same ID, so existing CI config and muscle memory carry over.

### 4.4 Configuration

Users can adjust severity per rule, ignore paths, operations or tools by pattern, and set a baseline of accepted changes. Configuration is a plain object in the core; the CLI reads it from `driftwatch.config.json` or `.driftwatch.yaml`. Configuration can only make the engine quieter or louder, never change what it detects.

### 4.5 Determinism and limits

Output is sorted by location then ID. Objects in `before` and `after` are truncated to a fixed byte budget. The engine enforces maximum document size, nesting depth, reference chain length and total node count, and reports a structured error rather than throwing on anything over budget. Reference cycles are detected and represented, not followed forever.

## 5. CLI

```
driftwatch diff <before> <after>          all changes, json or markdown
driftwatch breaking <before> <after>      breaking only, exit 1 if any
driftwatch changelog <before> <after>     markdown changelog
driftwatch mcp snapshot <url|cmd>         write a tools/resources/prompts snapshot
driftwatch mcp diff <snapshot> <url|cmd>  diff a server against a snapshot
```

Inputs are local paths or `https://` URLs. The CLI applies the same parsing limits as the hosted fetcher. The GitHub Action wraps `breaking` and `changelog` and posts the result as a pull request comment.

For MCP, the CLI can connect over Streamable HTTP or spawn a local stdio server, because it runs on the user's own machine. The hosted service never spawns processes.

## 6. Hosted platform

### 6.1 Shape

Two deployables and a database:

- **web**: Next.js. Public catalog and history pages, signed-in dashboard, HTTP API, MCP server over Streamable HTTP. Public pages render from the database and are cached at the edge. Every public HTML page has a JSON twin at the same path with an `Accept` header or `.json` suffix, plus `llms.txt` and a sitemap.
- **worker**: the only process with outbound network access to arbitrary hosts. Fetches sources on a schedule, stores snapshots, runs the engine, writes diffs, enqueues notifications. Runs with an egress policy and no database write access beyond its own tables.
- **Postgres** for everything relational. **Object storage** for snapshot bodies, content-addressed by SHA-256, so identical documents are stored once and history is cheap.

### 6.2 Data model

- `provider`: a catalog entry (Stripe, GitHub, an MCP server). Public or owned by an org.
- `source`: something fetchable that belongs to a provider. Kind `openapi`, `mcp`, or `changelog`. URL, fetch interval, auth reference for private sources.
- `snapshot`: one fetch of a source. Content hash, fetched-at, parse status, pointer into object storage.
- `diff`: the engine result between two consecutive snapshots. Immutable.
- `watch`: an org's interest in a source, with filters (severity, paths, impact file).
- `channel`: where alerts go. Email, Slack, webhook.
- `delivery`: an attempt to send one diff to one channel. Idempotent on `(diff, channel)`.
- `api_key`: hashed secret, scopes, last used.

### 6.3 Tenancy

Every row that belongs to an org carries `org_id`, and every query goes through one data-access layer that requires an org context. Postgres row-level security is enabled as a second line of defense with the app connecting as a role that cannot bypass it. There is no "admin" code path that skips either.

### 6.4 Agent interface

One MCP server and the same capabilities as plain HTTP. Tools are few and specific: list providers, get changes for a provider since a date or snapshot, check whether an operation or tool is deprecated or removed, create a watch. Responses contain third-party text (descriptions, messages) clearly marked as quoted data, never as instructions.

## 7. Security model

### 7.1 Threat model

Assets: private specs and snapshots, API keys and channel secrets, the integrity of the catalog and history, the availability of the service, and the agents that consume our output.

Adversaries: a malicious or compromised third-party source, a malicious user of the hosted service, a compromised dependency, and an attacker on the network.

### 7.2 Controls by component

**Engine**
- YAML parsed with a safe schema only: no custom tags, no anchors expansion beyond a fixed alias budget, no merge keys from untrusted input. JSON parsed with size limits before parsing.
- Hard caps on document size, depth, node count and reference chain length, enforced before and during normalization.
- External references (`$ref` to another file or URL) are disabled in the engine. The CLI may pre-resolve them for local files under the user's control; the hosted service never does.
- All strings that reach output are stripped of control characters and ANSI escapes and truncated.
- No regular expression is built from untrusted input. Patterns come only from user config and are compiled with a length cap and tested against catastrophic backtracking.
- Dependency cap of three. Current intent: a YAML parser and nothing else that is not essential.

**CLI**
- URL inputs are `https://` only, redirects limited to five and must stay on `https://`, response size capped, timeouts set.
- MCP stdio servers are spawned without a shell, with the user's explicit command and arguments, and an environment allowlist.
- Never prints secrets, never writes outside the paths it was given.

**Worker (fetcher)**
- SSRF defense: resolve DNS first, reject loopback, link-local, private, multicast, metadata and ULA ranges, connect to the resolved address with the original host for TLS and `Host`, and re-apply the check on every redirect.
- Only HTTPS. Per-source timeouts, size caps, and a per-host rate limit so we are a polite client.
- MCP connections are Streamable HTTP only. The worker never spawns processes and never follows a server's instructions, only reads its lists.
- Egress-only network, no inbound. Separate credentials from `web`, scoped to its own tables.
- Snapshot bodies are stored as opaque bytes and parsed only by the engine with the limits above.

**Web and API**
- No password authentication. Magic link and OAuth only, via a maintained library.
- API keys are random 256-bit values, shown once, stored as SHA-256, scoped per org and per capability, revocable, with last-used tracking.
- Outgoing webhooks are signed with a per-channel secret using HMAC-SHA256 over a timestamp and the body, with the timestamp in the header so receivers can reject replays. Webhook destinations pass the same SSRF checks as fetches.
- Slack and other channel tokens are encrypted at rest with a key held outside the database.
- Rate limits on every authenticated and unauthenticated route, keyed by key or IP.
- Third-party text from specs is rendered as escaped text. Markdown in descriptions is rendered through a strict sanitizer with no raw HTML, no scripts, no data URLs.
- Strict Content Security Policy, no inline scripts, security headers on every response.
- Private snapshots and diffs are deleted on org deletion and after a retention window the org controls.

**Supply chain and process**
- Lockfile committed and frozen in CI. No `postinstall` scripts allowed from dependencies (`pnpm` setting), audited on update.
- Dependencies updated by a bot with grouped pull requests and reviewed, not auto-merged.
- GitHub Actions pinned by commit SHA. CI has read-only tokens except the release job.
- Publishing to npm only from CI with provenance attestations. Two-factor required on the npm org.
- CodeQL and dependency review on every pull request.
- `SECURITY.md` with private vulnerability reporting through GitHub, and a stated response window.
- Secrets never in the repository, loaded from the environment and validated at startup; the app refuses to boot with a missing or placeholder secret.

### 7.3 Prompt injection posture

Our output is read by agents. A third-party tool description that says "ignore previous instructions" will reach an agent through us if we are naive. We cannot make an agent immune, but we can refuse to help: all third-party strings in API and MCP responses are placed in clearly delimited data fields, never in the top-level instruction or message fields, and never concatenated into natural-language summaries without quoting. The MCP side of the engine additionally flags description changes that introduce imperative language aimed at agents as a `warning`, which doubles as a tool-poisoning early-warning feature.

## 8. Quality bar

- TypeScript strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. ESM only. Node 22 or newer.
- Biome for lint and format. One tool, one config, fast.
- Vitest. Fixture tests are pairs of documents and an expected change list in JSON. The expected list is the contract, reviewed by a human when it changes.
- Invariant tests on every fixture: `diff(a, a)` is empty, `diff` is deterministic, and reformatting a document yields no change.
- The oracle harness in `tools/oracle` runs the engine and oasdiff over consecutive commits of real public spec repositories and reports disagreements. It is how we find the long tail, and it runs on demand rather than in CI.
- Coverage is not a target. Every rule has at least one positive and one negative fixture.

## 9. Build order

1. Engine and CLI, with fixtures and the oracle harness. Public launch of the CLI.
2. Catalog and public history pages, seeded from public spec repositories with history backfilled from git.
3. Hosted watching, alerts, self-serve billing, MCP server. First paid tier.
4. Producer side: GitHub App for pull-request comments, hosted changelog page per project, badge.
5. Impact filtering from an uploaded usage file or collection.

## 10. Decisions

Short records of choices that were argued. Append, do not edit.

- **Own engine instead of wrapping oasdiff.** We need a JSON Schema differ for MCP regardless, we want one language, and we want to own classification. oasdiff remains the test oracle and the source of rule IDs where meanings match.
- **Apache-2.0 everywhere, no open-core split.** Code is not the moat. Adoption is the distribution strategy.
- **Polarity as a first-class engine concept.** Most incorrect breaking-change classifications in existing tools come from treating request and response schemas the same way.
- **Normalize before diff.** Diffing the raw document punishes harmless refactors and makes the two adapters diverge.
- **No password auth in the hosted product.** It removes an entire class of risk for no loss of function.
- **The worker is the only thing that talks to the open internet.** Keeps the SSRF surface in one place with one set of tests.

## 11. Verification (added after the pivot)

The wedge is no longer "alert me when a third-party spec changes." It is "does my implementation match my spec, and which side should I fix." Spec-to-spec diffing stays as the engine and as a CI feature; watching public specs becomes a feature of the hosted platform later.

### 11.1 Mechanism

Version one executes requests derived from the spec against a running server and compares the responses. Traffic observation (a proxy) comes later for dev and staging. Source analysis is left to agents; it is not a deterministic feature.

The engine stays pure. It produces a **plan** (requests with the slots that need values) and consumes **observations** (request and response pairs). The CLI, an agent through the MCP server, or a proxy fills the plan and executes it. This is what makes the loop agent-native: the agent supplies realistic values, auth and sequencing, which a fuzzer cannot.

### 11.2 Findings

A finding is like a change but has two fixes: one if the spec is the source of truth, one if the implementation is. Finding IDs live in their own table beside the change rules and are documented in the same generated reference. Each finding points at the observation it came from so a report can show evidence.

Validation is done by our own validator over the normalized schema model, not by a third-party JSON Schema library. It is smaller, it is consistent with the differ, and it keeps the dependency count at the cap. Patterns from specs are third-party input: they are compiled with a length cap, tested against a bounded input, and any pattern that fails to compile or looks catastrophic is skipped and reported as `info`.

### 11.3 Surfaces

- `driftwatch plan <spec>`: emit the request plan as JSON.
- `driftwatch run <spec> --base-url <url> [--plan filled.json]`: execute, collect observations, verify, report. Exit 1 on breaking findings.
- `driftwatch verify <spec> --observations <file>`: verify from recorded observations only.
- `driftwatch serve`: MCP server exposing plan, run, verify, diff, breaking and changelog as tools, so an agent in any client can drive the loop.

The CLI may target `http://localhost` because it runs on the user's machine. The hosted worker keeps its HTTPS-only, SSRF-checked fetcher and never executes user-defined requests in version one.

### 11.4 Contract

`packages/core/src/verify/types.ts` is the contract between the engine and its callers. The CLI and the MCP server are written against it, and the verify engine implements it.
