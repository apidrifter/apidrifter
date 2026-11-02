# Apidrifter GitHub Action

Thin wrapper over the `apidrifter` CLI. Runs `changelog` into the job summary, runs `diff` with `--fail-on`, and optionally posts the changelog as a pull request comment.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 2
- run: git show HEAD~1:openapi.yaml > openapi.before.yaml
- uses: <org>/apidrifter/packages/action@main
  with:
    before: openapi.before.yaml
    after: openapi.yaml
    fail-on: breaking
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Inputs: `before`, `after` (required), `fail-on` (default `breaking`), `config`, `version` (CLI version to run), `github-token` (omit to skip the comment). Output: `breaking`, the number of breaking changes.

The action needs `pull-requests: write` permission only when `github-token` is set.
