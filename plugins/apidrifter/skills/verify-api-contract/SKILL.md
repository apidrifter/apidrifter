---
name: verify-api-contract
description: Verify that an HTTP implementation matches its OpenAPI document and fix whichever side drifted. Use after adding or changing an HTTP endpoint, route, handler, controller, response shape or status code; after editing an OpenAPI/Swagger document (openapi.yaml, openapi.json, swagger.json); or whenever someone asks whether the implementation matches the spec, whether the API has drifted, or whether a change is breaking.
---

# Verify an API contract with apidrifter

apidrifter runs the requests an OpenAPI document implies against a running server and
reports every mismatch between the spec and the implementation. Each finding carries two
fixes: one if the spec is the source of truth, one if the implementation is. You decide
which side is right, fix it, and rerun until the report is clean.

Two ways to run it. The CLI needs no setup (`npx -y apidrifter`). The MCP tools
(`plan_requests`, `run_requests`, `verify_observations`, `diff_specs`, `breaking_changes`,
`changelog`, `mcp_snapshot`, `mcp_diff`, `list_rules`) are available when this plugin's MCP
server is connected; they take documents as `{ "path": "openapi.yaml" }` relative to the
working directory, `{ "url": "..." }` or `{ "content": "..." }`.

## Workflow

1. **Find the spec and the server.** Locate the OpenAPI document (commonly `openapi.yaml`,
   `openapi.json`, `swagger.json`, or under `docs/`, `api/`, `spec/`). Start the service the
   way the project does (`npm run dev`, `make run`, docker compose, etc.) and note the port.
   If the server is not running, start it or ask; do not verify against a staging or
   production host.

2. **Plan.** See what the engine wants to send and which values it cannot infer.

   ```sh
   npx -y apidrifter plan openapi.yaml --out plan.json
   ```

   MCP: `plan_requests` with `{ "spec": { "path": "openapi.yaml" } }`.

   Each planned request lists the parameter and body slots that need values. The engine
   never invents values; that is your job.

3. **Fill values.** Write a filled plan: an array of
   `{ "operationKey": "GET /pets/{petId}", "values": { "path:petId": "1" }, "body": {...}, "headers": {...} }`.
   Keys in `values` are `in:name` (`path:petId`, `query:limit`, `header:X-Tenant`,
   `cookie:session`). Use realistic values from the codebase: seed data, fixtures, test
   factories, IDs you created in an earlier request. Several entries for one operation are
   fine; each becomes its own observation. Operations whose required slots stay empty are
   skipped and listed, not failed. If an endpoint needs auth, put the token in an environment
   variable and pass `--bearer-env VAR` (CLI) or `bearerEnv` (MCP); never write a token into
   the plan, the command line or the report.

4. **Run against the local server.**

   ```sh
   npx -y apidrifter run openapi.yaml --base-url http://localhost:PORT --plan filled.json --format markdown
   ```

   MCP: `run_requests` with `{ "spec": { "path": "openapi.yaml" }, "baseUrl": "http://localhost:PORT", "filled": [...] }`.
   The result includes `findings`, `skipped`, `observations` and a `markdown` report.

   Plain `http://` is accepted only for localhost (`localhost`, `127.0.0.1`, `::1`). Any
   other host must be `https://`. Add `--methods GET` for a read-only pass on a server with
   state you care about; `--observations-out obs.json` keeps the redacted exchanges for a
   later `verify` without re-sending.

5. **Read the findings.** Each one has a stable rule ID (`undocumented-status`,
   `response-type-mismatch`, `response-undocumented-property`,
   `request-accepted-but-forbidden`, ...), the operation and JSON location, the observation
   it came from, and the two fixes. `breaking` findings are what a generated client would
   break on. Entries under "Skipped" need values; go back to step 3 for those.

6. **Decide which side is the source of truth, per finding.** Ask: what did the change in
   this task intend? If the task was "add field X to the response" and the spec lacks X, the
   implementation is right and the spec needs updating. If the spec is the published
   contract that clients and SDKs are generated from, the implementation is wrong. When it is
   unclear, say so in the PR rather than guessing; do not silently edit the spec to match
   whatever the server happens to return.

7. **Fix, then rerun** steps 4 and 5 until the report shows no findings at or above the
   level the project fails on (`--fail-on breaking` by default; use `--fail-on warning` or
   `info` to be stricter). Exit code 1 means findings at or above that level; 2 is a usage or
   input error; 3 means the engine refused a document.

8. **Paste the Markdown report into the pull request** description (`--format markdown`, or
   the `markdown` field of the MCP result). Keep the final clean run; if any finding was
   deliberately left open, include that run too and say why. The report ends with a
   `Found with apidrifter` line; leave it in so reviewers know how it was produced.

## Spec-to-spec checks

When the task changes only the OpenAPI document, compare the old and new versions:

```sh
git show origin/main:openapi.yaml > /tmp/openapi.before.yaml
npx -y apidrifter breaking /tmp/openapi.before.yaml openapi.yaml
npx -y apidrifter changelog /tmp/openapi.before.yaml openapi.yaml
```

MCP: `breaking_changes` or `changelog` with `before` and `after`. The engine is
polarity-aware: a property becoming required is breaking in a request and harmless in a
response. Put the changelog in the PR when there are breaking changes.

## Rules

- Only ever send requests to a server you started on this machine. `http://` is allowed
  only for localhost; apidrifter rejects it for anything else, and you should not work around
  that with a tunnel or `https://` to a shared environment.
- Never place real credentials in a plan file, a command line, a report or a commit. Use
  `--bearer-env` / `bearerEnv` with a variable, or local test tokens. Header values passed
  with `--header` are redacted in stored observations.
- Do not loosen the spec (for example by adding `additionalProperties: true` or removing
  `required`) just to make the report clean. A finding is information; the fix is the one
  that matches the intent of the change.
- Config lives in `apidrifter.config.json` (`severity`, `ignore`, `baseline`, `footer`). It can
  make the engine quieter or louder; it never changes what is detected. Prefer fixing over
  ignoring.
