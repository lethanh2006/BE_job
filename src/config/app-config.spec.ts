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
