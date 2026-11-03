# NestJS + @nestjs/swagger

A four-endpoint NestJS app (`src/`) whose OpenAPI document is generated from its decorators
by `@nestjs/swagger` and served at `/openapi.json` (Swagger UI at `/docs`). `@ApiProperty()`
marks a DTO property required unless told otherwise, so `TodoDto.dueDate` is required in
the document; the service only sets `dueDate` when it has one, so some responses omit it.
That is the deliberate mismatch, and apidrifter reports it as
`response-missing-required-property`.

## Run it

```sh
npm install
npm start                      # tsc, then http://localhost:3000, spec at /openapi.json
```

In a second terminal:

```sh
npx -y apidrifter run http://localhost:3000/openapi.json --base-url http://localhost:3000 --format markdown
```

Plain `http://` is accepted for localhost only. `npm run spec` writes the same document to
`openapi.json` so CI can diff it against the previous version; the committed copy is that
snapshot.

The path parameter has an `example` in `@ApiParam` and the request body has one in
`@ApiBody`, so no plan file is needed. Without them, run
`npx -y apidrifter plan http://localhost:3000/openapi.json --out plan.json`, fill the slots,
and pass `--plan filled.json`.

## What it reports

```markdown
## Verification report

2 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (2)

- `response-missing-required-property` at `GET /todos > response 200 > application/json > /1/dueDate` (observation 1): response body at /1/dueDate: required property "dueDate" is missing
  - If the spec is the source of truth: Include "dueDate" in the 200 response of GET /todos.
  - If the implementation is the source of truth: Remove "dueDate" from required at paths\["/todos"\].get.responses\["200"\].content\["application/json"\].schema.items.
- `response-missing-required-property` at `GET /todos/{id} > response 200 > application/json > /dueDate` (observation 2): response body at /dueDate: required property "dueDate" is missing
  - If the spec is the source of truth: Include "dueDate" in the 200 response of GET /todos/{id}.
  - If the implementation is the source of truth: Remove "dueDate" from required at paths\["/todos/{id}"\].get.responses\["200"\].content\["application/json"\].schema.

---

Found with [apidrifter](https://apidrifter.com) v0.1.0
```

(The report's path separator is shown as `>` here to keep this file ASCII.)

Exit code 1: a missing required property is breaking, because a generated client treats
the field as non-optional.

## Which side to fix

A todo without a due date is a legitimate state, so the implementation is the source of
truth and the DTO is wrong: change the decorator in `src/todo.dto.ts` to
`@ApiProperty({ required: false, ... })` (or `@ApiPropertyOptional`) and the document
regenerates with `dueDate` out of `required`. If the product rule were "every todo has a due
date", the service would be wrong instead and `create()` should refuse a missing one. The
finding does not know which; the person or agent who made the change does.

## Automation

- `CLAUDE.md` tells Claude Code (or any agent that reads it) to run this check after touching
  a controller or a DTO.
- `.cursor/rules/apidrifter.mdc` does the same for Cursor.
- `.github/workflows/apidrifter.yml` checks that the committed `openapi.json` snapshot is
  current, diffs it against the base branch with `apidrifter/action@v1`, and runs the live
  check in a second job. With the mismatch in place the live job fails on purpose.
- `apidrifter.config.json` raises `response-undocumented-property` to a warning so an extra
  field is visible in CI; NestJS does not set `additionalProperties: false`, so without it
  an extra field is only an info finding.
