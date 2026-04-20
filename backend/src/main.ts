import * as process from 'process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseEnvBoolean } from './common/utils/env.util';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const apiDocsEnabled = parseEnvBoolean(process.env.API_DOCS_ENABLED, true);

  // Set up Pino Logger
  app.useLogger(app.get(Logger));

  // CORS handling with ALLOWED_ORIGINS
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'https://egin.kz'];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  if (apiDocsEnabled) {
    const config = new DocumentBuilder()
      .setTitle('AgriPlan API')
      .setDescription(
        'The AgriPlan backend platform for Kazakhstan farmers and buyers.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  console.log(`Backend is running on: http://localhost:${port}`);

  if (apiDocsEnabled) {
    console.log(`API Documentation available at: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
