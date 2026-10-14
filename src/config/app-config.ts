import { resolve } from 'node:path';

export interface JwtConfig {
  issuer: string;
  audience: string;
  signingKey: string;
  accessTokenMinutes: number;
  refreshTokenDays: number;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS ngay từ đầu kết nối (cổng 465); cổng khác dùng STARTTLS khi máy chủ hỗ trợ. */
  secure: boolean;
  user: string | null;
  password: string | null;
}

export type EmailProvider = 'Log' | 'Smtp';

export interface EmailConfig {
  provider: EmailProvider;
  /** Địa chỉ người gửi hiển thị trong email. */
  from: string;
  /** Chỉ có khi provider là Smtp. */
  smtp: SmtpConfig | null;
  /** In nội dung email (có liên kết đặt lại mật khẩu) ra log; chỉ bật ngoài production. */
  logMessageBodies: boolean;
}

export interface PasswordResetConfig {
  /** Trang đặt lại mật khẩu trên frontend, nơi liên kết trong email dẫn tới. */
  resetPageUrl: string;
  tokenMinutes: number;
}

export type PersistenceProvider = 'InMemory' | 'PostgreSql';

export interface PersistenceConfig {
  provider: PersistenceProvider;
  /** Chuỗi kết nối PostgreSQL; chỉ có khi provider là PostgreSql. */
  databaseUrl: string | null;
  /** Tự áp migration và seed dữ liệu mẫu khi khởi động. */
  applyMigrations: boolean;
}

const DEV_DATABASE_URL =
  'postgres://jobboard:jobboard_dev_password@localhost:5434/jobboard';
const DEFAULT_EMAIL_FROM = 'JobBoard <no-reply@jobboard.vn>';
const DEV_FRONTEND_URL = 'http://localhost:3000';

export class AppConfig {
  constructor(
    readonly port: number,
    readonly corsAllowedOrigins: readonly string[],
    readonly jwt: JwtConfig,
    readonly persistence: PersistenceConfig = {
      provider: 'InMemory',
      databaseUrl: null,
      applyMigrations: false,
    },
    /** Phát OpenAPI/Swagger UI; mặc định bật ở môi trường không phải production. */
    readonly openApiEnabled = false,
    /** Thư mục lưu tệp CV khi dùng PostgreSql (provider InMemory giữ tệp trong bộ nhớ). */
    readonly storageDirectory = resolve('storage'),
    readonly email: EmailConfig = {
      provider: 'Log',
      from: DEFAULT_EMAIL_FROM,
      smtp: null,
      logMessageBodies: true,
    },
    readonly passwordReset: PasswordResetConfig = {
      resetPageUrl: `${DEV_FRONTEND_URL}/dat-lai-mat-khau`,
      tokenMinutes: 30,
    },
  ) {}

  /** Đọc cấu hình từ biến môi trường; thiếu/không hợp lệ thì dừng ngay khi khởi động. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const isProduction = env.NODE_ENV === 'production';
    const provider = env.PERSISTENCE_PROVIDER ?? 'InMemory';
    if (provider !== 'InMemory' && provider !== 'PostgreSql') {
      throw new Error(
        'PERSISTENCE_PROVIDER chỉ nhận giá trị InMemory hoặc PostgreSql.',
      );
    }
    const databaseUrl =
      provider === 'PostgreSql'
        ? (env.DATABASE_URL ?? (isProduction ? '' : DEV_DATABASE_URL))
        : null;
    if (provider === 'PostgreSql' && !databaseUrl) {
      throw new Error('DATABASE_URL là bắt buộc khi dùng PostgreSql.');
    }

    const signingKey =
      env.JWT_SIGNING_KEY ??
      (isProduction
        ? ''
        : 'jobboard-development-signing-key-change-before-production-2026');
    const jwt: JwtConfig = {
      issuer: env.JWT_ISSUER ?? 'JobBoard.Api',
      audience: env.JWT_AUDIENCE ?? 'JobBoard.Web',
      signingKey,
      accessTokenMinutes: Number(env.JWT_ACCESS_TOKEN_MINUTES ?? 15),
      refreshTokenDays: Number(env.JWT_REFRESH_TOKEN_DAYS ?? 7),
    };

    if (
      !jwt.issuer ||
      !jwt.audience ||
      !(jwt.accessTokenMinutes > 0) ||
      !(jwt.refreshTokenDays > 0) ||
      Buffer.byteLength(jwt.signingKey, 'utf8') < 32
    ) {
      throw new Error(
        'Cấu hình JWT không hợp lệ; JWT_SIGNING_KEY phải dài ít nhất 32 byte.',
      );
    }

    const origins = (
      env.CORS_ALLOWED_ORIGINS ?? (isProduction ? '' : 'http://localhost:3000')
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    return new AppConfig(
      Number(env.PORT ?? 5000),
      origins,
      jwt,
      {
        provider,
        databaseUrl,
        applyMigrations: env.PERSISTENCE_APPLY_MIGRATIONS === 'true',
      },
      env.OPENAPI_ENABLED ? env.OPENAPI_ENABLED === 'true' : !isProduction,
      resolve(env.STORAGE_DIR ?? 'storage'),
      AppConfig.emailFromEnv(env, isProduction),
      AppConfig.passwordResetFromEnv(env, origins, isProduction),
    );
  }

  private static emailFromEnv(
    env: NodeJS.ProcessEnv,
    isProduction: boolean,
  ): EmailConfig {
    const provider = env.EMAIL_PROVIDER ?? 'Log';
    if (provider !== 'Log' && provider !== 'Smtp') {
      throw new Error('EMAIL_PROVIDER chỉ nhận giá trị Log hoặc Smtp.');
    }

    let smtp: SmtpConfig | null = null;
    if (provider === 'Smtp') {
      const host = env.SMTP_HOST?.trim();
      if (!host) throw new Error('SMTP_HOST là bắt buộc khi dùng Smtp.');

      const port = Number(env.SMTP_PORT ?? 587);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT không hợp lệ.');
      }

      const user = env.SMTP_USER?.trim() || null;
      const password = env.SMTP_PASSWORD || null;
      if ((user === null) !== (password === null)) {
        throw new Error('SMTP_USER và SMTP_PASSWORD phải được đặt cùng nhau.');
      }

      smtp = {
        host,
        port,
        secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
        user,
        password,
      };
    }

    return {
      provider,
      from: env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM,
      smtp,
      logMessageBodies: !isProduction,
    };
  }

  private static passwordResetFromEnv(
    env: NodeJS.ProcessEnv,
    corsOrigins: readonly string[],
    isProduction: boolean,
  ): PasswordResetConfig {
    const tokenMinutes = Number(env.PASSWORD_RESET_MINUTES ?? 30);
    if (!(tokenMinutes >= 1 && tokenMinutes <= 1440)) {
      throw new Error('PASSWORD_RESET_MINUTES phải nằm trong khoảng 1–1440.');
    }

    const frontendUrl = (
      env.FRONTEND_URL ??
      corsOrigins[0] ??
      (isProduction ? '' : DEV_FRONTEND_URL)
    )
      .trim()
      .replace(/\/+$/, '');
    if (!frontendUrl) {
      throw new Error(
        'FRONTEND_URL là bắt buộc ở production (hoặc đặt CORS_ALLOWED_ORIGINS).',
      );
    }
    if (!/^https?:\/\//.test(frontendUrl) || !URL.canParse(frontendUrl)) {
      throw new Error('FRONTEND_URL phải là địa chỉ http(s) hợp lệ.');
    }

    return { resetPageUrl: `${frontendUrl}/dat-lai-mat-khau`, tokenMinutes };
  }
}
