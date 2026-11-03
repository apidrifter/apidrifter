---
"@apidrifter/core": minor
"apidrifter": minor
---

Markdown reports end with a `Found with apidrifter vX.Y.Z` line. `renderMarkdown` and `renderVerifyMarkdown` take a `footer` option (`{ version }` or `false`); the config file accepts `footer: false`; the CLI adds `--no-footer`. The `run_requests` and `verify_observations` MCP tools return a `markdown` report alongside the structured result.
