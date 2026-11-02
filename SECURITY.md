# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability reporting on this repository ("Security" tab, "Report a vulnerability"). Do not open a public issue.

We will acknowledge a report within 3 business days and aim to ship a fix for confirmed high-severity issues within 14 days. We will credit reporters in the release notes unless they ask otherwise.

## Scope

- `@apidrifter/core`: parsing and diffing untrusted OpenAPI and MCP documents. Resource exhaustion, incorrect classification that hides a breaking change, and anything that lets a document influence output outside its own data fields are all in scope.
- `apidrifter` CLI: URL fetching, MCP server spawning, output rendering.
- Hosted service: authentication, tenancy isolation, SSRF in fetching and webhooks, secret handling, rate limiting.

## Design

The threat model and the controls for each component are documented in [docs/DESIGN.md](docs/DESIGN.md), section 7. Reports that show a control is missing or ineffective are the most useful kind.

## Supply chain

- Dependencies are pinned by lockfile and lifecycle scripts are disabled for all dependencies.
- Releases are published only from CI with npm provenance attestations.
- GitHub Actions are pinned by commit SHA.
