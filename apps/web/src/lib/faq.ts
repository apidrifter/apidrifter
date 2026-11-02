/** Landing page FAQ. Plain-text answers; also emitted as FAQPage structured data. */
export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Does my API match its OpenAPI spec?",
    a: "Run apidrifter run against your server with your spec. It sends one request per operation, compares every response to the documented status, media type, headers and schema, and reports each mismatch with a fix for the spec and a fix for the implementation. If it reports nothing, the operations it could exercise match.",
  },
  {
    q: "How is this different from Schemathesis or contract testing?",
    a: "Schemathesis fuzzes your API with generated data to find crashes and schema violations. API Drifter plans one realistic request per operation, lets a person or an agent supply real values and auth, and reports which side to fix. It also diffs spec versions and MCP servers, which fuzzers do not do.",
  },
  {
    q: "How is this different from oasdiff or Bump.sh?",
    a: "oasdiff and Bump.sh compare two versions of a spec. API Drifter does that too, with polarity-aware classification, and additionally compares a spec to the live implementation and covers MCP servers. It is open source under Apache-2.0 and runs locally.",
  },
  {
    q: "Can an agent use it?",
    a: "Yes. apidrifter serve exposes plan, run, verify, diff and the MCP snapshot tools as an MCP server over stdio, so a coding agent can check an API it just changed and act on the two-sided fixes without a person in the loop.",
  },
  {
    q: "Does it send my spec anywhere?",
    a: "No. The CLI runs on your machine and only talks to the server you point it at with --base-url. Specs, observations and reports stay local unless you choose to share them.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. The CLI and engine are open source under Apache-2.0 and free to use. A hosted service for continuous monitoring and history is planned.",
  },
];
