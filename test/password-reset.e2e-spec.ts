import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import {
  AccountSecurityRepository,
  PasswordResetRepository,
  UserAccountRepository,
} from '../src/application/abstractions/authentication';
import { EmailSender } from '../src/application/abstractions/email';
import { AppConfig } from '../src/config/app-config';
import { setupOpenApi } from '../src/openapi';
import {
  extractResetToken,
  InMemoryEmailSender,
} from '../src/testing/in-memory-email-sender';
import { createTestDatabase } from './support/postgres-test-database';

const providers = [
  'InMemory',
  ...(process.env.E2E_POSTGRES_URL ? ['PostgreSql'] : []),
];

const PASSWORD = 'JobBoard@123';
const NEW_PASSWORD = 'MatKhau#Moi2026';

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

async function startApp(
  config: AppConfig,
  emails: InMemoryEmailSender,
): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  })
    .overrideProvider(EmailSender)
    .useValue(emails)
    .compile();
  const app = module.createNestApplication();
  configureApp(app, config);
  setupOpenApi(app);
  await app.init();
  return app;
}

function configFor(provider: string, database?: TestDatabase) {
  return AppConfig.fromEnv({
    NODE_ENV: 'test',
    JWT_SIGNING_KEY: 'test-signing-key-test-signing-key-123456',
    PERSISTENCE_PROVIDER: provider,
    FRONTEND_URL: 'https://app.test',
    ...(database
      ? { DATABASE_URL: database.url, PERSISTENCE_APPLY_MIGRATIONS: 'true' }
      : {}),
  });
}

describe.each(providers)('Quên mật khẩu — %s', (provider) => {
  let app: INestApplication;
  let database: TestDatabase | undefined;
  let config: AppConfig;
  let admin: string;
  const emails = new InMemoryEmailSender();
  const http = () => request(app.getHttpServer());
  let counter = 0;

  const forgot = (email: string) =>
    http().post('/api/auth/forgot-password').send({ email });
  const reset = (token: string, newPassword = NEW_PASSWORD) =>
    http().post('/api/auth/reset-password').send({ token, newPassword });
  const login = (email: string, password: string) =>
    http().post('/api/auth/login').send({ email, password });

  /** Mỗi test dùng tài khoản riêng để đổi mật khẩu không ảnh hưởng test khác. */
  async function registerAccount() {
    const email = `quen-mat-khau-${++counter}@tests.vn`;
    const response = await http()
      .post('/api/auth/register/candidate')
      .send({ name: 'Người Quên', email, password: PASSWORD })
      .expect(201);
    return {
      email,
      userId: response.body.user.id as number,
      refreshToken: response.body.refreshToken as string,
    };
  }

  async function requestToken(email: string): Promise<string> {
    emails.clear();
    await forgot(email).expect(202);
    expect(emails.to(email)).toHaveLength(1);
    return extractResetToken(emails.to(email)[0]);
  }

  beforeAll(async () => {
    if (provider === 'PostgreSql') {
      database = await createTestDatabase(process.env.E2E_POSTGRES_URL!);
    }
    config = configFor(provider, database);
    app = await startApp(config, emails);
    admin = (await login('admin@jobboard.vn', PASSWORD).expect(200)).body
      .accessToken;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.drop();
  });

  beforeEach(() => emails.clear());

  it('tài liệu OpenAPI có hai route và dữ liệu sai bị từ chối', async () => {
    const docs = (await http().get('/api/openapi.json').expect(200)).body;
    expect(
      docs.paths['/api/auth/forgot-password'].post.responses['202'],
    ).toBeDefined();
    expect(
      docs.paths['/api/auth/reset-password'].post.responses['204'],
    ).toBeDefined();

    await http().post('/api/auth/forgot-password').send({}).expect(400);
    await http()
      .post('/api/auth/forgot-password')
      .send({ email: 7 })
      .expect(400);
    await http()
      .post('/api/auth/reset-password')
      .send({ token: 'x' })
      .expect(400);
    await http()
      .post('/api/auth/reset-password')
      .send({ token: 'x'.repeat(257), newPassword: NEW_PASSWORD })
      .expect(400);
    expect(emails.sent).toHaveLength(0);
  });

  it('trả cùng một phản hồi cho email có và không tồn tại; chỉ tài khoản thật nhận email', async () => {
    const account = await registerAccount();

    const known = await forgot(account.email).expect(202);
    const unknown = await forgot('khong-ton-tai@tests.vn').expect(202);

    expect(known.text).toBe(unknown.text);
    expect(known.headers['content-type']).toBe(unknown.headers['content-type']);
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].to).toBe(account.email);
    expect(emails.sent[0].text).toContain(
      'https://app.test/dat-lai-mat-khau?token=',
    );
  });

  it('đặt lại thành công: mật khẩu mới có hiệu lực, mật khẩu cũ và phiên cũ bị thu hồi', async () => {
    const account = await registerAccount();
    const token = await requestToken(account.email);

    await reset(token).expect(204);

    await login(account.email, PASSWORD).expect(401);
    await login(account.email, NEW_PASSWORD).expect(200);
    await http()
      .post('/api/auth/refresh')
      .send({ refreshToken: account.refreshToken })
      .expect(401);
    expect(emails.to(account.email).map((message) => message.subject)).toEqual([
      'Đặt lại mật khẩu JobBoard',
      'Mật khẩu JobBoard của bạn đã được đặt lại',
    ]);
  });

  it('token chỉ dùng một lần; token sai và token đã dùng cùng trả một lỗi 400', async () => {
    const account = await registerAccount();
    const token = await requestToken(account.email);
    await reset(token).expect(204);

    const used = await reset(token).expect(400);
    const wrong = await reset('khong-phai-token-that').expect(400);

    expect(used.headers['content-type']).toContain('application/problem+json');
    expect(used.body).toMatchObject({
      status: 400,
      title: 'Liên kết đặt lại mật khẩu không hợp lệ',
    });
    expect(wrong.body.detail).toBe(used.body.detail);
    await login(account.email, NEW_PASSWORD).expect(200);
  });

  it('mật khẩu yếu bị từ chối nhưng liên kết vẫn dùng được', async () => {
    const account = await registerAccount();
    const token = await requestToken(account.email);

    const weak = await reset(token, 'yeu').expect(400);
    expect(weak.body.title).toBe('Dữ liệu không hợp lệ');
    await login(account.email, PASSWORD).expect(200);

    await reset(token).expect(204);
    await login(account.email, NEW_PASSWORD).expect(200);
  });

  it('yêu cầu mới vô hiệu hóa liên kết cũ', async () => {
    const account = await registerAccount();
    const first = await requestToken(account.email);
    const second = await requestToken(account.email);

    await reset(first).expect(400);
    await reset(second).expect(204);
  });

  it('mỗi tài khoản nhận tối đa 3 email mỗi giờ nhưng phản hồi không đổi', async () => {
    const account = await registerAccount();

    for (let i = 0; i < 5; i++) await forgot(account.email).expect(202);

    expect(emails.to(account.email)).toHaveLength(3);
  });

  it('tài khoản bị khóa không nhận email và liên kết đã cấp không dùng được cho đến khi mở khóa', async () => {
    const account = await registerAccount();
    const token = await requestToken(account.email);
    const bearer = { Authorization: `Bearer ${admin}` };
    await http()
      .post(`/api/admin/users/${account.userId}/disable`)
      .set(bearer)
      .expect(200);

    emails.clear();
    await forgot(account.email).expect(202);
    expect(emails.sent).toHaveLength(0);
    await reset(token).expect(400);

    await http()
      .post(`/api/admin/users/${account.userId}/enable`)
      .set(bearer)
      .expect(200);
    await reset(token).expect(204);
  });

  it('dùng song song một liên kết: đúng một request thành công', async () => {
    const account = await registerAccount();
    const token = await requestToken(account.email);

    const statuses = (
      await Promise.all(Array.from({ length: 5 }, () => reset(token)))
    )
      .map((response) => response.status)
      .sort();

    expect(statuses).toEqual([204, 400, 400, 400, 400]);
    await login(account.email, NEW_PASSWORD).expect(200);
  });

  if (provider === 'PostgreSql')
    it('chỉ lưu hash của token và khởi động lại ứng dụng vẫn dùng được liên kết', async () => {
      const account = await registerAccount();
      const token = await requestToken(account.email);
      const client = new Client({ connectionString: database!.url });
      await client.connect();
      try {
        const { rows } = await client.query<{ token_hash: string }>(
          'SELECT token_hash FROM password_reset_tokens WHERE user_id = $1',
          [account.userId],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(rows[0].token_hash).not.toContain(token);
      } finally {
        await client.end();
      }

      await app.close();
      app = await startApp(config, emails);

      await reset(token).expect(204);
      await login(account.email, NEW_PASSWORD).expect(200);
    });
});

describe.each(providers)('Kho token đặt lại mật khẩu — %s', (provider) => {
  const MINUTE = 60_000;
  const DAY = 24 * 60 * MINUTE;
  const T0 = new Date('2026-06-01T08:00:00Z');
  const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

  let app: INestApplication;
  let database: TestDatabase | undefined;
  let resets: PasswordResetRepository;
  let accounts: UserAccountRepository;
  let security: AccountSecurityRepository;
  let counter = 0;

  async function newUserId() {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register/candidate')
      .send({
        name: 'Người Dùng Kho',
        email: `kho-token-${++counter}@tests.vn`,
        password: PASSWORD,
      })
      .expect(201);
    return response.body.user.id as number;
  }

  /** Token tạo lúc `createdAt`, sống `minutes` phút. */
  function tokenFor(userId: number, createdAt: Date, minutes = 30) {
    return {
      id: randomUUID(),
      userId,
      tokenHash: createHash('sha256')
        .update(`token-${++counter}`)
        .digest('hex'),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + minutes * MINUTE),
    };
  }

  const passwordHashOf = async (userId: number) =>
    (await accounts.findById(userId))!.passwordHash;

  beforeAll(async () => {
    if (provider === 'PostgreSql') {
      database = await createTestDatabase(process.env.E2E_POSTGRES_URL!);
    }
    app = await startApp(
      configFor(provider, database),
      new InMemoryEmailSender(),
    );
    resets = app.get(PasswordResetRepository);
    accounts = app.get(UserAccountRepository);
    security = app.get(AccountSecurityRepository);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.drop();
  });

  it('dùng token trước hạn đổi hash mật khẩu và chỉ dùng được một lần', async () => {
    const userId = await newUserId();
    const token = tokenFor(userId, T0);
    await resets.issue(token);

    expect(await resets.redeem(token.tokenHash, 'hash-moi-1', at(MINUTE))).toBe(
      userId,
    );
    expect(await passwordHashOf(userId)).toBe('hash-moi-1');

    expect(
      await resets.redeem(token.tokenHash, 'hash-moi-2', at(2 * MINUTE)),
    ).toBeNull();
    expect(await passwordHashOf(userId)).toBe('hash-moi-1');
  });

  it('token hết hạn đúng tại expiresAt, còn dùng được ngay trước đó, và token lạ trả null', async () => {
    const userId = await newUserId();
    const original = await passwordHashOf(userId);
    const token = tokenFor(userId, T0);
    await resets.issue(token);

    expect(
      await resets.redeem(token.tokenHash, 'x', token.expiresAt),
    ).toBeNull();
    expect(await resets.redeem('0'.repeat(64), 'x', at(MINUTE))).toBeNull();
    expect(await passwordHashOf(userId)).toBe(original);

    const justBefore = new Date(token.expiresAt.getTime() - 1);
    expect(
      await resets.redeem(token.tokenHash, 'hash-sat-han', justBefore),
    ).toBe(userId);
  });

  it('cấp token mới vô hiệu hóa token cũ của cùng tài khoản nhưng không đụng tài khoản khác', async () => {
    const [userId, otherId] = [await newUserId(), await newUserId()];
    const first = tokenFor(userId, T0);
    const other = tokenFor(otherId, T0);
    const second = tokenFor(userId, at(MINUTE));
    await resets.issue(first);
    await resets.issue(other);
    await resets.issue(second);

    expect(
      await resets.redeem(first.tokenHash, 'x', at(2 * MINUTE)),
    ).toBeNull();
    expect(
      await resets.redeem(second.tokenHash, 'hash-2', at(2 * MINUTE)),
    ).toBe(userId);
    expect(
      await resets.redeem(other.tokenHash, 'hash-khac', at(2 * MINUTE)),
    ).toBe(otherId);
  });

  it('tài khoản bị khóa: không dùng được và token không bị tiêu hao, mở khóa rồi dùng được', async () => {
    const userId = await newUserId();
    const original = await passwordHashOf(userId);
    const token = tokenFor(userId, T0);
    await resets.issue(token);
    await security.setDisabled(userId, true);

    expect(await resets.redeem(token.tokenHash, 'x', at(MINUTE))).toBeNull();
    expect(await passwordHashOf(userId)).toBe(original);

    await security.setDisabled(userId, false);
    expect(
      await resets.redeem(token.tokenHash, 'hash-mo-khoa', at(MINUTE)),
    ).toBe(userId);
  });

  it('đếm cả token đã dùng và hết hạn, tính từ đúng mốc since', async () => {
    const userId = await newUserId();
    const [a, b, c] = [
      tokenFor(userId, T0),
      tokenFor(userId, at(10 * MINUTE)),
      tokenFor(userId, at(20 * MINUTE)),
    ];
    for (const token of [a, b, c]) await resets.issue(token);
    await resets.redeem(c.tokenHash, 'x', at(21 * MINUTE));

    expect(await resets.countIssuedSince(userId, T0)).toBe(3);
    expect(await resets.countIssuedSince(userId, at(10 * MINUTE))).toBe(2);
    expect(await resets.countIssuedSince(userId, at(10 * MINUTE + 1))).toBe(1);
    expect(await resets.countIssuedSince(userId, at(21 * MINUTE))).toBe(0);
    expect(await resets.countIssuedSince(await newUserId(), T0)).toBe(0);
  });

  it('dọn token hết hạn quá một ngày khi cấp token mới', async () => {
    const userId = await newUserId();
    const old = tokenFor(userId, T0);
    await resets.issue(old);

    // Đúng ranh giới (hết hạn + 1 ngày): vẫn giữ.
    await resets.issue(
      tokenFor(userId, new Date(old.expiresAt.getTime() + DAY)),
    );
    expect(await resets.countIssuedSince(userId, T0)).toBe(2);

    // Quá ranh giới: token cũ bị dọn.
    await resets.issue(
      tokenFor(userId, new Date(old.expiresAt.getTime() + DAY + MINUTE)),
    );
    expect(await resets.countIssuedSince(userId, T0)).toBe(2);
  });

  it('dùng song song một token: đúng một lần thành công', async () => {
    const userId = await newUserId();
    const token = tokenFor(userId, T0);
    await resets.issue(token);

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        resets.redeem(token.tokenHash, `hash-song-song-${i}`, at(MINUTE)),
      ),
    );

    expect(results.filter((result) => result === userId)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(7);
    expect(await passwordHashOf(userId)).toMatch(/^hash-song-song-\d$/);
  });
});
