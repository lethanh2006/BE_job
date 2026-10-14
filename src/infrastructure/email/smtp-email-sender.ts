import { createTransport } from 'nodemailer';
import {
  EmailMessage,
  EmailSender,
} from '../../application/abstractions/email';
import type { SmtpConfig } from '../../config/app-config';

/** Phần của nodemailer mà sender cần; tách ra để test bằng transport giả. */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

export class SmtpEmailSender extends EmailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {
    super();
  }

  static connect(config: SmtpConfig, from: string): SmtpEmailSender {
    return new SmtpEmailSender(
      createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user
          ? { user: config.user, pass: config.password ?? '' }
          : undefined,
        // Máy chủ thư treo không được giữ request của người dùng quá lâu.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
      from,
    );
  }

  async send(message: EmailMessage): Promise<void> {
    // Địa chỉ đến từ dữ liệu người dùng nhập: từ chối khoảng trắng/xuống dòng, dấu phẩy, chấm phẩy,
    // ngoặc nhọn và dấu nháy để không chèn thêm header thư hay người nhận khác.
    if (/[\s,;<>"]/.test(message.to)) {
      throw new Error('Địa chỉ người nhận không hợp lệ.');
    }

    await this.transport.sendMail({ from: this.from, ...message });
  }
}
