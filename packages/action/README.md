# Apidrifter GitHub Action

Thin wrapper over the `apidrifter` CLI. Runs `changelog` into the job summary, runs `diff` with `--fail-on`, and optionally posts the changelog as a pull request comment.

This directory is mirrored to [apidrifter/action](https://github.com/apidrifter/action) on every release so the action can be used as `apidrifter/action@v1`; see `docs/RELEASING.md`.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 2
- run: git show HEAD~1:openapi.yaml > openapi.before.yaml
- uses: apidrifter/action@v1
  with:
    before: openapi.before.yaml
    after: openapi.yaml
    fail-on: breaking
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Inputs: `before`, `after` (required), `fail-on` (default `breaking`), `config`, `version` (npm version or dist-tag of the CLI to run, default `latest`), `github-token` (omit to skip the comment). Output: `breaking`, the number of breaking changes.

The action needs `pull-requests: write` permission only when `github-token` is set.
