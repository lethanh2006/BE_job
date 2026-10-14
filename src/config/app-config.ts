export interface JwtConfig {
  issuer: string;
  audience: string;
  signingKey: string;
  accessTokenMinutes: number;
  refreshTokenDays: number;
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
    );
  }
}
