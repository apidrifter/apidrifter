# @apidrifter/core

The engine behind [API Drifter](https://apidrifter.com): a pure, deterministic library that diffs OpenAPI documents and MCP server snapshots, verifies observed requests and responses against a spec, and explains what to fix on either side. No I/O: it takes parsed documents and returns results.

```ts
import { diff, parseDocument, renderMarkdown, verify, plan } from "@apidrifter/core";

const before = parseDocument(await readFile("v1.yaml", "utf8"));
const after = parseDocument(await readFile("v2.yaml", "utf8"));
const result = diff(before, after);
console.log(renderMarkdown(result));
console.log(result.hasBreaking); // exit 1 in CI
```

- `diff(before, after, options?)`: every change between two OpenAPI 3.x documents or two MCP snapshots, classified breaking, warning or info with stable rule IDs. Polarity-aware: a property becoming required is breaking in a request and harmless in a response.
- `plan(spec)`: one proposed request per operation, with the slots a caller or agent must fill.
- `verify(spec, observations)`: findings for recorded request and response pairs, each with a fix if the spec is the source of truth and a fix if the implementation is.
- `parseDocument(text)`: JSON or YAML parsing with size, depth and reference limits, safe for untrusted input.
- `renderMarkdown`, `renderText`, `renderVerifyMarkdown`, `renderVerifyText`: reports.
- `listRules()`, `listFindingRules()`: the documented rule tables.

The CLI package `apidrifter` wraps this library; most users want that. See the [rules reference](https://apidrifter.com/docs/rules/) and the [design document](https://apidrifter.com/docs/design/).

Apache-2.0.
