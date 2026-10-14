import { AppConfig } from './app-config';

const production = {
  NODE_ENV: 'production',
  JWT_SIGNING_KEY: 'khoa-ky-jwt-production-dai-hon-32-byte',
  CORS_ALLOWED_ORIGINS: 'https://jobboard.vn',
};

describe('AppConfig: email', () => {
  it('mặc định ghi log và in nội dung email ngoài production', () => {
    const { email } = AppConfig.fromEnv({});

    expect(email).toEqual({
      provider: 'Log',
      from: 'JobBoard <no-reply@jobboard.vn>',
      smtp: null,
      logMessageBodies: true,
    });
  });

  it('production không in nội dung email ra log', () => {
    expect(AppConfig.fromEnv(production).email.logMessageBodies).toBe(false);
  });

  it('đọc cấu hình SMTP; cổng 465 mặc định dùng TLS ngay từ đầu', () => {
    const base = {
      EMAIL_PROVIDER: 'Smtp',
      SMTP_HOST: ' smtp.example.com ',
      EMAIL_FROM: 'Tuyển dụng <hr@example.com>',
    };

    expect(AppConfig.fromEnv(base).email).toMatchObject({
      provider: 'Smtp',
      from: 'Tuyển dụng <hr@example.com>',
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: null,
        password: null,
      },
    });
    expect(
      AppConfig.fromEnv({ ...base, SMTP_PORT: '465' }).email.smtp?.secure,
    ).toBe(true);
    expect(
      AppConfig.fromEnv({
        ...base,
        SMTP_PORT: '465',
        SMTP_SECURE: 'false',
        SMTP_USER: 'bot',
        SMTP_PASSWORD: 'bi-mat',
      }).email.smtp,
    ).toMatchObject({ secure: false, user: 'bot', password: 'bi-mat' });
  });

  it.each([
    [{ EMAIL_PROVIDER: 'Gmail' }, 'EMAIL_PROVIDER'],
    [{ EMAIL_PROVIDER: 'Smtp' }, 'SMTP_HOST'],
    [{ EMAIL_PROVIDER: 'Smtp', SMTP_HOST: 'h', SMTP_PORT: '0' }, 'SMTP_PORT'],
    [{ EMAIL_PROVIDER: 'Smtp', SMTP_HOST: 'h', SMTP_PORT: 'abc' }, 'SMTP_PORT'],
    [
      { EMAIL_PROVIDER: 'Smtp', SMTP_HOST: 'h', SMTP_USER: 'bot' },
      'SMTP_USER và SMTP_PASSWORD',
    ],
    [
      { EMAIL_PROVIDER: 'Smtp', SMTP_HOST: 'h', SMTP_PASSWORD: 'x' },
      'SMTP_USER và SMTP_PASSWORD',
    ],
  ])('từ chối cấu hình sai %j', (env, expected) => {
    expect(() => AppConfig.fromEnv(env)).toThrow(expected);
  });
});

describe('AppConfig: đặt lại mật khẩu', () => {
  it('mặc định trỏ về frontend local và token sống 30 phút', () => {
    expect(AppConfig.fromEnv({}).passwordReset).toEqual({
      resetPageUrl: 'http://localhost:3000/dat-lai-mat-khau',
      tokenMinutes: 30,
    });
  });

  it('lấy địa chỉ frontend từ FRONTEND_URL, rồi tới origin CORS đầu tiên', () => {
    expect(
      AppConfig.fromEnv({
        ...production,
        FRONTEND_URL: 'https://www.jobboard.vn/',
        PASSWORD_RESET_MINUTES: '15',
      }).passwordReset,
    ).toEqual({
      resetPageUrl: 'https://www.jobboard.vn/dat-lai-mat-khau',
      tokenMinutes: 15,
    });
    expect(
      AppConfig.fromEnv({
        ...production,
        CORS_ALLOWED_ORIGINS: 'https://jobboard.vn, https://admin.jobboard.vn',
      }).passwordReset.resetPageUrl,
    ).toBe('https://jobboard.vn/dat-lai-mat-khau');
  });

  it('production phải biết địa chỉ frontend', () => {
    expect(() =>
      AppConfig.fromEnv({ ...production, CORS_ALLOWED_ORIGINS: '' }),
    ).toThrow('FRONTEND_URL');
  });

  it.each([
    [{ FRONTEND_URL: 'ftp://jobboard.vn' }, 'FRONTEND_URL'],
    [{ FRONTEND_URL: 'jobboard.vn' }, 'FRONTEND_URL'],
    [{ PASSWORD_RESET_MINUTES: '0' }, 'PASSWORD_RESET_MINUTES'],
    [{ PASSWORD_RESET_MINUTES: '1441' }, 'PASSWORD_RESET_MINUTES'],
    [{ PASSWORD_RESET_MINUTES: 'abc' }, 'PASSWORD_RESET_MINUTES'],
  ])('từ chối cấu hình sai %j', (env, expected) => {
    expect(() => AppConfig.fromEnv(env)).toThrow(expected);
  });
});

describe('AppConfig: bảo mật', () => {
  it('bật giới hạn tần suất mặc định, trừ khi NODE_ENV=test hoặc tắt rõ ràng', () => {
    expect(AppConfig.fromEnv({}).security.rateLimitEnabled).toBe(true);
    expect(
      AppConfig.fromEnv({ NODE_ENV: 'test' }).security.rateLimitEnabled,
    ).toBe(false);
    expect(
      AppConfig.fromEnv({ NODE_ENV: 'test', RATE_LIMIT_ENABLED: 'true' })
        .security.rateLimitEnabled,
    ).toBe(true);
    expect(
      AppConfig.fromEnv({ RATE_LIMIT_ENABLED: 'false' }).security
        .rateLimitEnabled,
    ).toBe(false);
  });

  it('proxy tin cậy: dev tin loopback, production mặc định không tin ai', () => {
    expect(AppConfig.fromEnv({}).security.trustProxy).toEqual(['loopback']);
    expect(AppConfig.fromEnv(production).security.trustProxy).toBe(false);
  });

  it.each([
    ['true', true],
    ['false', false],
    ['1', 1],
    ['2', 2],
    ['0', false],
    ['loopback', ['loopback']],
    [' 10.0.0.0/8 , loopback ,, ', ['10.0.0.0/8', 'loopback']],
  ])('đọc TRUST_PROXY=%j', (raw, expected) => {
    expect(AppConfig.fromEnv({ TRUST_PROXY: raw }).security.trustProxy).toEqual(
      expected,
    );
  });

  it('TRUST_PROXY chỉ có dấu phẩy là không hợp lệ', () => {
    expect(() => AppConfig.fromEnv({ TRUST_PROXY: ' , ' })).toThrow(
      'TRUST_PROXY',
    );
  });
});

describe('AppConfig: dữ liệu demo và quản trị viên đầu tiên', () => {
  it('nạp dữ liệu demo mặc định khi áp migration ngoài production, không nạp ở production', () => {
    expect(AppConfig.fromEnv({}).persistence.seedDemoData).toBe(false);
    expect(
      AppConfig.fromEnv({ PERSISTENCE_APPLY_MIGRATIONS: 'true' }).persistence
        .seedDemoData,
    ).toBe(true);
    expect(
      AppConfig.fromEnv({
        ...production,
        PERSISTENCE_PROVIDER: 'PostgreSql',
        DATABASE_URL: 'postgres://u:p@db:5432/jobboard',
        PERSISTENCE_APPLY_MIGRATIONS: 'true',
      }).persistence.seedDemoData,
    ).toBe(false);
  });

  it('PERSISTENCE_SEED_DEMO_DATA ghi đè mặc định ở cả hai chiều', () => {
    expect(
      AppConfig.fromEnv({
        PERSISTENCE_APPLY_MIGRATIONS: 'true',
        PERSISTENCE_SEED_DEMO_DATA: 'false',
      }).persistence.seedDemoData,
    ).toBe(false);
    expect(
      AppConfig.fromEnv({
        ...production,
        PERSISTENCE_SEED_DEMO_DATA: 'true',
      }).persistence.seedDemoData,
    ).toBe(true);
  });

  it('đọc quản trị viên đầu tiên, tên mặc định "Quản trị viên"', () => {
    expect(AppConfig.fromEnv({}).persistence.bootstrapAdmin).toBeNull();
    expect(
      AppConfig.fromEnv({
        BOOTSTRAP_ADMIN_EMAIL: ' chu@example.com ',
        BOOTSTRAP_ADMIN_PASSWORD: 'MatKhauAdmin#2026',
      }).persistence.bootstrapAdmin,
    ).toEqual({
      name: 'Quản trị viên',
      email: 'chu@example.com',
      password: 'MatKhauAdmin#2026',
    });
    expect(
      AppConfig.fromEnv({
        BOOTSTRAP_ADMIN_EMAIL: 'chu@example.com',
        BOOTSTRAP_ADMIN_PASSWORD: 'MatKhauAdmin#2026',
        BOOTSTRAP_ADMIN_NAME: 'Chủ Hệ Thống',
      }).persistence.bootstrapAdmin?.name,
    ).toBe('Chủ Hệ Thống');
  });

  it.each([
    [{ BOOTSTRAP_ADMIN_EMAIL: 'chu@example.com' }, 'phải được đặt cùng nhau'],
    [
      { BOOTSTRAP_ADMIN_PASSWORD: 'MatKhauAdmin#2026' },
      'phải được đặt cùng nhau',
    ],
    [
      {
        BOOTSTRAP_ADMIN_EMAIL: 'khong-phai-email',
        BOOTSTRAP_ADMIN_PASSWORD: 'MatKhauAdmin#2026',
      },
      'BOOTSTRAP_ADMIN_EMAIL không hợp lệ',
    ],
    [
      {
        BOOTSTRAP_ADMIN_EMAIL: 'chu@example.com',
        BOOTSTRAP_ADMIN_PASSWORD: 'yeu',
      },
      'không đạt chính sách mật khẩu',
    ],
  ])('từ chối cấu hình quản trị viên sai %j', (env, expected) => {
    expect(() => AppConfig.fromEnv(env)).toThrow(expected);
  });
});
