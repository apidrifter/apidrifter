/**
 * Framework guides: how to verify an app built with a given framework against its OpenAPI
 * document. Each guide mirrors a runnable example under examples/<id> in the repository;
 * the finding excerpt is the real output of `apidrifter run` against that example.
 */
import { SITE } from "./site";

export interface QA {
  q: string;
  a: string;
}

export interface GuideStep {
  name: string;
  text: string;
}

export interface Guide {
  /** URL segment under /guides/ and directory name under examples/. */
  id: string;
  /** The framework's name as it writes it. */
  framework: string;
  title: string;
  /** Meta description, 50 to 160 characters. */
  description: string;
  /** One line for the index page. */
  oneLine: string;
  /** Opening paragraph. */
  intro: string;
  /** Where the OpenAPI document comes from: paragraphs. */
  specSource: string[];
  /** The spec argument for the CLI: a URL on the dev server or a file path. */
  specArg: string;
  /** Port the example listens on. */
  port: number;
  /** Shell to install and start the example. */
  startCommands: string;
  /** Shell to run the check. */
  runCommands: string;
  /** Paragraph after the run commands. */
  runNotes: string;
  /** Rule ID of the deliberate mismatch in the example. */
  findingRule: string;
  /** Real excerpt from the Markdown report, path separators shown as >. */
  findingExcerpt: string;
  /** How to read the finding and pick a side: paragraphs. */
  findingNotes: string[];
  /** Paragraph introducing the automation section. */
  automationIntro: string;
  /** The CLAUDE.md / AGENTS.md snippet. */
  claudeMd: string;
  /** The CI workflow step that starts the app and runs the check. */
  ciSnippet: string;
  /** Paragraph after the CI snippet. */
  automationOutro: string;
  faq: QA[];
  /** YYYY-MM-DD the guide was last checked against the example. */
  reviewed: string;
}

const REVIEWED = "2026-11-03";

export const EXAMPLES_URL = `${SITE.repo}/tree/main/examples`;

export function exampleUrl(g: Guide): string {
  return `${EXAMPLES_URL}/${g.id}`;
}

/** HowTo steps for structured data and the on-page checklist. */
export function guideSteps(g: Guide): GuideStep[] {
  return [
    {
      name: "Find the OpenAPI document",
      text: g.specSource[0] ?? "",
    },
    {
      name: `Start the ${g.framework} app`,
      text: `Start the service locally and note its port; the example listens on ${g.port}. apidrifter accepts plain http:// for localhost only.`,
    },
    {
      name: "Run apidrifter against it",
      text: `Run npx -y apidrifter run ${g.specArg} --base-url http://localhost:${g.port} --format markdown. One request per operation is built from the spec's examples; if an operation is skipped for missing values, run apidrifter plan, fill the slots, and pass --plan filled.json.`,
    },
    {
      name: "Read the findings and pick a side",
      text: `Every finding names the operation, the JSON location and a stable rule ID (here ${g.findingRule}), and carries two fixes: one if the spec is the source of truth, one if the implementation is. Decide per finding, fix that side, and rerun until the report is clean.`,
    },
    {
      name: "Make it automatic",
      text: "Paste the instructions paragraph into CLAUDE.md or AGENTS.md so the agent runs the check after touching a route or the spec, install the Claude Code plugin for the PostToolUse reminder hook, and add the CI job that starts the app and runs apidrifter with --fail-on breaking.",
    },
  ];
}

function claudeMd(specArg: string, port: number, specChange: string): string {
  return `## API contract checks

When you add or change an HTTP endpoint or ${specChange}, verify the
implementation against the spec before opening a pull request:

1. Start the service locally and note its port (${port}).
2. Run \`npx -y apidrifter plan ${specArg} --out plan.json\` to see which
   parameter and body values the engine cannot infer, and write a filled plan with
   realistic values from the codebase.
3. Run \`npx -y apidrifter run ${specArg} --base-url http://localhost:${port} --plan filled.json --format markdown\`.
   Plain http:// is only allowed for localhost. Never put real credentials in the plan,
   the command line or the report; use \`--bearer-env VAR\` for tokens.
4. For each finding, decide which side is the source of truth: the spec (fix the
   implementation) or the implementation (fix the spec). Do not loosen the spec just to
   make the report clean.
5. Fix and rerun until there are no findings at or above the fail level, then paste the
   Markdown report into the pull request description.`;
}

function ciSnippet(start: string, health: string, specArg: string, port: number): string {
  return `live-check:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
${start}
    - name: Start the app
      run: |
        ${health} &
        for i in $(seq 1 20); do curl -sf http://localhost:${port}/health && break; sleep 0.5; done
    - name: Verify the implementation against the spec
      run: |
        npx -y apidrifter run ${specArg} --base-url http://localhost:${port} \\
          --format markdown --fail-on breaking | tee report.md >> "$GITHUB_STEP_SUMMARY"
        exit "\${PIPESTATUS[0]}"`;
}

const NODE_INSTALL = "    - run: npm install";

export const GUIDES: ReadonlyArray<Guide> = [
  {
    id: "fastapi",
    framework: "FastAPI",
    title: "Verify your FastAPI app against its OpenAPI spec",
    description:
      "FastAPI generates the OpenAPI document from your type hints. How to run apidrifter against the live app, read a real finding, and make the check automatic.",
    oneLine:
      "The document comes from the type hints at /openapi.json; the drift hides where handlers bypass response_model.",
    intro:
      "FastAPI writes the OpenAPI document for you, which makes it easy to believe the document and the server cannot disagree. They can. Any handler that returns a Response directly, any JSONResponse built from a raw database row, any model that is looser than the data it describes, puts something on the wire that the document does not describe. apidrifter sends one request per operation to the running app, checks every response against the document FastAPI serves, and tells you which side to change.",
    specSource: [
      "FastAPI serves the generated document at /openapi.json on the running app (and the Swagger UI at /docs). It is built from the path operation signatures, the Pydantic models used as response_model and request bodies, and the responses= mapping on each route. apidrifter can read it straight from that URL, so there is nothing to export first. If you want a file to diff in CI, app.openapi() returns the same document; the example has a two-line export_spec.py that prints it.",
      "The document is OpenAPI 3.1, so optional fields appear as anyOf with null and nullable: true is never used. apidrifter reads both forms.",
    ],
    specArg: "http://localhost:8000/openapi.json",
    port: 8000,
    startCommands: `git clone https://github.com/apidrifter/apidrifter && cd apidrifter/examples/fastapi
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000`,
    runCommands: `npx -y apidrifter run http://localhost:8000/openapi.json --base-url http://localhost:8000 --format markdown`,
    runNotes:
      "The spec argument is the URL FastAPI serves; plain http:// is accepted for localhost only. Path parameters get their values from examples=[...] on Path(...), request bodies from a model's json_schema_extra example, so the example runs without a plan file. If your own app has no examples, run apidrifter plan with the same URL, fill the slots it lists, and add --plan filled.json.",
    findingRule: "response-null-not-allowed",
    findingExcerpt: `## Verification report

2 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (2)

- \`response-null-not-allowed\` at \`GET /todos/{todo_id} > response 200 > application/json > /due_date\` (observation 2): response body at /due_date: value is null but the schema does not allow null
  - If the spec is the source of truth: Return a non-null value in response body at /due_date.
  - If the implementation is the source of truth: Allow null at paths["/todos/{todo_id}"].get.responses["200"].content["application/json"].schema.properties["due_date"] (add "null" to type, or nullable: true in OpenAPI 3.0).`,
    findingNotes: [
      "The example's Todo model declares due_date: str. The store has a row whose due_date is None, and the handler returns JSONResponse(row), which skips response_model validation, so the null reaches the client while the document promises a string. A client generated from the document decodes due_date into a non-optional string and fails on that row; that is why the finding is breaking and the exit code is 1.",
      "Which side is right? A todo without a due date is a legitimate state, so the implementation is the source of truth and the model is wrong: change the annotation to due_date: str | None = None and FastAPI regenerates the document with anyOf: [string, null]. If the product rule were that every todo has a due date, the store would be wrong instead, and the handler should go back to returning the row through response_model so FastAPI refuses a bad row rather than serving it. The finding cannot know which; the person or agent who made the change can.",
    ],
    automationIntro:
      "The check is only useful if it runs every time a route or a model changes, which is exactly when nobody remembers to run it. Three pieces make it automatic, and the example directory carries all three.",
    claudeMd: claudeMd(
      "http://localhost:8000/openapi.json",
      8000,
      "a Pydantic model that feeds the OpenAPI document",
    ),
    ciSnippet: ciSnippet(
      `    - uses: actions/setup-python@v5
      with:
        python-version: "3.12"
    - run: pip install -r requirements.txt`,
      "uvicorn main:app --port 8000",
      "http://localhost:8000/openapi.json",
      8000,
    ),
    automationOutro:
      "The Claude Code plugin adds a PostToolUse hook that reminds the agent to run the check after it edits an OpenAPI document or a file under routes, controllers, handlers or api (for FastAPI, that is usually a routers directory; the hook is a shell script and the pattern is one line to change). The example's workflow also has a spec-diff job: it regenerates openapi.json with export_spec.py, fails if the committed snapshot is stale, and runs apidrifter/action@v1 against the base branch so a breaking change to the document is flagged before the live check even starts.",
    faq: [
      {
        q: "FastAPI validates responses with response_model, so how can the server drift from the document?",
        a: "Validation only happens on the return path that goes through response_model. Returning a Response or JSONResponse directly, using response_model=None, or serializing with a custom response class bypasses it, and a model that is looser than the data (an Optional that should be required, an int that is really a string) is documented as the model says, not as the data is. apidrifter checks from the outside, so it sees what a client sees.",
      },
      {
        q: "Can apidrifter read the spec from the running FastAPI app?",
        a: "Yes. Pass http://localhost:8000/openapi.json as the spec argument. Plain http:// is accepted for localhost only; a staging host must be https://. For CI diffs, print app.openapi() to a file and commit it, as the example's export_spec.py does.",
      },
      {
        q: "Should I fix the model or the handler?",
        a: "Decide what the change intended. If the data is right and the model is stale, fix the model (that regenerates the document). If the document is the published contract that clients are generated from, fix the handler or the data. Do not widen the model just to make the report clean; the two fixes in each finding exist so you can pick on purpose.",
      },
    ],
    reviewed: REVIEWED,
  },
  {
    id: "express",
    framework: "Express",
    title: "Verify your Express app against its OpenAPI spec",
    description:
      "Express has no built-in spec, so the OpenAPI document is hand-written and drifts. How to run apidrifter against the app, read a real finding, and automate it.",
    oneLine:
      "A hand-written openapi.yaml beside server.js; the drift is a field the server grew and the document never got.",
    intro:
      "Express does not know what your API looks like; the OpenAPI document is a separate file that someone wrote by hand and that nobody is forced to update when a handler changes. That is the most common shape of API drift, and the one our survey of public APIs found most often: the implementation moved, the document did not. apidrifter sends one request per operation to the running app, checks every response against the document, and tells you which side to change.",
    specSource: [
      "The document is a file in the repository, typically openapi.yaml or openapi.json next to the server code, maintained by hand or by a doc generator such as swagger-jsdoc. apidrifter takes the file path directly. The example keeps a strict document: its Todo schema has additionalProperties: false, so an extra field in a response is a breaking finding rather than an info one.",
      "If your Express project generates the document from JSDoc comments, run the generator first and point apidrifter at its output file; the check is the same.",
    ],
    specArg: "openapi.yaml",
    port: 3000,
    startCommands: `git clone https://github.com/apidrifter/apidrifter && cd apidrifter/examples/express
npm install
npm start`,
    runCommands: `npx -y apidrifter run openapi.yaml --base-url http://localhost:3000 --format markdown`,
    runNotes:
      "Path parameters and request bodies get their values from the example fields in the document, so the example runs without a plan file. If your document has no examples, run apidrifter plan openapi.yaml --out plan.json, fill the slots it lists, and add --plan filled.json; the engine never invents values.",
    findingRule: "response-forbidden-property",
    findingExcerpt: `## Verification report

3 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (3)

- \`response-forbidden-property\` at \`GET /todos/{id} > response 200 > application/json > /ownerId\` (observation 2): response body at /ownerId: property "ownerId" is not allowed
  - If the spec is the source of truth: Stop returning "ownerId" from GET /todos/{id}; the spec forbids unknown properties here.
  - If the implementation is the source of truth: Add "ownerId" to paths["/todos/{id}"].get.responses["200"].content["application/json"].schema.properties or allow additionalProperties.`,
    findingNotes: [
      "The example's rows carry an ownerId that the hand-written Todo schema never declared. Because the schema says additionalProperties: false, the extra field is a breaking finding: a strictly decoding client rejects the whole response. The same mismatch on a schema without that line would be response-undocumented-property, an info finding, which the example's apidrifter.config.json raises to a warning so it still shows up in CI.",
      "Which side is right? If ownerId is meant to be public, the document is wrong: add it to components.schemas.Todo.properties and to required, since the server always sets it. If it leaked out of the store by accident, the implementation is wrong: strip it before res.json(). The fix nobody should pick is adding additionalProperties: true to make the report quiet; that makes the document say less, not more.",
    ],
    automationIntro:
      "With a hand-written document the check matters most, because nothing else ties the two together. Three pieces make it automatic, and the example directory carries all three.",
    claudeMd: claudeMd("openapi.yaml", 3000, "the OpenAPI document"),
    ciSnippet: ciSnippet(NODE_INSTALL, "npm start", "openapi.yaml", 3000),
    automationOutro:
      "The Claude Code plugin adds a PostToolUse hook that reminds the agent to run the check after it edits openapi.yaml or a file under routes, controllers, handlers or api. The example's workflow also has a spec-diff job that runs apidrifter/action@v1 on openapi.yaml against the base branch, so a breaking edit to the document is flagged on the pull request even when the server is untouched.",
    faq: [
      {
        q: "My Express project has no OpenAPI document. Where do I start?",
        a: "Write one for the operations you have, with an example value for every path parameter and request body, and run apidrifter against it. The findings tell you where the document is wrong, with the spec-side fix spelled out, so the first few runs double as a way to get the document right.",
      },
      {
        q: "Does apidrifter need additionalProperties: false to catch extra fields?",
        a: "No. Without it an extra field is reported as response-undocumented-property at info severity. With it the finding is response-forbidden-property at breaking severity, because strict clients reject the response. Use apidrifter.config.json to raise the info rule to warning if you want extra fields visible in CI without tightening every schema.",
      },
      {
        q: "Can the same check run against staging?",
        a: "Yes, over https://. Plain http:// is accepted for localhost only. Pass --bearer-env VAR for a token kept in an environment variable; it never appears in output.",
      },
    ],
    reviewed: REVIEWED,
  },
  {
    id: "hono",
    framework: "Hono",
    title: "Verify your Hono app against its OpenAPI spec",
    description:
      "@hono/zod-openapi generates the document from Zod schemas. How to run apidrifter against the live app, read a real finding, and make the check automatic.",
    oneLine:
      "Zod schemas generate the document; the drift is a value in the store that the enum never learned about.",
    intro:
      "With @hono/zod-openapi the request and response schemas are Zod objects, and the OpenAPI document is generated from them. The schemas validate requests, but a response is only checked by TypeScript, and TypeScript does not know what is in your database. A value that the store accepts and the enum does not list goes out untouched. apidrifter sends one request per operation to the running app, checks every response against the document the app serves, and tells you which side to change.",
    specSource: [
      "The app serves the generated document wherever app.doc() is mounted, /openapi.json in the example, built from the createRoute() definitions and their Zod schemas. apidrifter can read it from that URL. For a file to diff in CI, app.getOpenAPIDocument(config) returns the same document; the example's npm run spec writes it to openapi.json.",
      "Examples on schemas (.openapi({ example })) end up in the document and are what apidrifter uses to fill path parameters and bodies. A whole-body example on the request schema is enough to send a POST without a plan file.",
    ],
    specArg: "http://localhost:3000/openapi.json",
    port: 3000,
    startCommands: `git clone https://github.com/apidrifter/apidrifter && cd apidrifter/examples/hono
npm install
npm start`,
    runCommands: `npx -y apidrifter run http://localhost:3000/openapi.json --base-url http://localhost:3000 --format markdown`,
    runNotes:
      "The spec argument is the URL the app serves; plain http:// is accepted for localhost only. If an operation is listed under Skipped for missing values, add .openapi({ example }) to the schema or run apidrifter plan, fill the slots, and add --plan filled.json.",
    findingRule: "response-enum-violation",
    findingExcerpt: `## Verification report

2 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (2)

- \`response-enum-violation\` at \`GET /todos/{id} > response 200 > application/json > /priority\` (observation 2): response body at /priority: value "\\"urgent\\"" is not one of the allowed values
  - If the spec is the source of truth: Return one of the documented values in response body at /priority.
  - If the implementation is the source of truth: Add the returned value to the enum at paths["/todos/{id}"].get.responses["200"].content["application/json"].schema.properties["priority"].`,
    findingNotes: [
      'The example\'s PrioritySchema is z.enum(["low", "medium", "high"]). The store has a todo whose priority is urgent, and the handler returns the row as is; zod-openapi validates the request, not the response. A client generated from the document maps the enum to a closed type, so the row cannot be decoded; that is why the finding is breaking.',
      "Which side is right? If urgent is a real priority the product supports, the schema is wrong: add it to the enum in src/app.ts and the document regenerates with the next start. If it was a typo in a migration or a value the API should never have accepted, the data is wrong, and the handler that let it in needs the same enum on its request side. With a generated document, fixing the spec means fixing the schema the code is built from, so the two sides are never far apart; the decision is still yours.",
    ],
    automationIntro:
      "Generated documents drift less often than hand-written ones, but when they drift it is in the places the generator cannot see: data, side effects, status codes set by hand. Three pieces make the check automatic, and the example directory carries all three.",
    claudeMd: claudeMd(
      "http://localhost:3000/openapi.json",
      3000,
      "a Zod schema that feeds the OpenAPI document",
    ),
    ciSnippet: ciSnippet(NODE_INSTALL, "npm start", "http://localhost:3000/openapi.json", 3000),
    automationOutro:
      "The Claude Code plugin adds a PostToolUse hook that reminds the agent to run the check after it edits an OpenAPI document or a file under routes, controllers, handlers or api. The example's workflow also has a spec-diff job: it regenerates openapi.json with npm run spec, fails if the committed snapshot is stale, and runs apidrifter/action@v1 against the base branch so a breaking schema change is flagged on the pull request.",
    faq: [
      {
        q: "The schemas are typed, so why would a Hono response not match the document?",
        a: "Types describe what the code says it returns, not what the store holds. An enum value that was added to the database but not to the schema, a null in a column the schema calls required, or a status code set by hand all pass the type checker. apidrifter checks the actual bytes against the document the app serves.",
      },
      {
        q: "Do I need to export the document to a file?",
        a: "Not for the live check; pass the /openapi.json URL directly. For spec-to-spec diffs in CI you need a file from each side, so the example commits openapi.json from app.getOpenAPIDocument() and fails the build if it is stale.",
      },
      {
        q: "What if apidrifter skips my POST operation?",
        a: "It means no example value could be found for the body. Add .openapi({ example: {...} }) to the request schema, or run apidrifter plan, write the body in a filled plan, and pass --plan filled.json. The engine never invents request values.",
      },
    ],
    reviewed: REVIEWED,
  },
  {
    id: "fastify",
    framework: "Fastify",
    title: "Verify your Fastify app against its OpenAPI spec",
    description:
      "@fastify/swagger generates the document from route schemas. How to run apidrifter against the live app, read a real finding, and make the check automatic.",
    oneLine:
      "Route schemas generate the document and serialize responses; the drift is a status code the schema never listed.",
    intro:
      "Fastify's route schemas do double duty: @fastify/swagger turns them into an OpenAPI document, and fast-json-stringify uses the response schema to serialize replies. That coupling is strong where it applies and absent where it does not. A status code the response schema does not list still goes out, just without serialization or validation, and the document never mentions it. apidrifter sends one request per operation to the running app, checks every response against the document the app serves, and tells you which side to change.",
    specSource: [
      "After app.register(swagger, { openapi: {...} }) and app.ready(), app.swagger() returns the generated document; the example serves it at /openapi.json from a route marked hide: true so it does not document itself. apidrifter can read it from that URL. For a file to diff in CI, the example's npm run spec writes the same document to openapi.json.",
      "JSON Schema examples on params, body and shared schemas are emitted as OpenAPI example values, which apidrifter uses to fill path parameters and bodies. A whole-body examples entry on the body schema is enough to send a POST without a plan file.",
    ],
    specArg: "http://localhost:3000/openapi.json",
    port: 3000,
    startCommands: `git clone https://github.com/apidrifter/apidrifter && cd apidrifter/examples/fastify
npm install
npm start`,
    runCommands: `npx -y apidrifter run http://localhost:3000/openapi.json --base-url http://localhost:3000 --format markdown`,
    runNotes:
      "The spec argument is the URL the app serves; plain http:// is accepted for localhost only. If an operation is listed under Skipped for missing values, add examples to the route schema or run apidrifter plan, fill the slots, and add --plan filled.json.",
    findingRule: "undocumented-status",
    findingExcerpt: `## Verification report

1 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (1)

- \`undocumented-status\` at \`POST /todos > response 201\` (observation 3): status 201 is not documented for "POST /todos"
  - If the spec is the source of truth: Return one of the documented statuses (200) from POST /todos.
  - If the implementation is the source of truth: Add a "201" response under paths["/todos"].post.responses.`,
    findingNotes: [
      "The example's create route declares response: { 200: Todo } and the handler calls reply.code(201). Fastify sends the 201 without complaint, with the body serialized by plain JSON.stringify rather than the schema, and the document lists only 200. A generated client has no branch for 201, so the finding is breaking.",
      "Which side is right? 201 Created is the right status for a create, so the implementation is the source of truth and the schema is wrong: change the response key from 200 to 201 in app.js. That also turns Fastify's schema serialization back on for the created todo, which is a second reason to want the schema and the handler to agree. If the team's convention were 200 for everything, the fix would be reply.code(200) instead. Either way, a status the schema does not list is a status Fastify will send unvalidated.",
    ],
    automationIntro:
      "Generated documents drift less often than hand-written ones, but when they drift it is in the places the generator cannot see: status codes set by hand, replies that bypass the schema, data the schema is looser than. Three pieces make the check automatic, and the example directory carries all three.",
    claudeMd: claudeMd(
      "http://localhost:3000/openapi.json",
      3000,
      "a route schema that feeds the OpenAPI document",
    ),
    ciSnippet: ciSnippet(NODE_INSTALL, "npm start", "http://localhost:3000/openapi.json", 3000),
    automationOutro:
      "The Claude Code plugin adds a PostToolUse hook that reminds the agent to run the check after it edits an OpenAPI document or a file under routes, controllers, handlers or api. The example's workflow also has a spec-diff job: it regenerates openapi.json with npm run spec, fails if the committed snapshot is stale, and runs apidrifter/action@v1 against the base branch so a breaking schema change is flagged on the pull request.",
    faq: [
      {
        q: "Fastify serializes responses from the schema, so how can a response not match it?",
        a: "Serialization applies only to status codes the response schema lists. A reply.code(201) on a route that documents 200, an error thrown before the handler, or a route with no response schema at all all go out as plain JSON. Fastify also strips undeclared properties rather than reporting them, which hides one kind of drift and says nothing about types or nulls the schema gets wrong.",
      },
      {
        q: "Where do the example values come from?",
        a: "From the examples keyword in your route and shared schemas; @fastify/swagger emits the first one as an OpenAPI example and apidrifter picks it up for path parameters and request bodies. Without examples, run apidrifter plan, fill the slots, and pass --plan filled.json.",
      },
      {
        q: "Can I diff the generated document in CI?",
        a: "Yes. Commit the output of app.swagger() (npm run spec in the example), fail the build if it is stale, and run apidrifter/action@v1 against the version on the base branch. The live check against the running app is a separate job.",
      },
    ],
    reviewed: REVIEWED,
  },
  {
    id: "nestjs",
    framework: "NestJS",
    title: "Verify your NestJS app against its OpenAPI spec",
    description:
      "@nestjs/swagger generates the document from decorators. How to run apidrifter against the live app, read a real finding, and make the check automatic.",
    oneLine:
      "Decorators generate the document; the drift is a DTO property that is required on paper and optional in the service.",
    intro:
      "In NestJS the OpenAPI document comes from decorators: @ApiProperty on DTOs, @ApiResponse and @ApiParam on controller methods. Decorators describe; they do not enforce. A DTO used as a response type is never validated on the way out, so whatever the service returns is what the client gets, and @ApiProperty marks a property required unless told otherwise. apidrifter sends one request per operation to the running app, checks every response against the document the app serves, and tells you which side to change.",
    specSource: [
      "SwaggerModule.createDocument(app, config) builds the document from the decorators; SwaggerModule.setup() serves it, in the example at /openapi.json with the UI at /docs. apidrifter can read it from that URL. For a file to diff in CI, the example's npm run spec creates the app without listening, prints the document, and exits.",
      "example values on @ApiProperty, @ApiParam and @ApiBody end up in the document and are what apidrifter uses to fill path parameters and bodies. An examples entry on @ApiBody is enough to send a POST without a plan file.",
    ],
    specArg: "http://localhost:3000/openapi.json",
    port: 3000,
    startCommands: `git clone https://github.com/apidrifter/apidrifter && cd apidrifter/examples/nestjs
npm install
npm start`,
    runCommands: `npx -y apidrifter run http://localhost:3000/openapi.json --base-url http://localhost:3000 --format markdown`,
    runNotes:
      "The spec argument is the URL the app serves; plain http:// is accepted for localhost only. If an operation is listed under Skipped for missing values, add example values to the decorators or run apidrifter plan, fill the slots, and add --plan filled.json.",
    findingRule: "response-missing-required-property",
    findingExcerpt: `## Verification report

2 breaking, 0 warning, 0 info.
Coverage: 4 of 4 operations observed, 0 observations matched no operation.

### Breaking (2)

- \`response-missing-required-property\` at \`GET /todos/{id} > response 200 > application/json > /dueDate\` (observation 2): response body at /dueDate: required property "dueDate" is missing
  - If the spec is the source of truth: Include "dueDate" in the 200 response of GET /todos/{id}.
  - If the implementation is the source of truth: Remove "dueDate" from required at paths["/todos/{id}"].get.responses["200"].content["application/json"].schema.`,
    findingNotes: [
      "The example's TodoDto has @ApiProperty() on dueDate, which makes it required in the document. The service only sets dueDate when it has one, so the second todo goes out without it. A client generated from the document treats the field as non-optional and fails on that row; that is why the finding is breaking.",
      "Which side is right? A todo without a due date is a legitimate state, so the implementation is the source of truth and the DTO is wrong: change the decorator to @ApiPropertyOptional() (or @ApiProperty({ required: false })) in src/todo.dto.ts and the document regenerates with dueDate out of required. If the product rule were that every todo has a due date, the service would be wrong instead, and create() should refuse a missing one. Nest does not set additionalProperties: false, so the reverse mistake, a field the service returns that the DTO lacks, is only an info finding; the example's apidrifter.config.json raises it to a warning.",
    ],
    automationIntro:
      "Decorator-generated documents drift in the gap between what a decorator says and what a service does. Three pieces make the check automatic, and the example directory carries all three.",
    claudeMd: claudeMd(
      "http://localhost:3000/openapi.json",
      3000,
      "a controller or DTO that feeds the OpenAPI document",
    ),
    ciSnippet: ciSnippet(NODE_INSTALL, "npm start", "http://localhost:3000/openapi.json", 3000),
    automationOutro:
      "The Claude Code plugin adds a PostToolUse hook that reminds the agent to run the check after it edits an OpenAPI document or a file under routes, controllers, handlers or api (Nest's *.controller.ts files usually live in feature directories; the hook is a shell script and the pattern is one line to change). The example's workflow also has a spec-diff job: it regenerates openapi.json with npm run spec, fails if the committed snapshot is stale, and runs apidrifter/action@v1 against the base branch so a breaking DTO change is flagged on the pull request.",
    faq: [
      {
        q: "Does NestJS validate responses against the DTOs?",
        a: "No. ValidationPipe validates incoming bodies against class-validator rules; response DTOs are only used to generate the document and for TypeScript. Whatever the service returns is sent. apidrifter checks the sent bytes against the document, which is the only place the two meet.",
      },
      {
        q: "How do I get the document as a file for CI?",
        a: "Create the app with NestFactory.create, call app.init(), print SwaggerModule.createDocument(app, config) and exit, as the example's src/export-spec.ts does. Commit the file, fail the build when it is stale, and diff it against the base branch with apidrifter/action@v1.",
      },
      {
        q: "Why is a missing field breaking but an extra field only info?",
        a: "A client generated from the document treats a required field as always present, so a response without it fails to decode. An extra field on a schema that allows additional properties is ignored by most clients, so it is reported at info severity; raise response-undocumented-property to warning in apidrifter.config.json if you want it in CI.",
      },
    ],
    reviewed: REVIEWED,
  },
];
