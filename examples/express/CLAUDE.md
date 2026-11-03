# Express example

Spec: `openapi.yaml` (hand-written). Start the app with `npm start`; it listens on port 3000.

## API contract checks

When you add or change an HTTP endpoint or an OpenAPI document, verify the implementation
against the spec before opening a pull request:

1. Start the service locally and note its port.
2. Run `npx -y apidrifter plan openapi.yaml --out plan.json` to see which parameter and body
   values the engine cannot infer, and write a filled plan with realistic values from the
   codebase.
3. Run `npx -y apidrifter run openapi.yaml --base-url http://localhost:3000 --plan filled.json --format markdown`.
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
