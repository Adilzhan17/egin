import * as process from 'process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseEnvBoolean } from './common/utils/env.util';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const apiDocsEnabled = parseEnvBoolean(process.env.API_DOCS_ENABLED, true);

  // Set up Pino Logger
  app.use(cookieParser());
  app.useLogger(app.get(Logger));

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginEmbedderPolicy: false,
  }));

  // CORS handling with ALLOWED_ORIGINS
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim())
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://egin.kz',
        'https://egin.perricheno.ru',
        'capacitor://localhost',
        'http://localhost',
      ];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: string | boolean) => void) => {
      if (!origin) return callback(null, true);
      const allowed =
        configuredOrigins.includes(origin) ||
        /^https?:\/\/[^/]*\.perricheno\.ru$/.test(origin);
      callback(allowed ? null : new Error(`CORS blocked: ${origin}`), allowed ? origin : false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
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
