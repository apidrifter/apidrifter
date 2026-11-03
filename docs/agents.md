# Use apidrifter from your coding agent

apidrifter is built to be driven by an agent: the engine produces a request plan, the agent fills in realistic values, runs it against the dev server, reads the findings and fixes whichever side is wrong. This page is the copy-paste setup for the common clients. Everything below uses `npx -y apidrifter`, so nothing needs installing first.

## Claude Code

Add the MCP server:

```sh
claude mcp add apidrifter -- npx -y apidrifter serve
```

Or install the plugin, which adds the same MCP server plus a `verify-api-contract` skill that Claude loads on its own when it adds or changes an endpoint or edits an OpenAPI document:

```text
/plugin marketplace add apidrifter/apidrifter
/plugin install apidrifter@apidrifter
```

From a shell the same two steps are `claude plugin marketplace add apidrifter/apidrifter` and `claude plugin install apidrifter@apidrifter`.

## CLAUDE.md, AGENTS.md or any instructions file

Paste this into the instructions file your agent reads (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, ...):

```markdown
## API contract checks

When you add or change an HTTP endpoint or an OpenAPI document, verify the implementation
against the spec before opening a pull request:

1. Start the service locally and note its port.
2. Run `npx -y apidrifter plan <spec> --out plan.json` to see which parameter and body values
   the engine cannot infer, and write a filled plan with realistic values from the codebase.
3. Run `npx -y apidrifter run <spec> --base-url http://localhost:<port> --plan filled.json --format markdown`.
   Plain http:// is only allowed for localhost. Never put real credentials in the plan, the
   command line or the report; use `--bearer-env VAR` for tokens.
4. For each finding, decide which side is the source of truth: the spec (fix the
   implementation) or the implementation (fix the spec). Do not loosen the spec just to make
   the report clean.
5. Fix and rerun until there are no findings at or above the fail level, then paste the
   Markdown report into the pull request description.

When only the OpenAPI document changed, run
`npx -y apidrifter breaking <old-spec> <new-spec>` and put the changelog
(`npx -y apidrifter changelog <old-spec> <new-spec>`) in the pull request.
```

## Cursor

Save this as `.cursor/rules/apidrifter.mdc`. The rule attaches itself when a spec or route file is in context:

```mdc
---
description: Verify the HTTP implementation against its OpenAPI document with apidrifter
globs: ["**/openapi.{yaml,yml,json}", "**/swagger.{yaml,yml,json}", "**/routes/**", "**/controllers/**", "**/handlers/**", "**/api/**"]
alwaysApply: false
---

When you add or change an HTTP endpoint or an OpenAPI document:

1. Start the service locally and note its port.
2. `npx -y apidrifter plan <spec> --out plan.json`, then write a filled plan with realistic
   values for the slots the engine cannot infer.
3. `npx -y apidrifter run <spec> --base-url http://localhost:<port> --plan filled.json --format markdown`.
   http:// is only allowed for localhost. Never put real credentials in the plan or the
   command line; use `--bearer-env VAR`.
4. For each finding decide which side is the source of truth, fix that side, and rerun until
   the report is clean. Do not loosen the spec to silence findings.
5. Paste the Markdown report into the pull request.
```

To use the MCP tools instead of the CLI, add the server to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "apidrifter": { "command": "npx", "args": ["-y", "apidrifter", "serve"] }
  }
}
```

## Codex, Windsurf, Cline, Gemini CLI and other MCP clients

Any client that takes a JSON MCP configuration uses the same stdio entry:

```json
{
  "mcpServers": {
    "apidrifter": { "command": "npx", "args": ["-y", "apidrifter", "serve"] }
  }
}
```

Codex reads TOML in `~/.codex/config.toml`:

```toml
[mcp_servers.apidrifter]
command = "npx"
args = ["-y", "apidrifter", "serve"]
```

Then paste the instructions block above into `AGENTS.md` so the agent knows when to use the tools.

## What the MCP tools are

`apidrifter serve` exposes the engine over stdio. Documents are passed as `{ "path": "openapi.yaml" }` (relative to the server's working directory), `{ "url": "https://..." }` or `{ "content": "..." }`. Results come back as structured content; the text summary carries counts and rule IDs only, so third-party text never reaches the agent outside a data field.

| Tool                  | What it does                                                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan_requests`       | The requests a spec implies, with the parameter and body slots a caller must fill. Input: `spec`.                                                                                                                                                                                       |
| `run_requests`        | Build requests from the plan and the filled values, execute them against `baseUrl`, verify the responses and return findings, skipped operations, observations and a Markdown report. Input: `spec`, `baseUrl`, optional `filled`, `headers`, `bearerEnv`, `timeoutMs`, `maxBodyBytes`. |
| `verify_observations` | Verify recorded request and response pairs against a spec without sending anything. Input: `spec`, `observations` (array or document).                                                                                                                                                  |
| `diff_specs`          | Every change between two OpenAPI documents or two MCP snapshots, with severity, stable rule ID and location. Input: `before`, `after`, optional `kind`.                                                                                                                                 |
| `breaking_changes`    | Only the breaking changes between two documents. Same input as `diff_specs`.                                                                                                                                                                                                            |
| `changelog`           | Markdown changelog between two documents, plus the full diff result. Same input as `diff_specs`.                                                                                                                                                                                        |
| `mcp_snapshot`        | Connect to a remote MCP server over Streamable HTTP and snapshot its tools, resources and prompts. Input: `url`, optional `timeoutMs`. URLs only; the server never spawns processes.                                                                                                    |
| `mcp_diff`            | Diff a saved MCP snapshot against a live server (by URL) or another snapshot. Input: `snapshot`, `target`, optional `timeoutMs`.                                                                                                                                                        |
| `list_rules`          | Every change rule ID with its default severity and meaning.                                                                                                                                                                                                                             |

Markdown returned by `changelog`, `run_requests` and `verify_observations` ends with a `Found with apidrifter` line; the CLI's `--no-footer` flag or `"footer": false` in `apidrifter.config.json` turns it off for CLI output.

## Directories

The server is listed in the official MCP Registry as `com.apidrifter/apidrifter`, and the repository carries `smithery.yaml` and `glama.json` for the Smithery and Glama directories.
