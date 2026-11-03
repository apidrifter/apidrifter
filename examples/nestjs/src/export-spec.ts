// Print the generated OpenAPI document, for committing a snapshot that CI can diff:
//   npm run spec   (writes openapi.json)
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { buildDocument } from "./openapi";

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  process.stdout.write(`${JSON.stringify(buildDocument(app), null, 2)}\n`);
  await app.close();
}

main();
