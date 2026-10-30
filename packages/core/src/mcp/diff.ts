import { makeChange, schemaEventsToChanges } from "../change.js";
import { diffSchemas } from "../schema/diff.js";
import { quote } from "../text.js";
import type { Change, Limits, Location } from "../types.js";
import type { McpSurface, Prompt, Tool } from "./model.js";
import { suspiciousReasons } from "./suspicious.js";

const SRC = "mcp" as const;

export function diffMcp(before: McpSurface, after: McpSurface, limits: Limits): Change[] {
  const out: Change[] = [];
  const server: Location = { kind: "server" };

  if ((before.name ?? "") !== (after.name ?? ""))
    out.push(
      makeChange(
        "server-name-changed",
        SRC,
        server,
        "server name changed",
        before.name,
        after.name,
      ),
    );
  if ((before.version ?? "") !== (after.version ?? ""))
    out.push(
      makeChange(
        "server-version-changed",
        SRC,
        server,
        "server version changed",
        before.version,
        after.version,
      ),
    );
  if ((before.instructions ?? "") !== (after.instructions ?? "")) {
    out.push(
      makeChange(
        "server-instructions-changed",
        SRC,
        server,
        "server instructions changed",
        before.instructions,
        after.instructions,
      ),
    );
    const reasons = suspiciousReasons(after.instructions);
    if (reasons.length > 0)
      out.push(
        makeChange(
          "server-instructions-injection-suspected",
          SRC,
          server,
          `server instructions look aimed at the agent: ${reasons.join("; ")}`,
          undefined,
          after.instructions,
        ),
      );
  }
  for (const c of after.capabilities)
    if (!before.capabilities.includes(c))
      out.push(
        makeChange(
          "server-capability-added",
          SRC,
          server,
          `capability ${quote(c)} was added`,
          undefined,
          c,
        ),
      );
  for (const c of before.capabilities)
    if (!after.capabilities.includes(c))
      out.push(
        makeChange(
          "server-capability-removed",
          SRC,
          server,
          `capability ${quote(c)} was removed`,
          c,
          undefined,
        ),
      );

  for (const [name, aTool] of after.tools) {
    const loc: Location = { kind: "tool", subject: name };
    const bTool = before.tools.get(name);
    if (bTool === undefined) {
      out.push(makeChange("tool-added", SRC, loc, `tool ${quote(name)} was added`));
      const reasons = suspiciousReasons(aTool.description);
      if (reasons.length > 0)
        out.push(
          makeChange(
            "tool-description-injection-suspected",
            SRC,
            { ...loc, part: "description" },
            `description of new tool ${quote(name)} looks aimed at the agent: ${reasons.join("; ")}`,
            undefined,
            aTool.description,
          ),
        );
      continue;
    }
    diffTool(bTool, aTool, loc, limits, out);
  }
  for (const name of before.tools.keys()) {
    if (!after.tools.has(name))
      out.push(
        makeChange(
          "tool-removed",
          SRC,
          { kind: "tool", subject: name },
          `tool ${quote(name)} was removed`,
        ),
      );
  }

  for (const [uri, a] of after.resources) {
    const loc: Location = { kind: "resource", subject: uri };
    const b = before.resources.get(uri);
    if (b === undefined) {
      out.push(makeChange("resource-added", SRC, loc, `resource ${quote(uri)} was added`));
      continue;
    }
    if ((b.name ?? "") !== (a.name ?? ""))
      out.push(
        makeChange("resource-name-changed", SRC, loc, "resource name changed", b.name, a.name),
      );
    if ((b.description ?? "") !== (a.description ?? ""))
      out.push(
        makeChange(
          "resource-description-changed",
          SRC,
          loc,
          "resource description changed",
          b.description,
          a.description,
        ),
      );
    if ((b.mimeType ?? "") !== (a.mimeType ?? ""))
      out.push(
        makeChange(
          "resource-mime-type-changed",
          SRC,
          loc,
          "resource MIME type changed",
          b.mimeType,
          a.mimeType,
        ),
      );
  }
  for (const uri of before.resources.keys()) {
    if (!after.resources.has(uri))
      out.push(
        makeChange(
          "resource-removed",
          SRC,
          { kind: "resource", subject: uri },
          `resource ${quote(uri)} was removed`,
        ),
      );
  }

  for (const [tpl, a] of after.resourceTemplates) {
    const loc: Location = { kind: "resource", subject: tpl };
    const b = before.resourceTemplates.get(tpl);
    if (b === undefined) {
      out.push(
        makeChange(
          "resource-template-added",
          SRC,
          loc,
          `resource template ${quote(tpl)} was added`,
        ),
      );
      continue;
    }
    if (
      (b.name ?? "") !== (a.name ?? "") ||
      (b.description ?? "") !== (a.description ?? "") ||
      (b.mimeType ?? "") !== (a.mimeType ?? "")
    ) {
      out.push(
        makeChange("resource-template-changed", SRC, loc, "resource template changed", b, a),
      );
    }
  }
  for (const tpl of before.resourceTemplates.keys()) {
    if (!after.resourceTemplates.has(tpl))
      out.push(
        makeChange(
          "resource-template-removed",
          SRC,
          { kind: "resource", subject: tpl },
          `resource template ${quote(tpl)} was removed`,
        ),
      );
  }

  for (const [name, a] of after.prompts) {
    const loc: Location = { kind: "prompt", subject: name };
    const b = before.prompts.get(name);
    if (b === undefined) {
      out.push(makeChange("prompt-added", SRC, loc, `prompt ${quote(name)} was added`));
      continue;
    }
    diffPrompt(b, a, loc, out);
  }
  for (const name of before.prompts.keys()) {
    if (!after.prompts.has(name))
      out.push(
        makeChange(
          "prompt-removed",
          SRC,
          { kind: "prompt", subject: name },
          `prompt ${quote(name)} was removed`,
        ),
      );
  }
  return out;
}

function diffTool(b: Tool, a: Tool, loc: Location, limits: Limits, out: Change[]): void {
  if ((b.title ?? "") !== (a.title ?? ""))
    out.push(makeChange("tool-title-changed", SRC, loc, "tool title changed", b.title, a.title));
  if ((b.description ?? "") !== (a.description ?? "")) {
    const dLoc: Location = { ...loc, part: "description" };
    out.push(
      makeChange(
        "tool-description-changed",
        SRC,
        dLoc,
        `description of tool ${quote(a.name)} changed`,
        b.description,
        a.description,
      ),
    );
    const reasons = suspiciousReasons(a.description);
    if (reasons.length > 0)
      out.push(
        makeChange(
          "tool-description-injection-suspected",
          SRC,
          dLoc,
          `new description of tool ${quote(a.name)} looks aimed at the agent: ${reasons.join("; ")}`,
          undefined,
          a.description,
        ),
      );
  }
  const bAnn = JSON.stringify(b.annotations);
  const aAnn = JSON.stringify(a.annotations);
  if (bAnn !== aAnn)
    out.push(
      makeChange(
        "tool-annotation-changed",
        SRC,
        { ...loc, part: "annotations" },
        `annotations of tool ${quote(a.name)} changed`,
        b.annotations,
        a.annotations,
      ),
    );

  const inputEvents = diffSchemas(b.input, a.input, "input", limits);
  out.push(...schemaEventsToChanges(inputEvents, "tool-input-property", { ...loc, part: "input" }));

  const oLoc: Location = { ...loc, part: "output" };
  if (b.output === undefined && a.output !== undefined)
    out.push(
      makeChange(
        "tool-output-schema-added",
        SRC,
        oLoc,
        `tool ${quote(a.name)} now declares an output schema`,
      ),
    );
  else if (b.output !== undefined && a.output === undefined)
    out.push(
      makeChange(
        "tool-output-schema-removed",
        SRC,
        oLoc,
        `tool ${quote(a.name)} no longer declares an output schema`,
      ),
    );
  else if (b.output !== undefined && a.output !== undefined) {
    const outputEvents = diffSchemas(b.output, a.output, "output", limits);
    out.push(...schemaEventsToChanges(outputEvents, "tool-output-property", oLoc));
  }
}

function diffPrompt(b: Prompt, a: Prompt, loc: Location, out: Change[]): void {
  if ((b.description ?? "") !== (a.description ?? ""))
    out.push(
      makeChange(
        "prompt-description-changed",
        SRC,
        loc,
        "prompt description changed",
        b.description,
        a.description,
      ),
    );
  for (const [name, aArg] of a.arguments) {
    const argLoc: Location = { ...loc, part: "argument", name };
    const bArg = b.arguments.get(name);
    if (bArg === undefined) {
      const id = aArg.required ? "prompt-required-argument-added" : "prompt-argument-added";
      out.push(
        makeChange(
          id,
          SRC,
          argLoc,
          `${aArg.required ? "required " : ""}argument ${quote(name)} was added`,
        ),
      );
      continue;
    }
    if (!bArg.required && aArg.required)
      out.push(
        makeChange(
          "prompt-argument-became-required",
          SRC,
          argLoc,
          `argument ${quote(name)} became required`,
        ),
      );
    if (bArg.required && !aArg.required)
      out.push(
        makeChange(
          "prompt-argument-became-optional",
          SRC,
          argLoc,
          `argument ${quote(name)} became optional`,
        ),
      );
    if ((bArg.description ?? "") !== (aArg.description ?? ""))
      out.push(
        makeChange(
          "prompt-argument-description-changed",
          SRC,
          argLoc,
          `description of argument ${quote(name)} changed`,
          bArg.description,
          aArg.description,
        ),
      );
  }
  for (const name of b.arguments.keys()) {
    if (!a.arguments.has(name))
      out.push(
        makeChange(
          "prompt-argument-removed",
          SRC,
          { ...loc, part: "argument", name },
          `argument ${quote(name)} was removed`,
        ),
      );
  }
}
