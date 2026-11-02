# Releasing

Packages are published to npm only from CI, with provenance attestations. Nobody publishes from a laptop.

## One-time setup

1. Create the npm organization `apidrifter` and require two-factor authentication for all members.
2. Publish the first version of `apidrifter` and `@apidrifter/core` once by hand from a machine with 2FA, so the package names exist and can be configured. (`pnpm changeset publish` after `pnpm build`.)
3. On each package's npm settings page, enable **Trusted publishing** for GitHub Actions: repository `apidrifter/apidrifter`, workflow `release.yml`, environment left empty. After that no `NPM_TOKEN` secret is needed; the workflow's `id-token` permission does the authentication.
4. In the npm package settings, set "Require two-factor authentication or an automation token" to the strictest option that still allows trusted publishing.

## Every release

1. Each user-facing change lands with a changeset (`pnpm changeset`), which records the bump type and a line for the changelog.
2. When changesets reach `main`, the Release workflow opens or updates a "Version packages" pull request.
3. Merging that pull request bumps versions, writes changelogs, and publishes. Provenance links the published tarball to the exact commit and workflow run.

## Versioning rules

- Rule IDs are public API: adding one is a minor, changing or removing one is a major.
- The CLI's exit codes and JSON output shape are public API.
- `@apidrifter/core` and `apidrifter` are versioned independently.

## MCP Registry

`apidrifter serve` is listed in the official MCP Registry as `com.apidrifter/apidrifter`, verified by DNS on apidrifter.com. The listing is metadata only; the registry checks that the published npm package carries `mcpName` equal to that name.

After each npm release of `apidrifter`:

1. Update `version` in both places in `packages/cli/server.json` to the released version (the version must match the npm package).
2. `cd packages/cli && mcp-publisher login dns --domain apidrifter.com --private-key <hex seed>` (one-time setup: generate an Ed25519 key, put its public key in a TXT record on apidrifter.com as `v=MCPv1; k=ed25519; p=<base64 public key>`, keep the private seed outside the repository).
3. `mcp-publisher publish`.

Verify with `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.apidrifter/apidrifter"`.
