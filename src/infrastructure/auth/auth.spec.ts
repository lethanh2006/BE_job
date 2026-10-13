import { Clock } from '../../domain';
import { Pbkdf2PasswordHasher } from './pbkdf2-password-hasher';
import { SecureRefreshTokenGenerator } from './secure-refresh-token-generator';

describe('Pbkdf2PasswordHasher', () => {
  const hasher = new Pbkdf2PasswordHasher();

  it('hash có salt ngẫu nhiên và verify đúng/sai', async () => {
    const [a, b] = await Promise.all([
      hasher.hash('Mat-khau-1'),
      hasher.hash('Mat-khau-1'),
    ]);
    expect(a).not.toBe(b);
    expect(a.split('.')).toHaveLength(4);
    expect(await hasher.verify('Mat-khau-1', a)).toBe(true);
    expect(await hasher.verify('Mat-khau-2', a)).toBe(false);
    expect(await hasher.verify('Mat-khau-1', 'rac.rac')).toBe(false);
  });
});

describe('SecureRefreshTokenGenerator', () => {
  const clock = { utcNow: new Date('2026-10-01T00:00:00Z') } as Clock;
  const generator = new SecureRefreshTokenGenerator(
    clock,
    7 * 24 * 3600 * 1000,
  );

  it('chỉ lưu hash, giữ nguyên family khi xoay', () => {
    const first = generator.generate(5);
    expect(first.session.tokenHash).toBe(generator.hash(first.value));
    expect(first.session.tokenHash).not.toBe(first.value);

    const next = generator.generate(5, first.session.familyId);
    expect(next.session.familyId).toBe(first.session.familyId);
    expect(next.value).not.toBe(first.value);
    expect(first.session.expiresAt.toISOString()).toBe(
      '2026-10-08T00:00:00.000Z',
    );
  });
});
