# Watch: the daily API spec change feed

Fetches the published OpenAPI documents of well-known public APIs once a day, diffs each one
against yesterday's copy with the apidrifter CLI, and publishes the result on
https://apidrifter.com/changes/ (page, RSS, JSON Feed). Breaking changes can also be posted to X.
Zero-touch: nothing here is edited by hand after an API is added.

## How it works

```
watchlist.json  --snapshot.mjs-->  state/<id>.json.gz (+ .meta.json)   [branch watch-state]
                                   state/<id>.prev.json.gz             (only when bytes changed)
                --diff.mjs----->   changes/YYYY-MM-DD.json              [branch main]
                                   changes/index.json
                --post.mjs----->   X, one tweet per API with breaking changes (max 5/day)
                                   state/posted.json                    [branch watch-state]
apps/web        reads changes/ at build time -> /changes/, /changes/<id>/, rss.xml, feed.json
```

1. `snapshot.mjs --state <dir>` fetches every entry of `watchlist.json` with a named User-Agent,
   a 90 s timeout and a per-API byte cap (`maxBytes`, at most 40 MB). It sends `If-None-Match`
   when it has an ETag. JSON and YAML are parsed, Swagger 2.0 is converted to OpenAPI 3 with
   `swagger2openapi`, and the document is stored gzipped as JSON next to a small meta file
   (fetchedAt, sha256 of the fetched bytes, size, ETag, Last-Modified, `info.version`). When the
   sha256 differs from the stored one, the old files are renamed to `<id>.prev.*`. A failed fetch
   leaves that API untouched; the script exits non-zero only when every fetch failed.
2. `diff.mjs --state <dir>` runs `apidrifter diff prev cur --format json` for every API with a
   `.prev` snapshot, through the CLI so the engine's size, depth and reference limits and its
   output hygiene apply. Identical (rule, severity, subject, message) rows are collapsed with a
   count, sorted breaking first, and the first 50 are written to `changes/YYYY-MM-DD.json`
   together with the totals. The file is kept under about 200 KB by trimming the per-API lists
   evenly. A rerun on the same day replaces that API's entry. `.prev` files are deleted once
   recorded, so nothing is reported twice; an API whose diff failed keeps them and is retried.
   `changes/index.json` (last 90 days, counts only) is rebuilt and daily files older than 365
   days are pruned. A day without changes writes nothing.
3. `post.mjs --state <dir>` reads today's change file and posts up to 5 tweets, one per API with
   breaking changes, most breaking first, via X API v2 `POST /2/tweets` with OAuth 1.0a user
   context (signed with `node:crypto`, no extra dependency). `state/posted.json` records every
   `<date>/<id>` posted so reruns never double-post. Without the four secrets, or with
   `--dry-run`, it prints what it would post and exits 0.

Every string in the change files came from a third-party document. The site renders them through
Astro templates only (never `set:html`) and escapes them in the feeds.

## Branches

- `main` holds the code, `watchlist.json` and the derived `changes/` files. A commit here
  triggers the site deploy, which is how a new day reaches the website.
- `watch-state` is an orphan branch with no history in common with `main`. It holds the raw
  snapshots and `posted.json`, so multi-megabyte specs never land in the main history. The
  workflow checks it out into `.watch-state/` inside the main checkout and creates it on the
  first run if it is missing (`state-README.md` becomes its README). Deleting the branch is
  safe: the next run recreates it and diffs resume the day after.

The job commits as `apidrifter <apidrifter@gmail.com>` with sign-off. If branch protection on
`main` rejects pushes from `GITHUB_TOKEN`, add a fine-grained PAT with contents write access as
the `WATCH_PUSH_TOKEN` secret; the workflow uses it when present. GitHub disables scheduled
workflows after 60 days without repository activity; a manual `workflow_dispatch` re-enables it.

## Secrets

| Secret             | Used by  | Purpose                                                        |
| ------------------ | -------- | -------------------------------------------------------------- |
| `X_API_KEY`        | post.mjs | X app consumer key (OAuth 1.0a)                                |
| `X_API_SECRET`     | post.mjs | X app consumer secret                                          |
| `X_ACCESS_TOKEN`   | post.mjs | access token of the account that posts (needs write access)    |
| `X_ACCESS_SECRET`  | post.mjs | access token secret                                            |
| `WATCH_PUSH_TOKEN` | workflow | optional PAT when `main` is protected against the bot's pushes |

All optional. Without the X secrets the feed still runs; the post step logs a dry run.

## Adding an API

Append an object to `watchlist.json`:

```json
{
  "id": "example",
  "name": "Example API",
  "spec": "https://example.com/openapi.json",
  "homepage": "https://example.com/docs",
  "format": "openapi-3.0",
  "maxBytes": 20000000
}
```

- `id`: lowercase letters, digits and dashes; it becomes the URL `/changes/<id>/`.
- `spec`: an `https://` URL the API's owner maintains, returning the whole document (bundled;
  a root file with external `$ref`s diffs as an empty document). Raw files from the publisher's
  GitHub repository are ideal because they come with ETags.
- `format`: a hint for the page (`openapi-3.0`, `openapi-3.1`, `swagger-2.0`); detection is by
  content.
- `maxBytes`: cap on the fetched size, at most 40000000.

Check the URL once with `node tools/watch/snapshot.mjs --state /tmp/watch --only example`. The
per-API page exists from the next deploy; its first diff appears the day after the first snapshot.

## Running locally

```sh
pnpm install --frozen-lockfile
pnpm build                                            # the CLI at packages/cli/dist/bin.js
node tools/watch/snapshot.mjs --state /tmp/watch      # all APIs, or --only <id>
node tools/watch/snapshot.mjs --state /tmp/watch      # again later: changed specs get .prev files
node tools/watch/diff.mjs --state /tmp/watch          # writes tools/watch/changes/<today>.json
node tools/watch/post.mjs --state /tmp/watch --dry-run
cd apps/web && pnpm build && pnpm verify              # the pages read tools/watch/changes
```

To seed history from archived versions of one spec (how the first change file was made, from
two commits of the Discord spec), point `--only <id>` at an older URL and then at a newer one:

```sh
node tools/watch/snapshot.mjs --state /tmp/watch --only discord --url https://raw.githubusercontent.com/discord/discord-api-spec/<old-sha>/specs/openapi.json
node tools/watch/snapshot.mjs --state /tmp/watch --only discord --url https://raw.githubusercontent.com/discord/discord-api-spec/<new-sha>/specs/openapi.json
node tools/watch/diff.mjs --state /tmp/watch
```

`diff.mjs --date YYYY-MM-DD` writes to a different day file; `--only <id>` limits either script to
one API.
