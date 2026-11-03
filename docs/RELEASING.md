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

## GitHub Action mirror

The composite action in `packages/action` is used as `apidrifter/action@v1`. GitHub only lists an action on the Marketplace when `action.yml` sits at the root of its own repository, so `.github/workflows/sync-action.yml` force-pushes the contents of `packages/action` (plus `LICENSE`) to the `main` branch of `apidrifter/action`, then moves the `v1` major tag and creates a `vX.Y.Z` release there.

One-time setup:

1. Create the empty public repository `apidrifter/action` (no README, no license; the sync writes both). Set its description to "Fail CI on breaking OpenAPI and MCP changes" and the website to https://apidrifter.com.
2. Create a fine-grained personal access token scoped to the `apidrifter/action` repository only, with **Contents: read and write** (release creation is covered by Contents). Set an expiry and put a reminder in the calendar.
3. Add it to `apidrifter/apidrifter` as the repository secret `ACTION_SYNC_TOKEN`.
4. Run the workflow once by hand (Actions, "Sync GitHub Action", "Run workflow", version `0.1.0`) and check that `apidrifter/action` has `main`, the `v1` and `v0.1.0` tags and a release.
5. On the release page of `apidrifter/action`, tick "Publish this Action to the GitHub Marketplace" once; later releases created by the workflow keep the listing current.

Every release: after the CLI is published, push the tag `vX.Y.Z` (matching the `apidrifter` package version) on `apidrifter/apidrifter`, or run the workflow by hand with that version. The action's `version` input defaults to `latest`, so the mirror only needs to move when `action.yml` itself changes, but tagging every release keeps the two in step.

## MCP Registry

`apidrifter serve` is listed in the official MCP Registry as `com.apidrifter/apidrifter`, verified by DNS on apidrifter.com. The listing is metadata only; the registry checks that the published npm package carries `mcpName` equal to that name.

After each npm release of `apidrifter`:

1. Update `version` in both places in `packages/cli/server.json` to the released version (the version must match the npm package).
2. `cd packages/cli && mcp-publisher login dns --domain apidrifter.com --private-key <hex seed>` (one-time setup: generate an Ed25519 key, put its public key in a TXT record on apidrifter.com as `v=MCPv1; k=ed25519; p=<base64 public key>`, keep the private seed outside the repository).
3. `mcp-publisher publish`.

Verify with `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.apidrifter/apidrifter"`.
