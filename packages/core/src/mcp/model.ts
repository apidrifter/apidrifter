import type { SchemaNode } from "../schema/model.js";

/**
 * Snapshot of an MCP server as written by `apidrifter mcp snapshot`. The engine also
 * accepts a bare `tools/list` result (`{ tools: [...] }`).
 */
export interface McpSnapshotDocument {
  apidrifter?: number;
  kind?: "mcp";
  capturedAt?: string;
  server?: {
    name?: string;
    version?: string;
    instructions?: string;
    capabilities?: Record<string, unknown>;
  };
  tools?: unknown[];
  resources?: unknown[];
  resourceTemplates?: unknown[];
  prompts?: unknown[];
}

export interface McpSurface {
  name?: string;
  version?: string;
  instructions?: string;
  capabilities: string[];
  tools: Map<string, Tool>;
  resources: Map<string, Resource>;
  resourceTemplates: Map<string, ResourceTemplate>;
  prompts: Map<string, Prompt>;
}

export interface Tool {
  name: string;
  title?: string;
  description?: string;
  input?: SchemaNode;
  output?: SchemaNode;
  annotations: Record<string, unknown>;
}

export interface Resource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments: Map<string, PromptArgument>;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required: boolean;
}
