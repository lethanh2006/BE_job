import { RefreshTokenRepository } from '../../application/abstractions/authentication';
import { RefreshTokenSession } from '../../application/auth';

export class InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  private readonly sessions = new Map<string, RefreshTokenSession>();

  findByHash(tokenHash: string): Promise<RefreshTokenSession | null> {
    const session = [...this.sessions.values()].find(
      (item) => item.tokenHash === tokenHash,
    );
    return Promise.resolve(session ? clone(session) : null);
  }

  add(session: RefreshTokenSession): Promise<void> {
    this.sessions.set(session.id, clone(session));
    return Promise.resolve();
  }

  /** Xoay token: chỉ thành công nếu phiên hiện tại chưa bị thu hồi (tránh dùng lại đồng thời). */
  tryRotate(
    currentSessionId: string,
    replacementTokenHash: string,
    replacement: RefreshTokenSession,
    revokedAt: Date,
  ): Promise<boolean> {
    const current = this.sessions.get(currentSessionId);
    if (!current || current.revokedAt !== null) return Promise.resolve(false);

    current.revoke(revokedAt, replacementTokenHash);
    this.sessions.set(replacement.id, clone(replacement));
    return Promise.resolve(true);
  }

  revokeByHash(tokenHash: string, revokedAt: Date): Promise<void> {
    [...this.sessions.values()]
      .find((session) => session.tokenHash === tokenHash)
      ?.revoke(revokedAt);
    return Promise.resolve();
  }

  revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    [...this.sessions.values()]
      .filter((session) => session.familyId === familyId)
      .forEach((session) => session.revoke(revokedAt));
    return Promise.resolve();
  }

  revokeByUser(userId: number, revokedAt: Date): Promise<void> {
    [...this.sessions.values()]
      .filter(
        (session) => session.userId === userId && session.revokedAt === null,
      )
      .forEach((session) => session.revoke(revokedAt));
    return Promise.resolve();
  }
}

const clone = (session: RefreshTokenSession): RefreshTokenSession =>
  RefreshTokenSession.restore(
    session.id,
    session.userId,
    session.familyId,
    session.tokenHash,
    session.createdAt,
    session.expiresAt,
    session.revokedAt,
    session.replacedByTokenHash,
  );
