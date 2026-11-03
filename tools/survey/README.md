# Survey

Runs the CLI against public APIs that publish their own OpenAPI document and records how the live API differs from it.

Rules of engagement, enforced by the runner:

- GET only. Operations are taken from the spec and filtered to `GET`; nothing else is ever sent.
- A request budget and a delay per target. One polite retry on 429, then stop.
- A User-Agent that names the survey.
- Only values we chose (`targets.json`) or examples the spec itself provides.
- Only credentials we own, passed through `headersFromEnv`. Never committed.

Findings in `results/` are raw engine output until a human marks each one `confirmed`, `disputed` or `our-bug`. Only confirmed findings are published anywhere, and small projects get a fixing pull request before anything is written about them.

## Files

| File                | Role                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targets.json`      | Hand-curated targets with values, excludes and reviewer notes. The 2026-11 post.                                                                               |
| `surveyed.json`     | Every API id ever surveyed (target id and apis.guru id) with the month. Discovery never picks these again.                                                     |
| `candidates.json`   | The current automated month's targets, written by `discover.mjs`. Same shape as `targets.json` plus `auto: true`, `source: "apis.guru"` and provenance fields. |
| `post-template.mdx` | Template for the monthly draft post. `{{PLACEHOLDERS}}` are filled by `report.mjs`.                                                                            |
| `discover.mjs`      | Picks candidates from the apis.guru directory.                                                                                                                 |
| `run.mjs`           | Fetches specs, plans, fills, runs. Writes `out/[month/]<id>/`.                                                                                                 |
| `report.mjs`        | Classifies findings and writes `results/[month/]`, the draft post and the pull-request body.                                                                   |
| `inspect.mjs`       | Prints a few concrete examples per finding id for one target, for hand review.                                                                                 |
| `results/`          | Committed data. The top level is the 2026-11 post; `results/YYYY-MM/` is one automated month.                                                                  |
| `out/`              | Specs, plans, raw observations and results. Not committed.                                                                                                     |

## Hand-curated run (the 2026-11 post)

```
pnpm install --frozen-lockfile && pnpm build
node tools/survey/run.mjs            # all targets
node tools/survey/run.mjs petstore   # one target
node tools/survey/report.mjs         # results/summary.md and friends
node tools/survey/inspect.mjs petstore 3
```

## Monthly pipeline

`.github/workflows/research-monthly.yml` runs on the first of each month (and on demand with `month` and `limit` inputs) and opens a pull request on `research/YYYY-MM`. Nothing is published until that pull request is reviewed and merged.

1. `discover.mjs --limit 15 --seed YYYY-MM` reads `https://api.apis.guru/v2/list.json` and keeps APIs whose preferred version has a JSON spec, whose provider is not a cloud vendor or a known account-only API, that are not in `targets.json` (by host) or `surveyed.json` (by id), that declare an `https` base URL, and that `apidrifter plan` shows to have at least three GET operations with no security requirement whose required parameters all have an example or default. One GET to the base URL must get any HTTP response. The pool is shuffled with the seed, at most `--max-inspect` (300) specs are inspected with a delay between fetches, eligible APIs are ranked by fillable GET operations plus a bonus for well-known providers, and one API per provider is kept. Writes `candidates.json`.
2. `run.mjs --targets candidates.json --month YYYY-MM` runs each candidate with its budget (at most 25 requests, at least 750 ms apart) and writes `out/YYYY-MM/<id>/`. A target without `values` is filled from the spec's examples; operations that cannot be filled are skipped and listed in `unfillable.json`. A failing target gets an error row and never stops the run.
3. `report.mjs --month YYYY-MM --targets candidates.json` writes `results/YYYY-MM/` (`summary.json`, `summary.md`, `<id>.findings.json`, `<id>.observations.json`, `targets.json`), drops APIs with no successful response (nothing to check; usually an API that needs credentials after all), records every candidate in `surveyed.json`, writes the draft post `apps/web/src/content/research/public-api-spec-drift-YYYY-MM.mdx` with `draft: true` and `month: "YYYY-MM"`, and writes the pull-request body to `out/YYYY-MM/pr-body.md`.
4. `peter-evans/create-pull-request` commits the results directory, `candidates.json`, `surveyed.json` and the draft post, signed off as `apidrifter <apidrifter@gmail.com>`, and opens the pull request with the review checklist as its body.

Drafts are not built: every page, the RSS feed, the sitemap, `llms.txt` and `llms-full.txt` filter on `draft`. A post with `month` reads `tools/survey/results/<month>/` instead of the top level, so several survey posts coexist.

Pull requests opened with the default `GITHUB_TOKEN` do not trigger the CI workflow. Close and reopen the pull request, or push an empty commit, to get a CI run before merging.

## Review checklist (the only human step)

- Verify the first hard finding of each API by hand; the `curl` on each per-API page reproduces it. Hard findings are the ones a typed client would break on: wrong type, missing required field, forbidden field, disallowed null, wrong media type.
- Remove every API where our validator was wrong: delete its entry from `results/YYYY-MM/targets.json`, its two JSON files, and its row in `summary.json` (adjust `totals`). If the engine was wrong, open an issue with the finding.
- Replace each automated reviewer note in `summary.json` with what you confirmed. The note mentions the apis.guru mirror date; check that the provider's current document still says the same thing before blaming the API.
- Rewrite the headline, title and description in the post if the numbers changed; delete the Reviewer notes section.
- Set `draft: false`, then `cd apps/web && pnpm build && pnpm verify`.
- Small projects get a fixing pull request on their spec before the post is published.

## Running a month locally

```
pnpm install --frozen-lockfile && pnpm build
node tools/survey/discover.mjs --limit 15 --seed 2026-12          # or --list list.json for an offline copy
node tools/survey/run.mjs --targets tools/survey/candidates.json --month 2026-12
node tools/survey/report.mjs --month 2026-12 --targets tools/survey/candidates.json
cd apps/web && pnpm build
```

`run.mjs` accepts target ids as positionals to run a subset, and `report.mjs --skip-post` leaves the post alone. A post that is no longer a draft is never overwritten.
