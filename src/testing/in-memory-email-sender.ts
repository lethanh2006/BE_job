import { EmailMessage, EmailSender } from '../application/abstractions/email';

/** Hộp thư giả cho test: giữ mọi email đã "gửi" để kiểm tra nội dung. */
export class InMemoryEmailSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
  /** Đặt để mô phỏng máy chủ thư lỗi. */
  failWith: Error | null = null;

  send(message: EmailMessage): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push({ ...message });
    return Promise.resolve();
  }

  to(address: string): EmailMessage[] {
    return this.sent.filter(
      (message) => message.to.toLowerCase() === address.toLowerCase(),
    );
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/** Lấy token từ liên kết đặt lại mật khẩu trong nội dung email. */
export function extractResetToken(message: EmailMessage): string {
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(message.text);
  if (!match) throw new Error('Email không chứa liên kết đặt lại mật khẩu.');
  return decodeURIComponent(match[1]);
}
