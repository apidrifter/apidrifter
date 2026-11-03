# Discourse: published OpenAPI document (docs.discourse.org) disagrees with meta.discourse.org on nullability, integer fields and `custom_fields`

File at: https://meta.discourse.org, category "bug" (the API docs are generated from the rswag request specs under `spec/requests/api/` in discourse/discourse and published to https://docs.discourse.org/openapi.json; if the team prefers a GitHub issue, move it there). File from the apidrifter account on meta.

---

**Title:** OpenAPI document at docs.discourse.org: `permission` is null but not nullable, `flair_group_id` is an integer documented as string, `custom_fields` forbids keys the site returns

## Summary

The OpenAPI document published at https://docs.discourse.org/openapi.json is generated from the rswag request specs, and several response schemas reflect the fixture values those specs happened to produce rather than what a live site returns. On meta.discourse.org, three read-only unauthenticated requests return bodies that a client generated from the document rejects. The live site looks right in every case; the schemas are what should change.

## Mismatches

### 1. `GET /site.json` (and `GET /categories.json`): `categories[].permission` is null; the schema says `integer` with no null allowed

Finding: `response body at /categories/0/permission: value is null but the schema does not allow null (and 43 more like it)`

- If the spec is right: `Return a non-null value in response body at /categories/0/permission.`
- If the implementation is right: `Allow null at paths["/site.json"].get.responses["200"].content["application/json"].schema.properties["categories"].items.properties["permission"] (add "null" to type, or nullable: true in OpenAPI 3.0).`

Observed: HTTP 200, `application/json; charset=utf-8`; `permission` is `null` on every category in the `categories` array for an anonymous request (the fixture user in the generating spec is logged in, so it saw an integer). The `permission` strings the grep also prints come from other objects in `site.json`, not from `categories`.

### 2. `GET /posts.json`: `latest_posts[].flair_group_id` and `reply_to_post_number` are integers; the schema says `null` or `string`

Finding: `response body at /latest_posts/0/flair_group_id: expected "null, string" but got integer (and 32 more like it)`

- If the spec is right: `Return "null, string" in response body at /latest_posts/0/flair_group_id.`
- If the implementation is right: `Change the type at paths["/posts.json"].get.responses["200"].content["application/json"].schema.properties["latest_posts"].items.properties["flair_group_id"] to "integer".`

Same for `reply_to_post_number`: `expected "null, string" but got integer (and 24 more like it)`, fix `Change the type at ...properties["reply_to_post_number"] to "integer".` In the fixtures both were null, so the generator recorded `null, string`; the live values are integer ids and post numbers.

### 3. `GET /c/{id}/show.json`: `category.custom_fields` has `additionalProperties: false` but carries plugin keys

Finding: `response body at /category/custom_fields/enable_accepted_answers: property "enable_accepted_answers" is not allowed` (six more of the same shape: `activity_pub_default_visibility`, `activity_pub_post_object_type`, `activity_pub_publication_type`, `enable_open_filter`, `enable_unassigned_filter`, `prioritize_open_filter`).

- If the spec is right: `Stop returning "enable_accepted_answers" from GET /c/{id}/show.json; the spec forbids unknown properties here.`
- If the implementation is right: `Add "enable_accepted_answers" to paths["/c/{id}/show.json"].get.responses["200"].content["application/json"].schema.properties["category"].properties["custom_fields"].properties or allow additionalProperties.`

`custom_fields` is by design an open map that plugins write to, so `additionalProperties: false` cannot be right for it on any site with plugins. The same closed schema makes `custom_fields` itself a forbidden key on `GET /categories.json` (`property "custom_fields" is not allowed (and 9 more like it)`).

## Reproduce

Read-only, anonymous. Please keep the User-Agent so the requests are attributable.

```sh
UA='apidrifter-report (+https://apidrifter.com)'

# 1. permission is null on every category for anonymous
curl -s -A "$UA" https://meta.discourse.org/site.json | grep -o '"permission":[^,}]*' | sort | uniq -c

# 2. flair_group_id and reply_to_post_number are integers
curl -s -A "$UA" https://meta.discourse.org/posts.json | grep -o '"flair_group_id":[^,}]*' | sort | uniq -c
curl -s -A "$UA" https://meta.discourse.org/posts.json | grep -o '"reply_to_post_number":[^,}]*' | sort | uniq -c

# 3. plugin keys inside custom_fields
curl -s -A "$UA" https://meta.discourse.org/c/1/show.json | grep -o '"custom_fields":{[^}]*}'
```

## Which side should change

The document. The live responses are what every client already consumes, and each mismatch traces to a fixture value in the generating spec (an anonymous `permission`, a null `flair_group_id`, a category with no plugin fields). Suggested fixes in the rswag specs: `nullable: true` on `permission` (or make the response examples cover the anonymous case), `type: integer` with `nullable: true` for `flair_group_id` and `reply_to_post_number`, and `additionalProperties: true` (or no `additionalProperties` at all) on `custom_fields`. A related but softer point: several fields marked required in the schemas, such as `category.available_groups` on `GET /c/{id}/show.json`, only appear for logged-in users; those should be optional or documented as such.

Found with apidrifter; every request sent to meta.discourse.org and every finding is at https://apidrifter.com/research/public-api-spec-drift-2026-11/discourse-meta/.

Happy to open a pull request against the rswag specs for the three schemas above if that is welcome.
