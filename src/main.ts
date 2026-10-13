import { ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ArgumentError } from './domain';
import { AppConfig } from './config/app-config';

const flattenMessages = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flattenMessages(error.children ?? []),
  ]);

/** Nạp file .env (nếu có) vào process.env trước khi đọc cấu hình. */
function loadEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch {
    // Không có .env: dùng biến môi trường của hệ thống.
  }
}

async function bootstrap() {
  loadEnvFile();
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfig);

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

  await app.listen(config.port);
}
void bootstrap();
