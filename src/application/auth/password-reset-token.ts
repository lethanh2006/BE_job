/** Token đặt lại mật khẩu: chỉ lưu hash, bản gốc chỉ nằm trong email gửi cho chủ tài khoản. */
export interface PasswordResetToken {
  readonly id: string;
  readonly userId: number;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** Token đã hết hạn vẫn được giữ thêm một ngày (phục vụ đếm tần suất) rồi mới dọn. */
export const RESET_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;
