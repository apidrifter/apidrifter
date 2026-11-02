# API Drifter

[![npm](https://img.shields.io/npm/v/apidrifter)](https://www.npmjs.com/package/apidrifter)
[![CI](https://github.com/apidrifter/apidrifter/actions/workflows/ci.yml/badge.svg)](https://github.com/apidrifter/apidrifter/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Finds where your API drifted from its spec. An open-source CLI and MCP server that runs an OpenAPI document against a live implementation and reports every mismatch with two fixes: one if the spec is the source of truth, one if the implementation is. The same engine diffs spec versions and MCP servers.

Website and research: https://apidrifter.com

## Try it in a minute

```sh
# Verify a running API against its spec. Values come from the spec's examples.
npx apidrifter run openapi.yaml --base-url http://localhost:3000

# See what the engine wants to send, fill the gaps, run again
npx apidrifter plan openapi.yaml --out plan.json
npx apidrifter run openapi.yaml --base-url http://localhost:3000 --plan filled.json

# Fail CI on breaking changes between two spec versions
npx apidrifter breaking old.yaml new.yaml

# Snapshot and diff an MCP server, including tool description changes
npx apidrifter mcp snapshot https://mcp.example.com/mcp --out before.json
npx apidrifter mcp diff before.json https://mcp.example.com/mcp
```

Exit code 1 means findings at or above the threshold (`--fail-on breaking` by default). Output is JSON when piped, text in a terminal, Markdown with `--format markdown`.

## Use it from an agent

`apidrifter serve` exposes the same capabilities as an MCP server over stdio: `plan_requests`, `run_requests`, `verify_observations`, `diff_specs`, `breaking_changes`, `changelog`, `mcp_snapshot`, `mcp_diff`, `list_rules`.

Claude Code:

```sh
claude mcp add apidrifter -- npx -y apidrifter serve
```

Cursor, Windsurf, or any client that takes a JSON config:

```json
{
  "mcpServers": {
    "apidrifter": { "command": "npx", "args": ["-y", "apidrifter", "serve"] }
  }
}
```

Then ask the agent to plan requests for a spec, fill the values it cannot infer, run them against your dev server, and fix whichever side is wrong.

## What it checks

- **Verification**: undocumented statuses and media types, missing required fields, wrong types, forbidden or undocumented fields, disallowed nulls, enum and constraint violations, requests the spec allows but the server rejects, and requests the spec forbids but the server accepts. 26 finding rules.
- **Spec diff**: 357 change rules, polarity-aware. A property becoming required is breaking in a request and harmless in a response; the engine knows which side it is looking at.
- **MCP**: tools, resources, prompts and server instructions, with description changes tracked because descriptions are what agents act on, and a heuristic flag for descriptions that look aimed at the agent rather than the user.

Full lists: [rules reference](https://apidrifter.com/docs/rules/).

## Research

We checked 13 public APIs against their own OpenAPI documents, read-only. 9 of 13 returned successful responses a generated client would break on; 171 distinct schema locations. Every request and finding is reproducible: [the write-up](https://apidrifter.com/research/public-api-spec-drift-2026-11/), [the data](tools/survey/results), [the runner](tools/survey).

## Packages

| Package                             | What                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| [`apidrifter`](packages/cli)        | The CLI and MCP server. `npx apidrifter`.                      |
| [`@apidrifter/core`](packages/core) | The engine: pure, deterministic, no I/O. Use it as a library.  |
| [`action`](packages/action)         | A composite GitHub Action wrapping `breaking` and `changelog`. |

## Design and contributing

How it is built and why, including the security model: [docs/DESIGN.md](docs/DESIGN.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE). The name and logo are trademarks; see [TRADEMARK.md](TRADEMARK.md).
