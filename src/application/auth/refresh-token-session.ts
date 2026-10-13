import { randomUUID } from 'node:crypto';
import { ArgumentError } from '../../domain';

export class RefreshTokenSession {
  private revokedAtValue: Date | null;
  private replacedByTokenHashValue: string | null;

  private constructor(
    readonly id: string,
    readonly userId: number,
    readonly familyId: string,
    readonly tokenHash: string,
    readonly createdAt: Date,
    readonly expiresAt: Date,
    revokedAt: Date | null,
    replacedByTokenHash: string | null,
  ) {
    if (!id || !familyId) {
      throw new ArgumentError('Mã phiên đăng nhập không hợp lệ.');
    }
    if (!(userId > 0)) throw new ArgumentError('userId không hợp lệ.');
    if (!tokenHash.trim()) {
      throw new ArgumentError('Hash refresh token không được để trống.');
    }
    if (expiresAt.getTime() <= createdAt.getTime()) {
      throw new ArgumentError('Thời hạn refresh token không hợp lệ.');
    }
    this.revokedAtValue = revokedAt;
    this.replacedByTokenHashValue = replacedByTokenHash;
  }

  get revokedAt(): Date | null {
    return this.revokedAtValue;
  }

  get replacedByTokenHash(): string | null {
    return this.replacedByTokenHashValue;
  }

  isActiveAt(utcNow: Date): boolean {
    return (
      this.revokedAtValue === null &&
      this.expiresAt.getTime() > utcNow.getTime()
    );
  }

  revoke(revokedAt: Date, replacedByTokenHash: string | null = null): void {
    if (this.revokedAtValue !== null) return;
    this.revokedAtValue = revokedAt;
    this.replacedByTokenHashValue = replacedByTokenHash;
  }

  static create(
    userId: number,
    familyId: string,
    tokenHash: string,
    createdAt: Date,
    expiresAt: Date,
  ): RefreshTokenSession {
    return new RefreshTokenSession(
      randomUUID(),
      userId,
      familyId,
      tokenHash,
      createdAt,
      expiresAt,
      null,
      null,
    );
  }

  static restore(
    id: string,
    userId: number,
    familyId: string,
    tokenHash: string,
    createdAt: Date,
    expiresAt: Date,
    revokedAt: Date | null,
    replacedByTokenHash: string | null,
  ): RefreshTokenSession {
    return new RefreshTokenSession(
      id,
      userId,
      familyId,
      tokenHash,
      createdAt,
      expiresAt,
      revokedAt,
      replacedByTokenHash,
    );
  }
}

export interface IssuedRefreshToken {
  value: string;
  session: RefreshTokenSession;
}
