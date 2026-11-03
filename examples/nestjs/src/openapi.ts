import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/** The OpenAPI document @nestjs/swagger generates from the decorators. */
export function buildDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Todos (NestJS example)")
    .setVersion("1.0.0")
    .build();
  return SwaggerModule.createDocument(app, config);
}
