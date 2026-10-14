import {
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import type { Express } from 'express';
import { AppConfig } from './config/app-config';
import { ArgumentError } from './domain';
import { applySecurity } from './api/http/security';

const flattenMessages = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flattenMessages(error.children ?? []),
  ]);

/** Cấu hình dùng chung cho ứng dụng thật và test e2e: tiền tố /api, validation, CORS. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  // Quyết định `request.ip` lấy từ socket hay từ X-Forwarded-For; giới hạn tần suất dựa vào nó.
  (app.getHttpAdapter().getInstance() as Express).set(
    'trust proxy',
    config.security.trustProxy,
  );
  applySecurity(app);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      // Lỗi validate được đưa về cùng định dạng ProblemDetails (HTTP 400).
      exceptionFactory: (errors) =>
        new ArgumentError(flattenMessages(errors).join('; ')),
    }),
  );

  if (config.corsAllowedOrigins.length > 0) {
    app.enableCors({
      origin: [...config.corsAllowedOrigins],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  }
}
