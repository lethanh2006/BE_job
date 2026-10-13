import { Injectable } from '@nestjs/common';
import { ArgumentError, Clock } from '../../domain';
import {
  AccountSecurityRepository,
  PasswordHasher,
  RefreshTokenRepository,
  UserAccountRepository,
} from '../abstractions/authentication';
import {
  CurrentPasswordIncorrectException,
  ResourceNotFoundException,
} from '../exceptions';
import { validatePassword } from './password-policy';

@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly accountSecurity: AccountSecurityRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly clock: Clock,
  ) {}

  async change(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!currentPassword?.trim()) {
      throw new CurrentPasswordIncorrectException(
        'Mật khẩu hiện tại không chính xác.',
      );
    }

    validatePassword(newPassword);
    const account = await this.accounts.findById(userId);
    if (!account) {
      throw new ResourceNotFoundException('Không tìm thấy tài khoản.');
    }

    if (
      !(await this.passwordHasher.verify(currentPassword, account.passwordHash))
    ) {
      throw new CurrentPasswordIncorrectException(
        'Mật khẩu hiện tại không chính xác.',
      );
    }
    if (await this.passwordHasher.verify(newPassword, account.passwordHash)) {
      throw new ArgumentError('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const updated = await this.accountSecurity.tryUpdatePasswordHash(
      userId,
      account.passwordHash,
      await this.passwordHasher.hash(newPassword),
    );
    if (!updated) {
      throw new CurrentPasswordIncorrectException(
        'Mật khẩu đã được thay đổi bởi một yêu cầu khác. Vui lòng đăng nhập lại.',
      );
    }

    await this.refreshTokens.revokeByUser(userId, this.clock.utcNow);
  }
}
