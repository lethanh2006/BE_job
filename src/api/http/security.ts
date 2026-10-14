import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

export const REQUEST_ID_HEADER = 'X-Request-Id';
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Mã request đã gắn vào phản hồi, để đưa vào log và nội dung lỗi giúp truy vết. */
export function requestIdOf(response: Response): string | undefined {
  const value = response.getHeader(REQUEST_ID_HEADER);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Header bảo mật (helmet), mã request và chống cache cho phản hồi chứa token. Mã request do client
 * gửi chỉ được nhận khi có dạng an toàn, nếu không sẽ thay bằng mã mới để không đưa dữ liệu lạ vào log.
 */
export function applySecurity(app: INestApplication): void {
  app.use(helmet());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const incoming = request.header(REQUEST_ID_HEADER);
    response.setHeader(
      REQUEST_ID_HEADER,
      incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID(),
    );
    next();
  });
  // Phản hồi xác thực chứa token nên không được lưu trong cache của trình duyệt hay proxy.
  app.use(
    '/api/auth',
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
}
