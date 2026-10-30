import type { SchemaNode } from "../schema/model.js";

/** The observable surface of an OpenAPI document, independent of how it was written. */
export interface Surface {
  title?: string;
  version?: string;
  servers: string[];
  /** Document-level security. Undefined means none declared. */
  security?: SecurityAlternative[];
  securitySchemes: Map<string, SecurityScheme>;
  operations: Map<string, Operation>;
}

export interface SecurityScheme {
  type?: string;
  scheme?: string;
  in?: string;
  name?: string;
  bearerFormat?: string;
  flows?: string[];
}

/** One way to authenticate: every listed scheme must be satisfied with the listed scopes. */
export interface SecurityAlternative {
  key: string;
  schemes: Map<string, string[]>;
}

export interface Operation {
  /** Normalized key, e.g. `GET /pets/{}`. */
  key: string;
  method: string;
  /** Display path from the document. */
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  deprecated: boolean;
  parameters: Map<string, Parameter>;
  requestBody?: RequestBody;
  responses: Map<string, Response>;
  /** Operation-level security. Undefined means inherit the document's. */
  security?: SecurityAlternative[];
}

export interface Parameter {
  key: string;
  in: string;
  name: string;
  required: boolean;
  deprecated: boolean;
  description?: string;
  schema?: SchemaNode;
}

export interface RequestBody {
  required: boolean;
  content: Map<string, MediaType>;
}

export interface MediaType {
  schema?: SchemaNode;
}

export interface Response {
  status: string;
  description?: string;
  headers: Map<string, Header>;
  content: Map<string, MediaType>;
}

export interface Header {
  name: string;
  required: boolean;
  schema?: SchemaNode;
}
