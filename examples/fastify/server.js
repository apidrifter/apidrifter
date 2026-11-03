import { build } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = await build();
await app.listen({ port });
console.log(`fastify example listening on http://localhost:${port} (spec at /openapi.json)`);
