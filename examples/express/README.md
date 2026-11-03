# Express + hand-written OpenAPI

A four-endpoint Express 5 app (`server.js`) and a hand-written `openapi.yaml`. The spec is
strict: the `Todo` schema has `additionalProperties: false`. The server returns an `ownerId`
field that the schema never declared. That is the deliberate mismatch, and apidrifter reports
it on every operation that returns a todo.

## Run it

```sh
npm install
npm start                      # http://localhost:3000
```

In a second terminal:

```sh
npx -y apidrifter run openapi.yaml --base-url http://localhost:3000 --format markdown
```

Values for the path parameter and the request body come from the `example` fields in
`openapi.yaml`, so no plan file is needed. If you remove those examples, run
`npx -y apidrifter plan openapi.yaml --out plan.json`, fill the slots, and pass
`--plan filled.json`.

## What it reports

```markdown
## Verification report

3 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (3)

- `response-forbidden-property` at `GET /todos > response 200 > application/json > /0/ownerId` (observation 1): response body at /0/ownerId: property "ownerId" is not allowed (and 1 more like it)
  - If the spec is the source of truth: Stop returning "ownerId" from GET /todos; the spec forbids unknown properties here.
  - If the implementation is the source of truth: Add "ownerId" to paths\["/todos"\].get.responses\["200"\].content\["application/json"\].schema.items.properties or allow additionalProperties.
- `response-forbidden-property` at `GET /todos/{id} > response 200 > application/json > /ownerId` (observation 2): response body at /ownerId: property "ownerId" is not allowed
  - If the spec is the source of truth: Stop returning "ownerId" from GET /todos/{id}; the spec forbids unknown properties here.
  - If the implementation is the source of truth: Add "ownerId" to paths\["/todos/{id}"\].get.responses\["200"\].content\["application/json"\].schema.properties or allow additionalProperties.
- `response-forbidden-property` at `POST /todos > response 201 > application/json > /ownerId` (observation 3): response body at /ownerId: property "ownerId" is not allowed
  - If the spec is the source of truth: Stop returning "ownerId" from POST /todos; the spec forbids unknown properties here.
  - If the implementation is the source of truth: Add "ownerId" to paths\["/todos"\].post.responses\["201"\].content\["application/json"\].schema.properties or allow additionalProperties.

---

Found with [apidrifter](https://apidrifter.com) v0.1.0
```

(The report's path separator is shown as `>` here to keep this file ASCII.)

Exit code 1, because `response-forbidden-property` is breaking: a client generated from this
spec with strict decoding rejects the response.

## Which side to fix

One mismatch, two fixes. If `ownerId` is meant to be public, the spec is wrong: add
`ownerId` to `components.schemas.Todo.properties` (and to `required`, since the server always
sets it). If it leaked out of the store by accident, the implementation is wrong: strip it
before `res.json(...)`. Do not reach for `additionalProperties: true`; that makes the report
quiet without making the contract true.

## Automation

- `CLAUDE.md` tells Claude Code (or any agent that reads it) to run this check after touching
  a route or the spec.
- `.cursor/rules/apidrifter.mdc` does the same for Cursor.
- `.github/workflows/apidrifter.yml` diffs `openapi.yaml` against the base branch with
  `apidrifter/action@v1` and runs the live check in a second job. With the mismatch in place
  the second job fails on purpose; fix one side and it goes green.
- `apidrifter.config.json` raises `response-undocumented-property` to a warning so an extra
  field is visible in CI even on schemas that allow additional properties.
