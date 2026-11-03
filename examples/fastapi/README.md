# FastAPI

A four-endpoint FastAPI app (`main.py`). FastAPI generates the OpenAPI document from the
type annotations and serves it at `/openapi.json`. The `Todo` model declares `due_date` as
a string; the store has a row whose `due_date` is `None`, and two handlers return a
`JSONResponse` built from the raw row, which skips `response_model` validation. That is the
deliberate mismatch, and apidrifter reports it as `response-null-not-allowed`.

## Run it

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000   # http://localhost:8000, spec at /openapi.json
```

In a second terminal (Node 22.12 or newer for `npx`):

```sh
npx -y apidrifter run http://localhost:8000/openapi.json --base-url http://localhost:8000 --format markdown
```

Plain `http://` is accepted for localhost only. `python export_spec.py > openapi.json`
writes the same document to a file so CI can diff it against the previous version; the
committed copy is that snapshot.

The path parameter has `examples=[2]` in its `Path(...)` and the request body model has a
`json_schema_extra` example, so no plan file is needed. Without them, run
`npx -y apidrifter plan http://localhost:8000/openapi.json --out plan.json`, fill the slots,
and pass `--plan filled.json`.

## What it reports

```markdown
## Verification report

2 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (2)

- `response-null-not-allowed` at `GET /todos > response 200 > application/json > /1/due_date` (observation 1): response body at /1/due\_date: value is null but the schema does not allow null
  - If the spec is the source of truth: Return a non-null value in response body at /1/due\_date.
  - If the implementation is the source of truth: Allow null at paths\["/todos"\].get.responses\["200"\].content\["application/json"\].schema.items.properties\["due\_date"\] (add "null" to type, or nullable: true in OpenAPI 3.0).
- `response-null-not-allowed` at `GET /todos/{todo_id} > response 200 > application/json > /due_date` (observation 2): response body at /due\_date: value is null but the schema does not allow null
  - If the spec is the source of truth: Return a non-null value in response body at /due\_date.
  - If the implementation is the source of truth: Allow null at paths\["/todos/{todo\_id}"\].get.responses\["200"\].content\["application/json"\].schema.properties\["due\_date"\] (add "null" to type, or nullable: true in OpenAPI 3.0).

---

Found with [apidrifter](https://apidrifter.com) v0.1.0
```

(The report's path separator is shown as `>` here to keep this file ASCII.)

Exit code 1: a null the schema forbids is breaking, because a generated client decodes the
field into a non-optional string.

## Which side to fix

A todo without a due date is a legitimate state, so the implementation is the source of
truth and the model is wrong: change `due_date: str` to `due_date: str | None = None` in
`Todo` and FastAPI regenerates the document with `anyOf: [string, null]`. If every todo must
have a due date, the store is wrong, and the handlers should go back to returning the row
through `response_model` so FastAPI rejects a bad row instead of serving it. Either way,
bypassing `response_model` with a raw `JSONResponse` is what let the drift out; apidrifter
is the check that catches it from the outside.

## Automation

- `CLAUDE.md` tells Claude Code (or any agent that reads it) to run this check after touching
  a route or a model.
- `.cursor/rules/apidrifter.mdc` does the same for Cursor.
- `.github/workflows/apidrifter.yml` checks that the committed `openapi.json` snapshot is
  current, diffs it against the base branch with `apidrifter/action@v1`, and runs the live
  check in a second job. With the mismatch in place the live job fails on purpose.
- `apidrifter.config.json` raises `response-undocumented-property` to a warning so an extra
  field is visible in CI; Pydantic models do not set `additionalProperties: false` by
  default, so without it an extra field is only an info finding.
