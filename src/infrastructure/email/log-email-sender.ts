import { Logger } from '@nestjs/common';
import {
  EmailMessage,
  EmailSender,
} from '../../application/abstractions/email';

/**
 * Không gửi email thật mà ghi log, để chạy local không cần máy chủ thư. Nội dung email có liên
 * kết đặt lại mật khẩu nên chỉ được in ra khi `includeBody` bật (ngoài production).
 */
export class LogEmailSender extends EmailSender {
  private readonly logger = new Logger('Email');

  constructor(private readonly includeBody: boolean) {
    super();
  }

  send(message: EmailMessage): Promise<void> {
    this.logger.log(
      this.includeBody
        ? `Email giả lập tới ${message.to} — ${message.subject}\n${message.text}`
        : `Email "${message.subject}" tới ${message.to} không được gửi vì chưa cấu hình SMTP (EMAIL_PROVIDER=Smtp).`,
    );
    return Promise.resolve();
  }
}
