import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { resolveCorsOriginOption } from './common/cors/cors-origin';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: resolveCorsOriginOption(process.env.CORS_ORIGIN),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}

void bootstrap();
