import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { buildDocument } from "./openapi";

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  const document = buildDocument(app);
  // Serves the UI at /docs and the document at /openapi.json.
  SwaggerModule.setup("docs", app, document, { jsonDocumentUrl: "openapi.json" });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`nestjs example listening on http://localhost:${port} (spec at /openapi.json)`);
}

main();
