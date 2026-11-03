// Print the generated OpenAPI document, for committing a snapshot that CI can diff:
//   npm run spec   (writes openapi.json)
import { build } from "./app.js";

const app = await build();
process.stdout.write(`${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
