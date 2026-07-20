import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { beginRequest, endRequest, observeRequest } from './shared/observability.js';
import { ProblemDetailsFilter } from './shared/problem-details.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true
  });

  app.use((request: { headers: Record<string, string | undefined>; correlationId?: string; method?: string; path?: string }, response: { setHeader(name: string, value: string): void; on(event: string, handler: () => void): void; statusCode?: number }, next: () => void) => {
    const correlationId = request.headers['x-correlation-id'] || randomUUID();
    request.correlationId = correlationId;
    response.setHeader('X-Correlation-Id', correlationId);
    const started = performance.now();
    beginRequest();
    response.on('finish', () => {
      const durationMs = performance.now() - started;
      endRequest();
      observeRequest(request.method || 'UNKNOWN', request.path || 'unknown', response.statusCode || 0, durationMs);
      console.log(JSON.stringify({ event: 'http_request', correlationId, method: request.method, path: request.path, status: response.statusCode, durationMs: Math.round(durationMs) }));
    });
    next();
  });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
