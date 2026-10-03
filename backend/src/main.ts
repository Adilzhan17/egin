import * as process from 'process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseEnvBoolean } from './common/utils/env.util';
import { isAllowedOrigin, parseAllowedOrigins } from './common/cors.util';
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
  const configuredOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: string | boolean) => void) => {
      if (!origin) return callback(null, true);
      const allowed = isAllowedOrigin(origin, configuredOrigins);

      // Reject with `callback(null, false)`, never `callback(new Error(...))`: an Error here is
      // thrown synchronously by the cors middleware, before any exception filter can shape it,
      // so Nest turns a routine "unknown origin" into an opaque 500 instead of a clean rejection.
      // A disallowed origin still can't read the response either way — the browser's preflight
      // already withholds Access-Control-Allow-Origin — so this only fixes the response shape.
      callback(null, allowed ? origin : false);
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
  
  console.log(`🚀 Backend is running on: http://localhost:${port}`);

  if (apiDocsEnabled) {
    console.log(`📚 API Documentation available at: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
