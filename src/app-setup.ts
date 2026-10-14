import {
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { AppConfig } from './config/app-config';
import { ArgumentError } from './domain';

const flattenMessages = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flattenMessages(error.children ?? []),
  ]);

/** Cấu hình dùng chung cho ứng dụng thật và test e2e: tiền tố /api, validation, CORS. */
export function configureApp(app: INestApplication, config: AppConfig): void {
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
