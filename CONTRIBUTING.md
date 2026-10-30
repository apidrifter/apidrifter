# Contributing

Thanks for helping. A few things that keep this project easy to maintain.

## Before you start

Read [docs/DESIGN.md](docs/DESIGN.md). It is short and it is the standing opinion on how the project is built. If your change disagrees with it, open an issue to discuss the design first; that is cheaper for everyone than a pull request that cannot land.

## Setup

```
pnpm install
pnpm build
pnpm test
```

Node 22 or newer and pnpm 10 or newer.

## Rules of the road

- Every change to the engine ships with a fixture: a pair of documents and the expected change list. See `packages/core/test/fixtures`.
- New change IDs are documented in the rules table in code; `docs/rules.md` is generated from it.
- Existing change IDs are never renamed or given a different meaning. Deprecate and add a new one.
- The core package does no I/O. If your change needs the filesystem or the network, it belongs in the CLI or an app.
- Run `pnpm lint` and `pnpm typecheck` before pushing.

## Sign your commits

We use the [Developer Certificate of Origin](https://developercertificate.org/). Add `-s` to `git commit` to sign off. No contributor license agreement.

## Releases

Add a changeset with `pnpm changeset` describing the user-facing change. Maintainers publish from CI.
