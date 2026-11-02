---
title: "We checked 13 public APIs against their own OpenAPI specs. 9 had hard mismatches."
description: "A read-only survey of public APIs that publish a spec: what their live responses actually return, classified strictly, with every request reproducible."
date: 2026-11-02
survey: true
draft: false
---

Every API that publishes an OpenAPI document is making a promise: send this, get that back. Generated clients, typed SDKs, mocks and contract tests all depend on it. We wanted to know how often the promise holds, so we pointed [API Drifter](/) at thirteen public APIs that publish their own spec, sent one read-only request per operation, and compared what came back to what the document said.

The short answer: nine of the thirteen returned at least one successful response that a client generated from their own spec would choke on.

## What we counted, and what we did not

Numbers like this are easy to inflate, so the strict rules first.

A finding only counts as **hard** when a typed client generated from the spec would break on it: a field with the wrong type, a required field missing, a field present where the schema forbids unknown fields, a null where the schema does not allow null, or a success response in a media type the spec does not list. Nothing else is in the headline number.

Three categories are reported separately and deliberately kept out of it:

- **Undocumented fields.** OpenAPI allows extra properties unless a schema says `additionalProperties: false`. An extra field is a documentation gap, not a violation.
- **Undocumented error statuses.** We sent no credentials, so we received 401, 403 and 429 responses that the specs do not mention. Almost no spec documents those, and nobody treats that as drift.
- **Our own mistakes.** A handful of requests used values that violated the spec's constraints. Those are our fault and are labeled as such.

We also found one false positive in our own validator during review, in how OpenAPI 3.0's `nullable: true` combines with `oneOf`. We fixed it, added a test, and re-verified every API from the recorded responses before writing this.

## Results

The table below is generated from the survey data. Each row links to the full findings, where every finding carries the exact request we sent, the status we got, the location in the response body, and two suggested fixes: one if the spec is the source of truth, one if the implementation is.

<!-- survey-table -->

## The ones worth reading

**Discourse** publishes a spec generated from its own test fixtures, and it has drifted furthest from the live site. Topic tags come back as objects where the spec says strings. Category `custom_fields` carries plugin keys that the schema forbids with `additionalProperties: false`. Several fields the spec marks required only appear for logged-in users. None of this is subtle, and all of it would break a generated client on the first page it fetched.

**Wikimedia's REST API** returns an array from its lint endpoint where the spec says object, its media lists carry `leadImage` and `srcset` fields the spec has never heard of, and its 400 errors come back as plain `application/json` rather than the documented `application/problem+json`.

**GitLab's** generated OpenAPI document declares several list endpoints as returning an object. They return arrays. The namespace `parent_id` is null for top-level groups, and the spec does not allow null.

**APIs.guru**, the directory most of us use to find specs, documents its per-API endpoint as returning an index entry with `preferred` and `versions`. It returns the full OpenAPI document instead.

**Gitea and Forgejo** serve their own Swagger 2.0 documents, and Swagger 2.0 has no way to say a field can be null. The live API returns null for nested objects constantly. That is less an API that drifted than a spec format that cannot describe the API, which is its own kind of problem for anyone generating a client from it.

**Swagger Petstore**, the reference demo for the whole format, returns a plain-text session string under an `application/json` content type on login.

**GitHub** is the one we cannot yet report properly. The first pass found gist files with a null `language` the spec forbids, and event payloads matching two `oneOf` branches at once. The second pass hit the anonymous rate limit after nine successful responses, so GitHub's row understates it until we rerun with a token.

## What this does and does not show

It shows that published specs and live behavior disagree often enough that checking is worth automating, and that the disagreements are the kind that break real clients, not pedantry about descriptions.

It does not show a rate. Thirteen APIs chosen because they publish a spec, one request per operation, read-only, no credentials, is a sample, not a measurement. Treat the nine of thirteen as "common," not as a percentage.

## Method

- One `GET` per operation, values from the spec's own examples or a small hand-written set per API, listed in the open-source target file.
- A delay between requests, a User-Agent naming the survey, one polite retry on 429, and a hard request budget per API.
- Swagger 2.0 documents were converted to OpenAPI 3 before checking.
- Every request, status and finding is in the repository. The tool, the runner and the targets are open source, so anyone can rerun it.

If you maintain one of these APIs and a finding is wrong, we want to know. If it is right, we are opening fixing pull requests on the smaller specs first.
