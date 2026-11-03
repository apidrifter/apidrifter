# apidrifter

## 0.2.0

### Minor Changes

- bad456e: Initial public release: polarity-aware OpenAPI and MCP diffing, verification of live implementations against specs with two-sided fixes, CLI with plan/run/verify/serve, and an MCP server mode.
- 8efd24c: Markdown reports end with a `Found with apidrifter vX.Y.Z` line. `renderMarkdown` and `renderVerifyMarkdown` take a `footer` option (`{ version }` or `false`); the config file accepts `footer: false`; the CLI adds `--no-footer`. The `run_requests` and `verify_observations` MCP tools return a `markdown` report alongside the structured result.

### Patch Changes

- Updated dependencies [bad456e]
- Updated dependencies [8efd24c]
  - @apidrifter/core@0.2.0
