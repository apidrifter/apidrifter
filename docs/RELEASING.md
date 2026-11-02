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
