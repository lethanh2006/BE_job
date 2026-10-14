import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../domain';
import {
  PasswordHasher,
  PasswordResetRepository,
  RefreshTokenRepository,
  ResetTokenGenerator,
  UserAccountRepository,
} from '../abstractions/authentication';
import { EmailSender } from '../abstractions/email';
import { InvalidPasswordResetTokenException } from '../exceptions';
import {
  passwordChangedEmail,
  passwordResetEmail,
} from './password-reset-emails';
import { validatePassword } from './password-policy';

const INVALID_LINK_MESSAGE =
  'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.';

/** Số email đặt lại mật khẩu tối đa gửi cho một tài khoản trong một giờ (chống dội thư). */
export const MAX_RESET_REQUESTS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

/** Cấu hình do tầng ngoài cung cấp, để use case không phụ thuộc vào cách đọc biến môi trường. */
export abstract class PasswordResetSettings {
  /** Địa chỉ trang đặt lại mật khẩu trên frontend; token được nối vào tham số `token`. */
  abstract readonly resetPageUrl: string;
  abstract readonly tokenLifetimeMinutes: number;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly resets: PasswordResetRepository,
    private readonly resetTokens: ResetTokenGenerator,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly email: EmailSender,
    private readonly clock: Clock,
    private readonly settings: PasswordResetSettings,
  ) {}

  /**
   * Gửi liên kết đặt lại mật khẩu tới email của tài khoản. Luôn kết thúc bình thường dù email có
   * tồn tại hay không (hoặc bị khóa/bị giới hạn tần suất) để không lộ tài khoản nào đang có.
   */
  async requestReset(email: string): Promise<void> {
    const normalized = email?.trim().toLowerCase();
    if (!normalized?.includes('@')) return;

    const account = await this.accounts.findByEmail(normalized);
    if (!account || account.disabled) return;

    const now = this.clock.utcNow;
    const recent = await this.resets.countIssuedSince(
      account.id,
      new Date(now.getTime() - HOUR_MS),
    );
    if (recent >= MAX_RESET_REQUESTS_PER_HOUR) return;

    const token = this.resetTokens.generate();
    const lifetimeMinutes = this.settings.tokenLifetimeMinutes;
    await this.resets.issue({
      id: randomUUID(),
      userId: account.id,
      tokenHash: token.hash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + lifetimeMinutes * 60_000),
    });

    await this.safely('email đặt lại mật khẩu', () =>
      this.email.send(
        passwordResetEmail({
          to: account.email,
          name: account.name,
          link: `${this.settings.resetPageUrl}?token=${encodeURIComponent(token.value)}`,
          validMinutes: lifetimeMinutes,
        }),
      ),
    );
  }

  /** Đặt mật khẩu mới bằng token trong email; token chỉ dùng được một lần. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const trimmed = token?.trim();
    if (!trimmed) {
      throw new InvalidPasswordResetTokenException(INVALID_LINK_MESSAGE);
    }

    // Kiểm tra mật khẩu trước khi dùng token để mật khẩu yếu không làm mất liên kết.
    validatePassword(newPassword);

    const now = this.clock.utcNow;
    const userId = await this.resets.redeem(
      this.resetTokens.hash(trimmed),
      await this.passwordHasher.hash(newPassword),
      now,
    );
    if (userId === null) {
      throw new InvalidPasswordResetTokenException(INVALID_LINK_MESSAGE);
    }

    // Người khác có thể đang giữ phiên cũ (đó thường là lý do đặt lại): đăng xuất mọi nơi.
    await this.refreshTokens.revokeByUser(userId, now);

    const account = await this.accounts.findById(userId);
    if (account) {
      await this.safely('email xác nhận đổi mật khẩu', () =>
        this.email.send(
          passwordChangedEmail({ to: account.email, name: account.name }),
        ),
      );
    }
  }

  /** Email chỉ là phần phụ: lỗi gửi được ghi log chứ không làm lộ hay làm hỏng thao tác chính. */
  private async safely(what: string, work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      this.logger.error(
        `Không thể gửi ${what}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
