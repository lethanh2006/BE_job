import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';
import { AppConfig } from './config/app-config';
import { setupOpenApi } from './openapi';

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
  const app = await NestFactory.create(AppModule.register());
  const config = app.get(AppConfig);

  app.enableShutdownHooks();
  configureApp(app, config);
  if (config.openApiEnabled) setupOpenApi(app);

  await app.listen(config.port);
}
void bootstrap();
