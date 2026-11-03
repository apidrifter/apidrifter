# Examples

One minimal, runnable app per framework, each with three or four endpoints, its own OpenAPI 3
document, and one deliberate, documented mismatch between the two, so that running
apidrifter against it shows real findings. Each README has the exact commands and the report
the run produces.

| Example             | Spec comes from                                | The deliberate mismatch                                     | Finding                              |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| [express](express/) | Hand-written `openapi.yaml`                    | Server returns `ownerId`; strict schema does not declare it | `response-forbidden-property`        |
| [hono](hono/)       | `@hono/zod-openapi`, served at `/openapi.json` | Store has priority `urgent`; enum says low, medium, high    | `response-enum-violation`            |
| [fastify](fastify/) | `@fastify/swagger`, served at `/openapi.json`  | Route schema says 200; handler sends 201                    | `undocumented-status`                |
| [nestjs](nestjs/)   | `@nestjs/swagger`, served at `/openapi.json`   | DTO marks `dueDate` required; service sometimes omits it    | `response-missing-required-property` |
| [fastapi](fastapi/) | FastAPI, served at `/openapi.json`             | Model says `due_date: str`; a handler returns `null`        | `response-null-not-allowed`          |

Every example also carries the three pieces that make the check automatic:

- `CLAUDE.md`: the instructions paragraph from [docs/agents.md](../docs/agents.md), with the
  spec location and port filled in. Claude Code and other agents that read instructions
  files pick it up on their own.
- `.cursor/rules/apidrifter.mdc`: the same for Cursor, attached when a route or spec file is
  in context.
- `.github/workflows/apidrifter.yml`: a `spec-diff` job that runs
  [`apidrifter/action@v1`](../packages/action) against the base branch, and a `live-check`
  job that starts the app and runs `npx -y apidrifter run ... --fail-on breaking`. The
  workflows are written as if the example were the root of its own repository.
- `apidrifter.config.json`: a one-line severity override, to show where configuration goes.

The examples are not pnpm workspace members. Each has its own `package.json`
(or `requirements.txt`) and installs on its own with `npm install` (or `pip`); nothing in
them is needed to build or test apidrifter itself.

Guides that walk through each of these on the site:
[apidrifter.com/guides/](https://apidrifter.com/guides/).
