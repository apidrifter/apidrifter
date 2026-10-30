# Oracle harness

Compares the Driftwatch engine against [oasdiff](https://github.com/oasdiff/oasdiff) over
real, historical public OpenAPI documents. oasdiff is the test oracle, not a dependency:
every disagreement is a candidate fixture, and some disagreements are oasdiff being wrong.

Not run in CI. It downloads a binary and fetches specs from the network.

## What it does

1. Downloads a pinned oasdiff release for your platform and verifies its SHA-256 against
   the release's `checksums.txt`.
2. Fetches two historical revisions of a public spec from `raw.githubusercontent.com`.
3. Runs the built `@driftwatch/core` engine and `oasdiff changelog` over the pair.
4. Writes `work/<name>/report.md` listing changes only one tool reported, keyed by
   operation and change ID where IDs match, by operation alone where they do not.

## Usage

```
export PATH="$HOME/.nvm/versions/node/v24.22.1/bin:$PATH"   # or any Node >= 22.12
pnpm --filter @driftwatch/core build
tools/oracle/run.sh stripe <old-commit-sha> <new-commit-sha>
tools/oracle/run.sh github <old-commit-sha> <new-commit-sha>
```

Known spec sources (edit `run.sh` to add more):

| name   | repository                  | file                                            |
| ------ | --------------------------- | ----------------------------------------------- |
| stripe | stripe/openapi              | openapi/spec3.json                              |
| github | github/rest-api-description | descriptions/api.github.com/api.github.com.json |
| twilio | twilio/twilio-oai           | spec/json/twilio_api_v2010.json                 |

Pick two commits from the repository's history, at least a few weeks apart, so the pair
contains real breaking changes.

## Reading the report

- A change reported by oasdiff and not by us is a probable gap. Reproduce it as a small
  fixture under `packages/core/test/fixtures/openapi/`, then fix the engine.
- A change reported by us and not by oasdiff may be a gap in oasdiff or a deliberate
  difference in classification. Decide, and record the decision in the fixture's
  directory as `NOTES.md` if we keep ours.
- Severity disagreements are listed separately. Our polarity rules differ from oasdiff's
  on purpose in a few places (for example widening a response enum is a warning here).
