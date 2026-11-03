// Print the generated OpenAPI document, for committing a snapshot that CI can diff:
//   npm run spec   (writes openapi.json)
import { app, openapiConfig } from "./app.js";

process.stdout.write(`${JSON.stringify(app.getOpenAPIDocument(openapiConfig), null, 2)}\n`);
