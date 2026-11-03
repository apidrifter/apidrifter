# watch-state

Machine-written branch. It holds the latest snapshot of every OpenAPI document watched by
`tools/watch` on `main`, so the daily job can diff today's version against yesterday's:

- `<id>.json.gz`: the spec as JSON (Swagger 2.0 already converted to OpenAPI 3), gzipped
- `<id>.meta.json`: when it was fetched, sha256 and size of the fetched bytes, ETag and Last-Modified
- `<id>.prev.json.gz` / `<id>.prev.meta.json`: the previous version, present only between a
  snapshot that saw a change and the diff that recorded it
- `posted.json`: which (day, API) pairs were already posted to X

It has no common history with `main` and is never merged. The daily job
(`.github/workflows/watch-daily.yml`) is the only writer; the derived change files live on `main`
under `tools/watch/changes`. If this branch grows too large, it is safe to delete it: the next run
recreates it and starts diffing again the day after.
