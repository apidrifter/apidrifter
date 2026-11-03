# Upstream issues

Ready-to-file issues for projects whose published OpenAPI document and live API disagree, taken from the survey in `tools/survey/results` and the research post at https://apidrifter.com/research/public-api-spec-drift-2026-11/.

| File                         | Upstream                                   | Where to file                                                                                    |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [discourse.md](discourse.md) | Discourse, spec generated from rswag specs | https://meta.discourse.org (category "bug") or the discourse/discourse tracker if directed there |
| [gitlab.md](gitlab.md)       | GitLab, OpenAPI generated from Grape       | https://gitlab.com/gitlab-org/gitlab/-/issues/new                                                |
| [apis-guru.md](apis-guru.md) | APIs.guru directory API v2                 | https://github.com/APIs-guru/openapi-directory/issues/new                                        |

## When to file

After the research post is public and the per-API pages resolve, so the "found with" link in each issue works. File them the same day the post goes live, before any launch copy that names the project, so maintainers hear it from us first.

## Who files

The author files from the `apidrifter` GitHub account (and the matching meta.discourse.org account for Discourse), not a personal account. One issue per project, with the text as written; adjust only the parts marked for the filer. Do not file the same report in two places.

## Rules

- Every mismatch quoted here is a `strict` finding of the body class ("hard" in the summary table): wrong type, required field missing, forbidden field, or a null the schema does not allow. Nothing from the undocumented-status family is included; those are about missing error documentation, not drift.
- Each issue reproduces with plain `curl` against a public, read-only endpoint. Re-run the reproduction right before filing; if it no longer reproduces, do not file, and mark the finding `disputed` in the results file instead.
- Say which side we think should change and why, and offer a pull request. Do not promise a date.
- Keep the apidrifter mention to one line with the link. The issue is about their API, not our tool.
- If a maintainer disputes a finding, update the finding's `review` field in `tools/survey/results` and, if they are right, the research post, in that order.
