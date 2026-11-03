# APIs.guru: v2 API spec documents `API` entries where the live endpoints return `ApiVersion` objects

File at: https://github.com/APIs-guru/openapi-directory/issues/new. The spec source is `APIs/apis.guru/2.2.0/openapi.yaml` in that repository; it is served at https://api.apis.guru/v2/openapi.yaml.

---

**Title:** v2 spec: `GET /specs/{provider}/{api}.json` and `GET /{provider}.json` document the `API` schema but return `ApiVersion`-shaped objects

## Summary

The APIs.guru v2 OpenAPI document (`info.version: 2.2.0`) describes `GET /specs/{provider}/{api}.json` as returning `#/components/schemas/API` (`added`, `preferred`, `versions`, with `additionalProperties: false`). The live endpoint returns an object with the shape of `#/components/schemas/ApiVersion` (`added`, `updated`, `info`, `swaggerUrl`, `swaggerYamlUrl`, `openapiVer`, `link`, `externalDocs`). `GET /{provider}.json` is documented as the `APIs` map keyed by API id, but returns `{ "apis": { "<id>": <ApiVersion-shaped object> } }`. Because `API` has `additionalProperties: false`, a client generated from the document rejects both responses outright rather than ignoring extra fields.

## Mismatches

All observed on `GET /specs/apis.guru/2.2.0.json` and `GET /apis.guru.json`, HTTP 200, `application/json`, no credentials.

### 1. `GET /specs/{provider}/{api}.json`: required `preferred` and `versions` are missing

Finding: `response body at /preferred: required property "preferred" is missing` (and the same for `versions`).

- If the spec is right: `Include "preferred" in the 200 response of GET /specs/{provider}/{api}.json.`
- If the implementation is right: `Remove "preferred" from required at paths["/specs/{provider}/{api}.json"].get.responses["200"].content["application/json"].schema.`

### 2. `GET /specs/{provider}/{api}.json`: `info`, `updated`, `swaggerUrl`, `swaggerYamlUrl`, `openapiVer`, `link`, `externalDocs` are present but forbidden

Finding (one of seven of the same shape): `response body at /info: property "info" is not allowed`

- If the spec is right: `Stop returning "info" from GET /specs/{provider}/{api}.json; the spec forbids unknown properties here.`
- If the implementation is right: `Add "info" to paths["/specs/{provider}/{api}.json"].get.responses["200"].content["application/json"].schema.properties or allow additionalProperties.`

Observed keys, in order: `added`, `info`, `externalDocs`, `updated`, `swaggerUrl`, `swaggerYamlUrl`, `openapiVer`, `link`. That is exactly the `ApiVersion` property list.

### 3. `GET /{provider}.json`: the response is wrapped in `apis` and the values are version objects, not `API` entries

Finding: `response body at /apis/apis.guru: property "apis.guru" is not allowed`, plus `response body at /apis/preferred: required property "preferred" is missing` (and `added`, `versions`).

- If the spec is right: `Stop returning "apis.guru" from GET /{provider}.json; the spec forbids unknown properties here.`
- If the implementation is right: `Add "apis.guru" to paths["/{provider}.json"].get.responses["200"].content["application/json"].schema.properties["apis"].properties or allow additionalProperties.`

Observed: `{ "apis": { "apis.guru": { "added", "info", "externalDocs", "updated", "swaggerUrl", "swaggerYamlUrl", "openapiVer", "link" } } }`. The document says the top level is the map itself (`APIs`), with `API` entries (`added`, `preferred`, `versions`) as values.

## Reproduce

```sh
# Keys of the per-API response: ApiVersion keys, no "preferred" or "versions"
curl -s https://api.apis.guru/v2/specs/apis.guru/2.2.0.json | head -c 300; echo

# Provider listing: wrapped in "apis", values are version objects
curl -s https://api.apis.guru/v2/apis.guru.json | head -c 300; echo

# The schema the document claims for the first endpoint
curl -s https://api.apis.guru/v2/openapi.yaml | grep -n -A6 '/specs/{provider}/{api}.json:' | head
```

`GET /list.json` and `GET /metrics.json` matched the document in the same run.

## Which side should change

The document. The live shape is what the directory has served for years and what https://apis.guru/simple-ui and other consumers read; the `link` field's own description ("Link to the individual API entry for this API") suggests the per-version endpoint was always meant to return the version record. Suggested change in `APIs/apis.guru/2.2.0/openapi.yaml`:

- `getAPI` and `getServiceAPI`: point the 200 response at `#/components/schemas/ApiVersion`.
- `getProvider`: document the response as an object with one property, `apis`, whose value is a map from API id to `ApiVersion` (or to `API`, if the wrapping is the bug and the values are meant to be full entries; the maintainers know which).

If instead the endpoints are meant to return `API` entries, the fixes flip to the implementation side quoted above; either way the two will agree afterwards.

Found with apidrifter; every request and finding for this API is at https://apidrifter.com/research/public-api-spec-drift-2026-11/apis-guru/.

Happy to send a pull request for the YAML once you confirm which direction you want.
