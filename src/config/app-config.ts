export interface JwtConfig {
  issuer: string;
  audience: string;
  signingKey: string;
  accessTokenMinutes: number;
  refreshTokenDays: number;
}

export class AppConfig {
  constructor(
    readonly port: number,
    readonly corsAllowedOrigins: readonly string[],
    readonly jwt: JwtConfig,
  ) {}

  /** Đọc cấu hình từ biến môi trường; thiếu/không hợp lệ thì dừng ngay khi khởi động. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const isProduction = env.NODE_ENV === 'production';
    const provider = env.PERSISTENCE_PROVIDER ?? 'InMemory';
    if (provider !== 'InMemory') {
      throw new Error('PERSISTENCE_PROVIDER hiện chỉ hỗ trợ giá trị InMemory.');
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

    return new AppConfig(Number(env.PORT ?? 5000), origins, jwt);
  }
}
