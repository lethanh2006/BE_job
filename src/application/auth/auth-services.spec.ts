import { ArgumentError, Clock } from '../../domain';
import { Pbkdf2PasswordHasher } from '../../infrastructure/auth/pbkdf2-password-hasher';
import { SecureRefreshTokenGenerator } from '../../infrastructure/auth/secure-refresh-token-generator';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryCompanyRepository } from '../../infrastructure/persistence/in-memory-company-repository';
import { JOB_SEED_FILE } from '../../infrastructure/seed/paths';
import { InMemoryRefreshTokenRepository } from '../../infrastructure/persistence/in-memory-refresh-token-repository';
import { InMemoryUserAccountRepository } from '../../infrastructure/persistence/in-memory-user-account-repository';
import { InMemoryRateLimitStore } from '../../infrastructure/rate-limiting/in-memory-rate-limit-store';
import { MutableClock } from '../../testing/test-helpers';
import { AccessTokenGenerator } from '../abstractions/authentication';
import {
  AccountDisabledException,
  CurrentPasswordIncorrectException,
  CompanyNameAlreadyExistsException,
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
  TooManyRequestsException,
} from '../exceptions';
import {
  LoginAttemptLimiter,
  MAX_FAILURES_PER_CLIENT,
} from './login-attempt-limiter';
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
  const companies = new InMemoryCompanyRepository(JOB_SEED_FILE);
  const accounts = await InMemoryUserAccountRepository.createWithDemoData(
    hasher,
    candidates,
    companies,
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
    companies,
    accounts,
    refreshTokens,
    refreshGenerator,
    login: new LoginService(
      accounts,
      hasher,
      accessTokens,
      refreshGenerator,
      refreshTokens,
      new LoginAttemptLimiter(new InMemoryRateLimitStore(), clock),
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
      accounts,
      companies,
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

describe('LoginService: giới hạn đăng nhập sai', () => {
  it('khóa sau 8 lần sai từ cùng IP, kể cả khi lần sau đúng mật khẩu', async () => {
    const { login } = await createSystem();

    for (let i = 0; i < MAX_FAILURES_PER_CLIENT; i++) {
      await expect(
        login.login('candidate@jobboard.vn', 'sai-mat-khau', 'ip1'),
      ).rejects.toBeInstanceOf(InvalidCredentialsException);
    }

    await expect(
      login.login('candidate@jobboard.vn', PASSWORD, 'ip1'),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
    // IP khác của chính chủ vẫn đăng nhập được.
    await expect(
      login.login('candidate@jobboard.vn', PASSWORD, 'ip2'),
    ).resolves.toMatchObject({ accessToken: 'access-20' });
  });

  it('đăng nhập đúng xóa số lần sai', async () => {
    const { login } = await createSystem();
    for (let i = 0; i < MAX_FAILURES_PER_CLIENT - 1; i++) {
      await login.login('candidate@jobboard.vn', 'sai', 'ip1').catch(() => 0);
    }

    await login.login('candidate@jobboard.vn', PASSWORD, 'ip1');

    for (let i = 0; i < MAX_FAILURES_PER_CLIENT - 1; i++) {
      await login.login('candidate@jobboard.vn', 'sai', 'ip1').catch(() => 0);
    }
    await expect(
      login.login('candidate@jobboard.vn', PASSWORD, 'ip1'),
    ).resolves.toBeDefined();
  });

  it('không đếm yêu cầu thiếu email/mật khẩu', async () => {
    const { login } = await createSystem();

    for (let i = 0; i < MAX_FAILURES_PER_CLIENT * 2; i++) {
      await login.login('candidate@jobboard.vn', '  ', 'ip1').catch(() => 0);
    }

    await expect(
      login.login('candidate@jobboard.vn', PASSWORD, 'ip1'),
    ).resolves.toBeDefined();
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

describe('RegistrationService - nhà tuyển dụng', () => {
  const command = {
    name: ' Lê Chủ ',
    email: ' Chu@Cong-Ty.vn ',
    password: 'Mat-khau-1234',
    companyName: ' Công ty Mới ',
    companyLocation: ' Huế ',
  };

  it('tạo công ty và tài khoản quản lý, cấp phiên đăng nhập', async () => {
    const { registration, companies, accounts, login } = await createSystem();

    const result = await registration.registerEmployer(command);

    expect(result.user).toMatchObject({
      name: 'Lê Chủ',
      email: 'chu@cong-ty.vn',
      role: AccountRole.Employer,
      companyName: 'Công ty Mới',
    });
    const company = (await companies.getById(result.user.companyId!))!;
    expect(company).toMatchObject({ name: 'Công ty Mới', location: 'Huế' });
    expect(company.id).toBeGreaterThanOrEqual(100);
    expect((await accounts.findByEmail('chu@cong-ty.vn'))!.companyId).toBe(
      company.id,
    );
    await expect(
      login.login('chu@cong-ty.vn', 'Mat-khau-1234'),
    ).resolves.toBeDefined();
  });

  it('email hoặc tên công ty trùng (không phân biệt hoa thường) trả lỗi xung đột', async () => {
    const { registration } = await createSystem();

    await expect(
      registration.registerEmployer({
        ...command,
        email: 'EMPLOYER@jobboard.vn',
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyExistsException);
    await expect(
      registration.registerEmployer({
        ...command,
        companyName: 'NOVA technology',
      }),
    ).rejects.toBeInstanceOf(CompanyNameAlreadyExistsException);

    // Lần đăng ký thất bại không để lại tài khoản mồ côi: dùng lại email vẫn đăng ký được.
    await expect(registration.registerEmployer(command)).resolves.toBeDefined();
    await expect(
      registration.registerEmployer({
        ...command,
        companyName: 'Công ty khác',
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyExistsException);
  });

  it('từ chối dữ liệu không hợp lệ', async () => {
    const { registration } = await createSystem();

    await expect(
      registration.registerEmployer({ ...command, companyName: '  ' }),
    ).rejects.toBeInstanceOf(ArgumentError);
    await expect(
      registration.registerEmployer({
        ...command,
        companyName: 'x'.repeat(201),
      }),
    ).rejects.toBeInstanceOf(ArgumentError);
    await expect(
      registration.registerEmployer({ ...command, password: 'yeu' }),
    ).rejects.toBeInstanceOf(ArgumentError);
    await expect(
      registration.registerEmployer({ ...command, email: 'khong-hop-le' }),
    ).rejects.toBeInstanceOf(ArgumentError);
  });

  it('đăng nhập nhà tuyển dụng demo trả tên công ty lấy từ hồ sơ công ty', async () => {
    const { login, companies } = await createSystem();
    (await companies.getById(1))!.updateProfile({ name: 'Nova Group' });

    const result = await login.login('employer@jobboard.vn', PASSWORD);

    expect(result.user).toMatchObject({
      companyId: 1,
      companyName: 'Nova Group',
    });
  });
});

describe('Tài khoản bị khóa', () => {
  it('đăng nhập báo bị khóa (chỉ khi đúng mật khẩu) và refresh token không còn dùng được', async () => {
    const s = await createSystem();
    const session = await s.login.login('candidate@jobboard.vn', PASSWORD);

    await s.accounts.setDisabled(20, true);

    await expect(
      s.login.login('candidate@jobboard.vn', PASSWORD),
    ).rejects.toBeInstanceOf(AccountDisabledException);
    // Sai mật khẩu vẫn trả lỗi chung để không lộ trạng thái tài khoản.
    await expect(
      s.login.login('candidate@jobboard.vn', 'sai'),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    await expect(
      s.session.refresh(session.refreshToken),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenException);

    await s.accounts.setDisabled(20, false);
    await expect(
      s.login.login('candidate@jobboard.vn', PASSWORD),
    ).resolves.toBeDefined();
  });

  it('setDisabled trả false với tài khoản không tồn tại', async () => {
    const s = await createSystem();
    expect(await s.accounts.setDisabled(9999, true)).toBe(false);
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
