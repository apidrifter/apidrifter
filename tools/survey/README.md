# Survey

Runs the CLI against public APIs that publish their own OpenAPI document and records how the live API differs from it.

Rules of engagement, enforced by the runner:

- GET only. Operations are taken from the spec and filtered to `GET`; nothing else is ever sent.
- A request budget and a delay per target. One polite retry on 429, then stop.
- A User-Agent that names the survey.
- Only values we chose (`targets.json`) or examples the spec itself provides.
- Only credentials we own, passed through `headersFromEnv`. Never committed.

Findings in `results/` are raw engine output until a human marks each one `confirmed`, `disputed` or `our-bug`. Only confirmed findings are published anywhere, and small projects get a fixing pull request before anything is written about them.

```
pnpm --filter @driftwatch/core build && pnpm --filter driftwatch build
node tools/survey/run.mjs            # all targets
node tools/survey/run.mjs petstore   # one target
node tools/survey/report.mjs         # results/summary.md
```

`out/` holds specs, plans, observations and raw results and is not committed. `results/` is.
