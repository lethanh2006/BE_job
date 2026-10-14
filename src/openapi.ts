import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Phát tài liệu OpenAPI tại /api/openapi.json và giao diện Swagger UI tại /api/docs. */
export function setupOpenApi(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('JobBoard API')
      .setDescription('API tìm việc, ứng tuyển và quản lý tuyển dụng.')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
  });
}
