import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Clock } from '../../domain';
import { RefreshTokenGenerator } from '../../application/abstractions/authentication';
import {
  IssuedRefreshToken,
  RefreshTokenSession,
} from '../../application/auth';

const TOKEN_BYTES = 64;

export class SecureRefreshTokenGenerator extends RefreshTokenGenerator {
  constructor(
    private readonly clock: Clock,
    private readonly lifetimeMs: number,
  ) {
    super();
    if (!(lifetimeMs > 0)) throw new RangeError('Thời hạn token không hợp lệ.');
  }

  generate(userId: number, familyId?: string): IssuedRefreshToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const createdAt = this.clock.utcNow;
    const session = RefreshTokenSession.create(
      userId,
      familyId ?? randomUUID(),
      this.hash(token),
      createdAt,
      new Date(createdAt.getTime() + this.lifetimeMs),
    );

    return { value: token, session };
  }

  hash(token: string): string {
    if (!token?.trim()) throw new Error('Token không được để trống.');
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
