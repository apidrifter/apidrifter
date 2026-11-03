/**
 * Comparison pages: apidrifter against one other tool. Every claim about the other tool
 * must be verifiable from its public documentation; each entry records the pages that
 * were checked and the date they were checked. Keep the honest parts honest.
 */

export interface FeatureRow {
  feature: string;
  apidrifter: string;
  other: string;
}

export interface QA {
  q: string;
  a: string;
}

export interface Comparison {
  /** URL segment under /compare/. */
  id: string;
  /** The other tool's name as it writes it. */
  name: string;
  title: string;
  /** Meta description, 50 to 160 characters. */
  description: string;
  site: string;
  repo: string;
  /** One line for the index page. */
  oneLine: string;
  /** The honest paragraph at the top. */
  summary: string;
  features: FeatureRow[];
  insteadIntro: string;
  instead: string[];
  togetherIntro: string;
  togetherCommands: string;
  togetherOutro: string;
  faq: QA[];
  sources: Array<{ label: string; url: string }>;
  /** YYYY-MM-DD the claims were last checked against the other tool's docs. */
  reviewed: string;
}

const REVIEWED = "2026-11-03";

export const COMPARISONS: ReadonlyArray<Comparison> = [
  {
    id: "schemathesis",
    name: "Schemathesis",
    title: "apidrifter vs Schemathesis",
    description:
      "Schemathesis fuzzes an API from its schema; apidrifter sends one request per operation and says which side to fix. When to pick which, and how to use both.",
    site: "https://schemathesis.readthedocs.io/",
    repo: "https://github.com/schemathesis/schemathesis",
    oneLine:
      "Property-based fuzzing from the schema versus one planned request per operation with two-sided fixes.",
    summary:
      "Schemathesis and apidrifter both send requests to a running API and compare the responses with its OpenAPI document, and that is where the overlap ends. Schemathesis is a property-based tester built on Hypothesis: it generates many inputs per operation, including invalid ones, chains operations into stateful workflows, and reports crashes and conformance failures with a curl reproducer for each. apidrifter sends one realistic request per operation with values you or an agent supply, and reports each mismatch with two fixes: one if the spec is right, one if the implementation is. It also diffs spec versions and MCP servers, which Schemathesis does not do. If you want to find bugs by volume, Schemathesis is the more mature tool. If you want to know where the document and the server disagree and which side to change, that is what apidrifter is for.",
    features: [
      {
        feature: "Spec vs implementation verification",
        apidrifter:
          "Yes. One planned request per operation; status, media type, headers and body are checked against the document.",
        other:
          "Yes. Generated requests per operation, with status_code_conformance, content_type_conformance, response_headers_conformance and response_schema_conformance checks.",
      },
      {
        feature: "Property-based fuzzing",
        apidrifter: "No. Values come from the spec's examples, a filled plan, or an agent.",
        other:
          "Yes. Built on Hypothesis; positive, negative and all generation modes; stateful sequences that follow OpenAPI links.",
      },
      {
        feature: "Breaking-change diff between spec versions",
        apidrifter: "Yes. 357 polarity-aware change rules; exit 1 in CI.",
        other: "No.",
      },
      {
        feature: "MCP server snapshot and diff",
        apidrifter:
          "Yes. Tools, resources, prompts and instructions, with description changes tracked.",
        other: "No.",
      },
      {
        feature: "Agent-native MCP interface",
        apidrifter: "Yes. apidrifter serve exposes the loop as nine MCP tools over stdio.",
        other: "Not documented.",
      },
      {
        feature: "Which side to fix",
        apidrifter:
          "Yes. Every finding carries a fix for the spec and a fix for the implementation.",
        other: "No. Each failure names the check that failed and ships a curl reproducer.",
      },
      {
        feature: "GitHub Action",
        apidrifter:
          "Yes, for spec diffs: changelog in the job summary, a fail-on threshold, optional PR comment. run works in any CI step via npx.",
        other: "Yes. schemathesis/action@v3.",
      },
      {
        feature: "Hosted or paid tiers",
        apidrifter: "None. The CLI is free; a hosted service is planned.",
        other:
          "None. The Schemathesis.io service has been discontinued, according to the migration notes.",
      },
      {
        feature: "Spec formats",
        apidrifter:
          "OpenAPI 3.x and MCP snapshots. Swagger 2.0 must be converted to OpenAPI 3 first.",
        other: "OpenAPI 2.0, 3.0, 3.1 and 3.2; GraphQL; gRPC unary methods.",
      },
      {
        feature: "Reports",
        apidrifter: "Text, JSON, Markdown.",
        other: "CLI output plus JUnit, HAR, JSON, HTML and VCR via --report.",
      },
      {
        feature: "Language and runtime",
        apidrifter: "TypeScript. Node 22.12 or newer; run with npx.",
        other: "Python 3.11 or newer. CLI, pytest and unittest integration.",
      },
      { feature: "License", apidrifter: "Apache-2.0", other: "MIT" },
    ],
    insteadIntro: "Reach for Schemathesis when:",
    instead: [
      "You want volume. Thousands of generated inputs per operation find edge cases that one realistic request never will.",
      "You need negative testing: proof that the API rejects invalid input, missing headers and undeclared methods.",
      "You need stateful sequences (create, read, delete) with use-after-free and resource-availability checks.",
      "The API is GraphQL or gRPC, or your team lives in pytest.",
    ],
    togetherIntro:
      "They answer different questions, so running both is cheap and not redundant. apidrifter first, because it is fast and its output tells you what to edit; Schemathesis second, for depth.",
    togetherCommands: `# 1. Does the document describe the server? One request per operation, two fixes per finding.
npx apidrifter run openapi.yaml --base-url http://localhost:3000

# 2. Does the server hold up under generated input, including invalid input?
uvx schemathesis run openapi.yaml --url http://localhost:3000 --mode all

# 3. Did this change break clients of the previous spec?
npx apidrifter breaking openapi.before.yaml openapi.yaml`,
    togetherOutro:
      "Both tools send real requests. Point them at a dev or staging server, not production.",
    faq: [
      {
        q: "Is apidrifter a replacement for Schemathesis?",
        a: "No. Schemathesis is a fuzzer that finds crashes and conformance failures by generating many inputs. apidrifter sends one realistic request per operation and reports which side to fix, and it also diffs spec versions and MCP servers. Use Schemathesis for depth and apidrifter for a fast, actionable contract check.",
      },
      {
        q: "Which one finds more bugs?",
        a: "Schemathesis, by volume: it generates thousands of inputs, including invalid ones, and runs stateful sequences. apidrifter finds the mismatches a single well-formed request exposes, which is what breaks generated clients and SDKs, and explains each with a fix for the spec and a fix for the implementation.",
      },
      {
        q: "Can both run in the same CI job?",
        a: "Yes. Both are command-line tools with non-zero exit codes on failure. Run apidrifter run against the preview server for the contract check, Schemathesis for the fuzz pass, and apidrifter breaking against the previous spec version for compatibility.",
      },
      {
        q: "Does either tool send my spec to a third party?",
        a: "Both run locally and only talk to the server you point them at. Schemathesis documents that its hosted service has been discontinued; apidrifter has no hosted service yet.",
      },
    ],
    sources: [
      { label: "Schemathesis README", url: "https://github.com/schemathesis/schemathesis" },
      {
        label: "Schemathesis checks reference",
        url: "https://schemathesis.readthedocs.io/en/stable/reference/checks/",
      },
      {
        label: "Schemathesis CLI reference",
        url: "https://schemathesis.readthedocs.io/en/stable/reference/cli/",
      },
      {
        label: "Schemathesis migration notes",
        url: "https://schemathesis.readthedocs.io/en/stable/migration/",
      },
    ],
    reviewed: REVIEWED,
  },
  {
    id: "oasdiff",
    name: "oasdiff",
    title: "apidrifter vs oasdiff",
    description:
      "oasdiff compares two OpenAPI documents; apidrifter does that and also runs the spec against the live server. When to pick which, and how to use both.",
    site: "https://www.oasdiff.com/",
    repo: "https://github.com/oasdiff/oasdiff",
    oneLine:
      "The established spec-to-spec differ versus a differ that also checks the spec against the running server.",
    summary:
      "oasdiff and apidrifter both compare two OpenAPI documents and classify every change as breaking or not, and apidrifter uses oasdiff's check IDs where the meaning matches, so CI config and habits carry over. oasdiff is the more established spec differ: written in Go, with a catalog of checks you can list and customize, six output formats, a git diff driver, a pre-commit hook, a GitHub Action that annotates pull requests inline, a hosted MCP server, and a paid review and approval workflow at oasdiff.com. apidrifter's differ is one half of a tool whose other half runs the spec against a live server to find where document and implementation disagree, and it covers MCP servers as well as OpenAPI. If spec-to-spec diff is the whole job, oasdiff is the safe choice. If you also need to know whether the server does what the new spec says, use apidrifter for that part.",
    features: [
      {
        feature: "Spec vs implementation verification",
        apidrifter:
          "Yes. plan, run and verify send requests from the spec to a live server and check every response.",
        other: "No. oasdiff compares documents only.",
      },
      {
        feature: "Property-based fuzzing",
        apidrifter: "No.",
        other: "No.",
      },
      {
        feature: "Breaking-change diff between spec versions",
        apidrifter:
          "Yes. breaking, diff and changelog over 357 polarity-aware rules; exit 1 on breaking changes.",
        other:
          "Yes. breaking, changelog, diff and summary; customizable severity levels; deprecation sunset-period checks.",
      },
      {
        feature: "MCP server snapshot and diff",
        apidrifter:
          "Yes. Tools, resources, prompts and instructions, with description changes tracked.",
        other: "No.",
      },
      {
        feature: "Agent-native MCP interface",
        apidrifter:
          "Yes. apidrifter serve runs locally over stdio; documents stay on your machine.",
        other: "Yes. A hosted MCP server at api.oasdiff.com/mcp, called from an AI assistant.",
      },
      {
        feature: "Which side to fix",
        apidrifter:
          "Yes. Every verification finding carries a fix for the spec and a fix for the implementation.",
        other: "Not applicable. There is no implementation in a spec-to-spec comparison.",
      },
      {
        feature: "GitHub Action",
        apidrifter:
          "Yes. Composite action: changelog in the job summary, fail-on threshold, optional PR comment.",
        other:
          "Yes. oasdiff/oasdiff-action with breaking, changelog, diff and validate; inline annotations and fail-on.",
      },
      {
        feature: "Hosted or paid tiers",
        apidrifter: "None. The CLI is free; a hosted service is planned.",
        other:
          "The CLI, the Action and the shareable side-by-side review are free. oasdiff Pro adds the approval workflow and audit trail.",
      },
      {
        feature: "Spec formats",
        apidrifter:
          "OpenAPI 3.x and MCP snapshots. Swagger 2.0 must be converted to OpenAPI 3 first.",
        other: "OpenAPI 3.0, 3.1 and 3.2, with an upgrade command that canonicalizes 3.0 to 3.x.",
      },
      {
        feature: "Other spec tooling",
        apidrifter: "None beyond diff and verification.",
        other:
          "validate, flatten, upgrade, breaking-files, a git diff driver, a pre-commit hook, and output localized in en, ru, pt-br and es.",
      },
      {
        feature: "Output formats",
        apidrifter: "Text, JSON, Markdown.",
        other: "html, json, markdown, markup, text and yaml.",
      },
      {
        feature: "Language and runtime",
        apidrifter: "TypeScript. Node 22.12 or newer; run with npx.",
        other: "Go. Prebuilt binaries, Homebrew, Docker, go install, asdf.",
      },
      { feature: "License", apidrifter: "Apache-2.0", other: "Apache-2.0" },
    ],
    insteadIntro: "Reach for oasdiff when:",
    instead: [
      "Spec-to-spec diff is the whole job and your team already runs it.",
      "You cannot or do not want to run Node in CI; oasdiff ships as a static binary.",
      "You need the review and approval workflow with commit statuses, or HTML and YAML output.",
      "You want deprecation sunset periods enforced, the git diff driver, or the pre-commit hook.",
    ],
    togetherIntro:
      "Keep oasdiff for the comparison it already does and add apidrifter for the comparison it cannot: the new document against the deployed server.",
    togetherCommands: `# Spec-to-spec, in the tool your team already runs
oasdiff breaking openapi.before.yaml openapi.yaml

# The same comparison with apidrifter's engine; rule IDs overlap where the meaning matches
npx apidrifter breaking openapi.before.yaml openapi.yaml

# The part oasdiff does not do: the new document against the staging server
npx apidrifter run openapi.yaml --base-url https://staging.example.com --bearer-env API_TOKEN`,
    togetherOutro:
      "Disagreements between the two differs are worth a bug report to whichever tool is wrong; apidrifter keeps an oracle harness in the repository for exactly that.",
    faq: [
      {
        q: "Do apidrifter and oasdiff use the same rule IDs?",
        a: "Where a rule means the same thing, yes, so severity overrides and ignore lists carry over. apidrifter has rules oasdiff does not and the reverse, so check the rules reference before assuming an ID exists on both sides.",
      },
      {
        q: "Should I replace oasdiff with apidrifter in CI?",
        a: "Not if oasdiff is working for you. The reason to add apidrifter is apidrifter run, which checks the spec against the live implementation. You can keep oasdiff for the spec diff and add the verification step beside it.",
      },
      {
        q: "Which handles OpenAPI 3.1 and 3.2?",
        a: "oasdiff documents 3.1 and 3.2 support and ships an upgrade command. apidrifter accepts any OpenAPI 3.x document and treats the parts it understands; Swagger 2.0 must be converted first in both cases.",
      },
      {
        q: "Does either have an MCP interface for agents?",
        a: "Both. oasdiff offers a hosted MCP server at api.oasdiff.com/mcp. apidrifter serve runs locally over stdio, so specs never leave the machine, and it also exposes plan, run, verify and the MCP snapshot tools.",
      },
    ],
    sources: [
      { label: "oasdiff README", url: "https://github.com/oasdiff/oasdiff" },
      { label: "oasdiff GitHub Action", url: "https://github.com/oasdiff/oasdiff-action" },
      { label: "oasdiff.com", url: "https://www.oasdiff.com/" },
    ],
    reviewed: REVIEWED,
  },
];
