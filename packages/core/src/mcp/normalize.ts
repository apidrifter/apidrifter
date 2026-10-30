import { isRecord } from "../parse.js";
import { createNormalizeContext, normalizeSchema } from "../schema/normalize.js";
import type { DocumentMeta, Limits } from "../types.js";
import type {
  McpSurface,
  Prompt,
  PromptArgument,
  Resource,
  ResourceTemplate,
  Tool,
} from "./model.js";

export function isMcpDocument(doc: unknown): doc is Record<string, unknown> {
  if (!isRecord(doc)) return false;
  if (doc["kind"] === "mcp") return true;
  return Array.isArray(doc["tools"]) && !("openapi" in doc) && !("swagger" in doc);
}

export function mcpMeta(doc: Record<string, unknown>): DocumentMeta {
  const meta: DocumentMeta = { kind: "mcp" };
  const server = doc["server"];
  if (isRecord(server)) {
    if (typeof server["name"] === "string") meta.title = server["name"];
    if (typeof server["version"] === "string") meta.version = server["version"];
  }
  return meta;
}

export function normalizeMcp(doc: Record<string, unknown>, limits: Limits): McpSurface {
  const surface: McpSurface = {
    capabilities: [],
    tools: new Map(),
    resources: new Map(),
    resourceTemplates: new Map(),
    prompts: new Map(),
  };
  const server = doc["server"];
  if (isRecord(server)) {
    if (typeof server["name"] === "string") surface.name = server["name"];
    if (typeof server["version"] === "string") surface.version = server["version"];
    if (typeof server["instructions"] === "string") surface.instructions = server["instructions"];
    const caps = server["capabilities"];
    if (isRecord(caps)) surface.capabilities = Object.keys(caps).sort();
  }

  const tools = doc["tools"];
  if (Array.isArray(tools)) {
    for (const raw of tools) {
      if (!isRecord(raw) || typeof raw["name"] !== "string") continue;
      const tool: Tool = { name: raw["name"], annotations: {} };
      if (typeof raw["title"] === "string") tool.title = raw["title"];
      if (typeof raw["description"] === "string") tool.description = raw["description"];
      if (raw["inputSchema"] !== undefined) {
        // Each schema is its own document for reference purposes.
        const root = isRecord(raw["inputSchema"]) ? raw["inputSchema"] : {};
        tool.input = normalizeSchema(raw["inputSchema"], createNormalizeContext(root, limits));
      }
      if (raw["outputSchema"] !== undefined) {
        const root = isRecord(raw["outputSchema"]) ? raw["outputSchema"] : {};
        tool.output = normalizeSchema(raw["outputSchema"], createNormalizeContext(root, limits));
      }
      const ann = raw["annotations"];
      if (isRecord(ann)) {
        for (const k of Object.keys(ann).sort()) tool.annotations[k] = ann[k];
      }
      surface.tools.set(tool.name, tool);
    }
  }

  const resources = doc["resources"];
  if (Array.isArray(resources)) {
    for (const raw of resources) {
      if (!isRecord(raw) || typeof raw["uri"] !== "string") continue;
      const r: Resource = { uri: raw["uri"] };
      if (typeof raw["name"] === "string") r.name = raw["name"];
      if (typeof raw["description"] === "string") r.description = raw["description"];
      if (typeof raw["mimeType"] === "string") r.mimeType = raw["mimeType"];
      surface.resources.set(r.uri, r);
    }
  }

  const templates = doc["resourceTemplates"];
  if (Array.isArray(templates)) {
    for (const raw of templates) {
      if (!isRecord(raw) || typeof raw["uriTemplate"] !== "string") continue;
      const t: ResourceTemplate = { uriTemplate: raw["uriTemplate"] };
      if (typeof raw["name"] === "string") t.name = raw["name"];
      if (typeof raw["description"] === "string") t.description = raw["description"];
      if (typeof raw["mimeType"] === "string") t.mimeType = raw["mimeType"];
      surface.resourceTemplates.set(t.uriTemplate, t);
    }
  }

  const prompts = doc["prompts"];
  if (Array.isArray(prompts)) {
    for (const raw of prompts) {
      if (!isRecord(raw) || typeof raw["name"] !== "string") continue;
      const p: Prompt = { name: raw["name"], arguments: new Map() };
      if (typeof raw["description"] === "string") p.description = raw["description"];
      const args = raw["arguments"];
      if (Array.isArray(args)) {
        for (const rawArg of args) {
          if (!isRecord(rawArg) || typeof rawArg["name"] !== "string") continue;
          const arg: PromptArgument = {
            name: rawArg["name"],
            required: rawArg["required"] === true,
          };
          if (typeof rawArg["description"] === "string") arg.description = rawArg["description"];
          p.arguments.set(arg.name, arg);
        }
      }
      surface.prompts.set(p.name, p);
    }
  }
  return surface;
}
