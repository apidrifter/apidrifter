# GitLab: OpenAPI document declares list endpoints as `object`; the API returns arrays, and `namespace.parent_id` is null but not nullable

File at: https://gitlab.com/gitlab-org/gitlab/-/issues/new (type: Issue, label `~"documentation"` and `~"api"` if available).

---

**Title:** OpenAPI document (`doc/api/openapi/openapi_v3.yaml`) declares list endpoints as `object` where the API returns arrays; `namespace.parent_id` is null but not nullable

## Summary

The published OpenAPI document, `doc/api/openapi/openapi_v3.yaml` (served from https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/api/openapi/openapi_v3.yaml and generated from the Grape API definitions), disagrees with what gitlab.com returns on three read-only, unauthenticated requests. A client generated from the document fails on each of them. The API behavior looks correct and long-standing; the document is what needs to change.

## Mismatches

### 1. `GET /api/v4/projects/{id}/issues` returns an array; the document says `object`

Finding, as reported by the checker: `the response body: expected "object" but got array`

- If the spec is right: `Return "object" in the response body.`
- If the implementation is right: `Change the type at paths["/api/v4/projects/{id}/issues"].get.responses["200"].content["application/json"].schema to "array".`

Observed: HTTP 200, `application/json`, body is a JSON array of issue objects.

### 2. `GET /api/v4/projects/{id}/repository/contributors` returns an array; the document says `object`

Finding: `the response body: expected "object" but got array`

- If the spec is right: `Return "object" in the response body.`
- If the implementation is right: `Change the type at paths["/api/v4/projects/{id}/repository/contributors"].get.responses["200"].content["application/json"].schema to "array".`

Observed: HTTP 200, `application/json`, body is a JSON array of `{name, email, commits, additions, deletions}` objects.

### 3. `GET /api/v4/projects/{id}` returns `namespace.parent_id: null`; the document says `integer` and does not allow null

Finding: `response body at /namespace/parent_id: value is null but the schema does not allow null`

- If the spec is right: `Return a non-null value in response body at /namespace/parent_id.`
- If the implementation is right: `Allow null at paths["/api/v4/projects/{id}"].get.responses["200"].content["application/json"].schema.properties["namespace"].properties["parent_id"] (add "null" to type, or nullable: true in OpenAPI 3.0).`

Observed: HTTP 200, `"parent_id": null` for a project in a top-level group (which has no parent by definition).

## Reproduce

Read-only, no token. Project 278964 is `gitlab-org/gitlab`.

```sh
# 1. First byte is "[" (array), the document says object
curl -s 'https://gitlab.com/api/v4/projects/278964/issues?state=all&per_page=1' | head -c 1; echo

# 2. Same
curl -s 'https://gitlab.com/api/v4/projects/278964/repository/contributors?per_page=1' | head -c 1; echo

# 3. parent_id is null for a top-level namespace
curl -s 'https://gitlab.com/api/v4/projects/278964' | grep -o '"parent_id":[^,}]*'
```

The same three show up when the document is run against gitlab.com with `apidrifter run openapi_v3.yaml --base-url https://gitlab.com`; gitlab.com rate-limits anonymous clients after about a dozen calls, so the survey covered only 15 operations.

## Which side should change

The implementation. Returning an array from a list endpoint is the documented behavior in the REST API docs and what every existing client expects; the `object` type is an artifact of the generator (the `success` entity in the Grape `desc` block is not marked `is_array: true`, so grape-swagger emits the entity's object schema instead of an array of it). `parent_id` being null for a top-level group is also documented behavior. So the fixes are in the document: `is_array: true` on the two list endpoints' success entities, and `nullable: true` (or `type: [integer, "null"]`) on `namespace.parent_id`. There are very likely more list endpoints with the same `is_array` omission; these are the three the survey reached before the rate limit.

Found with apidrifter; the full list of requests sent and findings for gitlab.com is at https://apidrifter.com/research/public-api-spec-drift-2026-11/gitlab/.

Happy to open a merge request for the Grape annotations if that is the right place to fix it; a pointer to how the document is regenerated would help.
