import { ArgumentError, Clock } from '../../domain';
import { Pbkdf2PasswordHasher } from '../../infrastructure/auth/pbkdf2-password-hasher';
import { SecureRefreshTokenGenerator } from '../../infrastructure/auth/secure-refresh-token-generator';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryRefreshTokenRepository } from '../../infrastructure/persistence/in-memory-refresh-token-repository';
import { InMemoryUserAccountRepository } from '../../infrastructure/persistence/in-memory-user-account-repository';
import { MutableClock } from '../../testing/test-helpers';
import { AccessTokenGenerator } from '../abstractions/authentication';
import {
  CurrentPasswordIncorrectException,
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
} from '../exceptions';
import { LoginService } from './login.service';
import { AccessToken, AccountRole, UserAccount } from './models';
import { PasswordChangeService } from './password-change.service';
import { RegistrationService } from './registration.service';
import { SessionService } from './session.service';

class FakeAccessTokenGenerator extends AccessTokenGenerator {
  constructor(private readonly clock: Clock) {
    super();
  }
  generate(account: UserAccount): Promise<AccessToken> {
    return Promise.resolve({
      value: `access-${account.id}`,
      expiresAt: new Date(this.clock.utcNow.getTime() + 900_000),
    });
  }
}

async function createSystem() {
  const clock = new MutableClock();
  const hasher = new Pbkdf2PasswordHasher();
  const candidates = new InMemoryCandidateRepository();
  const accounts = await InMemoryUserAccountRepository.createWithDemoData(
    hasher,
    candidates,
  );
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const refreshGenerator = new SecureRefreshTokenGenerator(
    clock,
    7 * 86_400_000,
  );
  const accessTokens = new FakeAccessTokenGenerator(clock);

  return {
    clock,
    hasher,
    candidates,
    accounts,
    refreshTokens,
    refreshGenerator,
    login: new LoginService(
      accounts,
      hasher,
      accessTokens,
      refreshGenerator,
      refreshTokens,
    ),
    session: new SessionService(
      accounts,
      refreshTokens,
      refreshGenerator,
      accessTokens,
      clock,
    ),
    registration: new RegistrationService(
      accounts,
      hasher,
      accessTokens,
      refreshGenerator,
      refreshTokens,
    ),
    passwordChange: new PasswordChangeService(
      accounts,
      accounts,
      hasher,
      refreshTokens,
      clock,
    ),
  };
}

const PASSWORD = 'JobBoard@123';

describe('LoginService', () => {
  it('đăng nhập đúng trả access/refresh token và thông tin người dùng', async () => {
    const { login, refreshGenerator, refreshTokens } = await createSystem();

    const result = await login.login('  Employer@JobBoard.vn ', PASSWORD);

    expect(result.accessToken).toBe('access-1');
    expect(result.user).toMatchObject({
      role: AccountRole.Employer,
      companyId: 1,
      companyName: 'Nova Technology',
    });
    expect(
      await refreshTokens.findByHash(
        refreshGenerator.hash(result.refreshToken),
      ),
    ).not.toBeNull();
  });

  it('email lạ và sai mật khẩu cùng trả một lỗi', async () => {
    const { login } = await createSystem();

    const unknown = await login
      .login('x@x.vn', PASSWORD)
      .catch((e: Error) => e);
    const wrong = await login
      .login('candidate@jobboard.vn', 'sai')
      .catch((e: Error) => e);

    expect(unknown).toBeInstanceOf(InvalidCredentialsException);
    expect(wrong).toBeInstanceOf(InvalidCredentialsException);
    expect((unknown as Error).message).toBe((wrong as Error).message);
  });
});

describe('SessionService', () => {
  it('refresh xoay token: token cũ bị thu hồi, token mới dùng được', async () => {
    const { login, session, refreshTokens, refreshGenerator } =
      await createSystem();
    const first = await login.login('candidate@jobboard.vn', PASSWORD);

    const second = await session.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    const old = await refreshTokens.findByHash(
      refreshGenerator.hash(first.refreshToken),
    );
    expect(old!.revokedAt).not.toBeNull();
    expect(old!.replacedByTokenHash).toBe(
      refreshGenerator.hash(second.refreshToken),
    );
    await expect(session.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('dùng lại token đã thu hồi sẽ thu hồi cả họ token', async () => {
    const { login, session } = await createSystem();
    const first = await login.login('candidate@jobboard.vn', PASSWORD);
    const second = await session.refresh(first.refreshToken);

    await expect(session.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
    await expect(session.refresh(second.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
  });

  it('token hết hạn bị từ chối và thu hồi', async () => {
    const { login, session, clock } = await createSystem();
    const first = await login.login('candidate@jobboard.vn', PASSWORD);
    clock.advanceDays(8);

    await expect(session.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
  });

  it('logout thu hồi phiên hiện tại và bỏ qua token rỗng', async () => {
    const { login, session } = await createSystem();
    const first = await login.login('candidate@jobboard.vn', PASSWORD);

    await session.logout('');
    await session.logout(first.refreshToken);

    await expect(session.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
  });

  it('tryRotate chỉ thành công một lần cho mỗi phiên', async () => {
    const { refreshTokens, refreshGenerator, clock } = await createSystem();
    const issued = refreshGenerator.generate(20);
    await refreshTokens.add(issued.session);
    const a = refreshGenerator.generate(20, issued.session.familyId);
    const b = refreshGenerator.generate(20, issued.session.familyId);

    expect(
      await refreshTokens.tryRotate(
        issued.session.id,
        a.session.tokenHash,
        a.session,
        clock.utcNow,
      ),
    ).toBe(true);
    expect(
      await refreshTokens.tryRotate(
        issued.session.id,
        b.session.tokenHash,
        b.session,
        clock.utcNow,
      ),
    ).toBe(false);
  });
});

describe('RegistrationService', () => {
  it('tạo tài khoản + hồ sơ ứng viên và cấp phiên đầu tiên', async () => {
    const { registration, candidates, accounts } = await createSystem();

    const result = await registration.registerCandidate(
      '  Lê Mới ',
      ' New@Example.com ',
      'Mat-khau-1234',
    );

    expect(result.user).toMatchObject({
      name: 'Lê Mới',
      email: 'new@example.com',
      role: AccountRole.Candidate,
    });
    expect((await candidates.getById(result.user.id))!.name).toBe('Lê Mới');
    expect(await accounts.findByEmail('new@example.com')).not.toBeNull();
    expect(result.user.id).toBeGreaterThan(100);
  });

  it('email trùng (không phân biệt hoa thường) trả lỗi xung đột', async () => {
    const { registration } = await createSystem();

    await expect(
      registration.registerCandidate(
        'A',
        'CANDIDATE@jobboard.vn',
        'Mat-khau-1234',
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyExistsException);
  });

  it.each([
    '',
    'ngan1A!',
    'khongcohoa1!aaa',
    'KHONGCOTHUONG1!AAA',
    'KhongCoSo!!!!!!',
    'KhongCoKyTuDacBiet1',
  ])('mật khẩu yếu %p bị từ chối', async (password) => {
    const { registration } = await createSystem();
    await expect(
      registration.registerCandidate('A', 'a@b.co', password),
    ).rejects.toBeInstanceOf(ArgumentError);
  });

  it('email sai định dạng hoặc tên rỗng bị từ chối', async () => {
    const { registration } = await createSystem();
    await expect(
      registration.registerCandidate('A', 'khong-phai-email', 'Mat-khau-1234'),
    ).rejects.toBeInstanceOf(ArgumentError);
    await expect(
      registration.registerCandidate('  ', 'a@b.co', 'Mat-khau-1234'),
    ).rejects.toBeInstanceOf(ArgumentError);
  });
});

describe('PasswordChangeService', () => {
  it('đổi mật khẩu cập nhật hash và thu hồi mọi phiên của tài khoản', async () => {
    const s = await createSystem();
    const a = await s.login.login('candidate@jobboard.vn', PASSWORD);
    const b = await s.login.login('candidate@jobboard.vn', PASSWORD);
    const other = await s.login.login('employer@jobboard.vn', PASSWORD);

    await s.passwordChange.change(20, PASSWORD, 'Mat-khau-moi-1');

    await expect(s.session.refresh(a.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
    await expect(s.session.refresh(b.refreshToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenException,
    );
    await expect(s.session.refresh(other.refreshToken)).resolves.toBeDefined();
    await expect(
      s.login.login('candidate@jobboard.vn', 'Mat-khau-moi-1'),
    ).resolves.toBeDefined();
    await expect(
      s.login.login('candidate@jobboard.vn', PASSWORD),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('từ chối mật khẩu hiện tại sai, mật khẩu mới yếu hoặc trùng mật khẩu cũ', async () => {
    const s = await createSystem();

    await expect(
      s.passwordChange.change(20, 'sai', 'Mat-khau-moi-1'),
    ).rejects.toBeInstanceOf(CurrentPasswordIncorrectException);
    await expect(
      s.passwordChange.change(20, PASSWORD, 'yeu'),
    ).rejects.toBeInstanceOf(ArgumentError);
    await expect(
      s.passwordChange.change(20, PASSWORD, PASSWORD),
    ).rejects.toBeInstanceOf(ArgumentError);
    await expect(
      s.login.login('candidate@jobboard.vn', PASSWORD),
    ).resolves.toBeDefined();
  });

  it('đổi mật khẩu đồng thời: yêu cầu thua phải đăng nhập lại', async () => {
    const s = await createSystem();
    const stale = (await s.accounts.findById(20))!;
    await s.accounts.tryUpdatePasswordHash(
      20,
      stale.passwordHash,
      await s.hasher.hash('Mat-khau-khac-1'),
    );

    // Mô phỏng yêu cầu đọc hash cũ rồi mới ghi: dùng đúng hash cũ → cập nhật có điều kiện thất bại.
    expect(
      await s.accounts.tryUpdatePasswordHash(20, stale.passwordHash, 'x'),
    ).toBe(false);
  });
});
