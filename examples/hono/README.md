# Hono + @hono/zod-openapi

A four-endpoint Hono app (`src/app.ts`) whose OpenAPI document is generated from its Zod
schemas by `@hono/zod-openapi` and served at `/openapi.json`. The `Priority` enum in the
schema says `low`, `medium` or `high`; the store has a todo whose priority is `urgent`.
That is the deliberate mismatch, and apidrifter reports it as `response-enum-violation`.

## Run it

```sh
npm install
npm start                      # http://localhost:3000, spec at /openapi.json
```

In a second terminal, point apidrifter at the generated document and the server:

```sh
npx -y apidrifter run http://localhost:3000/openapi.json --base-url http://localhost:3000 --format markdown
```

Plain `http://` is accepted for localhost only. `npm run spec` writes the same document to
`openapi.json` so CI can diff it against the previous version; the committed copy is that
snapshot.

The path parameter and the request body have `example` values in the Zod schemas
(`.openapi({ example })`), so no plan file is needed. Without them, run
`npx -y apidrifter plan http://localhost:3000/openapi.json --out plan.json`, fill the slots,
and pass `--plan filled.json`.

## What it reports

```markdown
## Verification report

2 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (2)

- `response-enum-violation` at `GET /todos > response 200 > application/json > /1/priority` (observation 1): response body at /1/priority: value "\\"urgent\\"" is not one of the allowed values
  - If the spec is the source of truth: Return one of the documented values in response body at /1/priority.
  - If the implementation is the source of truth: Add the returned value to the enum at paths\["/todos"\].get.responses\["200"\].content\["application/json"\].schema.items.properties\["priority"\].
- `response-enum-violation` at `GET /todos/{id} > response 200 > application/json > /priority` (observation 2): response body at /priority: value "\\"urgent\\"" is not one of the allowed values
  - If the spec is the source of truth: Return one of the documented values in response body at /priority.
  - If the implementation is the source of truth: Add the returned value to the enum at paths\["/todos/{id}"\].get.responses\["200"\].content\["application/json"\].schema.properties\["priority"\].

---

Found with [apidrifter](https://apidrifter.com) v0.1.0
```

(The report's path separator is shown as `>` here to keep this file ASCII.)

Exit code 1: an enum violation is breaking, because a client generated from the spec maps
the enum to a closed type.

## Which side to fix

If `urgent` is a real priority, the spec is wrong: add it to `PrioritySchema` in
`src/app.ts` and the document regenerates. If it was a typo in a migration or a value that
should never have reached the store, the implementation is wrong: fix the data and the
handler that accepted it. Notice that with a generated spec, "fixing the spec" means fixing
the schema the code is built from, so the two sides are never far apart.

## Automation

- `CLAUDE.md` tells Claude Code (or any agent that reads it) to run this check after touching
  a route or a schema.
- `.cursor/rules/apidrifter.mdc` does the same for Cursor.
- `.github/workflows/apidrifter.yml` checks that the committed `openapi.json` snapshot is
  current, diffs it against the base branch with `apidrifter/action@v1`, and runs the live
  check in a second job. With the mismatch in place the live job fails on purpose.
- `apidrifter.config.json` raises `response-undocumented-property` to a warning so an extra
  field is visible in CI.
