import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as process from "node:process";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import * as bodyParser from "body-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle("API Documentation")
    .setDescription("The API description")
    .setVersion("1.0")
    .build();

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Increase the payload size limit
  app.use(bodyParser.json({ limit: "150mb" }));
  app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api-docs", app, document);

  await app.listen(process.env.PORT);
}

bootstrap();
