# apidrifter (CLI)

Diff OpenAPI documents and MCP servers, classify breaking changes with stable rule IDs, verify a running implementation against its spec, and expose all of it to agents as an MCP server.

```
npx apidrifter breaking ./openapi-v1.yaml ./openapi-v2.yaml
npx apidrifter mcp snapshot https://mcp.example.com/mcp --out snapshot.json
npx apidrifter run ./openapi.yaml --base-url http://localhost:3000 --plan filled.json
```

Inputs are file paths or `https://` URLs. Plain `http://` is accepted only for localhost, because the CLI's job includes hitting your dev server. Documents are parsed with the engine's size, depth and reference limits; YAML is parsed with the core schema only.

## Use it from an agent

`apidrifter serve` runs the same capabilities as an MCP server over stdio.

Claude Code: `claude mcp add apidrifter -- npx -y apidrifter serve`

Any client that takes a JSON config:

```json
{ "mcpServers": { "apidrifter": { "command": "npx", "args": ["-y", "apidrifter", "serve"] } } }
```

Tools: `plan_requests`, `run_requests`, `verify_observations`, `diff_specs`, `breaking_changes`, `changelog`, `mcp_snapshot`, `mcp_diff`, `list_rules`.

## Commands

### `apidrifter diff <before> <after>`

Every change between two OpenAPI documents or two MCP snapshots. The kind is detected; force it with `--kind openapi|mcp`.

### `apidrifter breaking <before> <after>`

Breaking changes only. Exit 1 if there are any.

### `apidrifter changelog <before> <after>`

Markdown changelog grouped by severity.

### `apidrifter mcp snapshot <url> [--out file]`

Connect to an MCP server over Streamable HTTP and write a snapshot of its tools, resources, resource templates and prompts, plus server name, version, instructions and capabilities. Servers that lack a capability are skipped for that list, not failed.

`apidrifter mcp snapshot --stdio -- <command> [args...]` spawns a local stdio server instead. The command is run without a shell; its environment contains only `PATH`, `HOME` and anything passed with `--env KEY=VALUE`.

### `apidrifter mcp diff <snapshot> <url | snapshot>`

Diff a saved snapshot against a live server or another snapshot. `--stdio -- <command>` works here too.

### `apidrifter plan <spec> [--out file]`

The requests the spec implies, as JSON, with the parameter and body slots a caller must fill. The engine does not invent values; an agent or a person does.

### `apidrifter run <spec> --base-url <url> [--plan filled.json]`

Build requests from the plan and the filled values, execute them, verify the responses against the spec, and report findings with a fix for each side (spec as truth, implementation as truth). Values come from the filled plan first, then from `example`, `examples` or `default` in the spec. Operations whose required slots are still empty are skipped and listed as `skipped <operation>: missing values for ...` so an agent knows what to supply next.

The filled plan is an array of `{ operationKey, values, body, mediaType, headers }` where `values` is keyed by `in:name` (`path:petId`, `query:limit`, `header:X-Tenant`, `cookie:session`).

Flags:

- `--header "Name: value"`, repeatable. Values are redacted in stored observations.
- `--bearer-env VAR`: send `Authorization: Bearer` from an environment variable. The token never appears in output.
- `--observations-out file`: write the redacted observations for later `verify` runs.
- `--max-body-bytes n`: response body cap (default 8 MiB). Larger responses fail the run rather than being truncated.
- `--timeout ms`: per-request timeout (default 30000).

Redirects are not followed; the redirect status is recorded as the response.

### `apidrifter verify <spec> --observations <file>`

Verify from recorded observations only, without sending anything.

### `apidrifter serve`

Run as an MCP server over stdio. Tools: `diff_specs`, `breaking_changes`, `changelog`, `mcp_snapshot`, `mcp_diff`, `plan_requests`, `run_requests`, `verify_observations`, `list_rules`. Documents are given as `{ path }`, `{ url }` or `{ content }`. Paths must resolve inside the server's working directory; URLs follow the same policy as the CLI; `mcp_snapshot` accepts URLs only (the server never spawns processes on an agent's behalf). Results come back as structured content; the text summary carries counts and rule IDs only, so third-party text never reaches an agent outside a data field.

Example client configuration:

```json
{ "mcpServers": { "apidrifter": { "command": "npx", "args": ["apidrifter", "serve"] } } }
```

## Common options

| Flag                                | Meaning                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--format json\|markdown\|text`     | Default: text on a terminal, json otherwise.                                                                                               |
| `--config <file>`                   | Severity overrides, ignores and baseline. `apidrifter.config.json` or `.apidrifter.yaml` in the working directory is loaded automatically. |
| `--fail-on breaking\|warning\|info` | Exit 1 when anything at or above this level is found. Default `breaking`.                                                                  |
| `--timeout <ms>`                    | Network timeout. Default 30000.                                                                                                            |

## Exit codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| 0    | Nothing at or above the `--fail-on` level.                              |
| 1    | Threshold exceeded.                                                     |
| 2    | Usage or input error (bad flags, missing file, URL rejected by policy). |
| 3    | The engine refused a document (too large, too deep, unsupported kind).  |

## Configuration

```json
{
  "severity": { "response-property-enum-value-added": "breaking", "api-version-changed": "ignore" },
  "ignore": { "ids": ["endpoint-description-changed"], "subjects": ["GET /internal/**"] },
  "baseline": ["<fingerprints of reviewed changes>"]
}
```

Configuration can make the engine quieter or louder. It never changes what is detected.
