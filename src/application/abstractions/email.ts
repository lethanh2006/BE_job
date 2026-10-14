export interface EmailMessage {
  to: string;
  subject: string;
  /** Bản văn bản thuần: luôn có để ứng dụng thư không hiển thị được HTML vẫn đọc được. */
  text: string;
  html?: string;
}

/**
 * Cổng gửi email. Use case chỉ biết cổng này nên gửi bằng SMTP ở môi trường thật, ghi log khi
 * phát triển và dùng hộp thư giả khi test mà không phải sửa nghiệp vụ.
 */
export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<void>;
}
