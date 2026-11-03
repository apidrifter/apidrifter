# Fastify + @fastify/swagger

A four-endpoint Fastify app (`app.js`) whose OpenAPI document is generated from its route
schemas by `@fastify/swagger` and served at `/openapi.json`. The create route's `response`
schema documents a `200`; the handler sends `201`. That is the deliberate mismatch, and
apidrifter reports it as `undocumented-status`. It is a common one in Fastify, because the
response schema is also what `fast-json-stringify` serializes with, so a status the schema
does not list still goes out, just without serialization or validation.

## Run it

```sh
npm install
npm start                      # http://localhost:3000, spec at /openapi.json
```

In a second terminal:

```sh
npx -y apidrifter run http://localhost:3000/openapi.json --base-url http://localhost:3000 --format markdown
```

Plain `http://` is accepted for localhost only. `npm run spec` writes the same document to
`openapi.json` so CI can diff it against the previous version; the committed copy is that
snapshot.

The route schemas carry `examples` for the path parameter and the request body
(`@fastify/swagger` emits them as OpenAPI `example` values), so no plan file is needed.
Without them, run `npx -y apidrifter plan http://localhost:3000/openapi.json --out plan.json`,
fill the slots, and pass `--plan filled.json`.

## What it reports

```markdown
## Verification report

1 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (1)

- `undocumented-status` at `POST /todos > response 201` (observation 3): status 201 is not documented for "POST /todos"
  - If the spec is the source of truth: Return one of the documented statuses (200) from POST /todos.
  - If the implementation is the source of truth: Add a "201" response under paths\["/todos"\].post.responses.

---

Found with [apidrifter](https://apidrifter.com) v0.1.0
```

(The report's path separator is shown as `>` here to keep this file ASCII.)

Exit code 1: an undocumented status is breaking, because a generated client has no branch
for it.

## Which side to fix

`201 Created` is the right status for a create, so here the implementation is the source of
truth: change the route's `response` key from `200` to `201` in `app.js`. That also turns
Fastify's response serialization back on for the created todo. If the team's convention
were "200 for everything", the fix would be `reply.code(200)` instead. Either way, do not
leave a status the schema does not list; Fastify will happily send it unvalidated.

## Automation

- `CLAUDE.md` tells Claude Code (or any agent that reads it) to run this check after touching
  a route or a schema.
- `.cursor/rules/apidrifter.mdc` does the same for Cursor.
- `.github/workflows/apidrifter.yml` checks that the committed `openapi.json` snapshot is
  current, diffs it against the base branch with `apidrifter/action@v1`, and runs the live
  check in a second job. With the mismatch in place the live job fails on purpose.
- `apidrifter.config.json` raises `response-undocumented-property` to a warning so an extra
  field is visible in CI.
