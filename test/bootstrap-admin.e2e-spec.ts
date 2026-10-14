import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { AppConfig } from '../src/config/app-config';
import { createTestDatabase } from './support/postgres-test-database';

const describeWithPostgres = process.env.E2E_POSTGRES_URL
  ? describe
  : describe.skip;

const ADMIN_EMAIL = 'chu.he.thong@example.com';
const ADMIN_PASSWORD = 'MatKhauAdmin#2026';

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

describeWithPostgres('Khởi tạo cơ sở dữ liệu cho môi trường thật', () => {
  let database: TestDatabase;
  let app: INestApplication | undefined;
  const http = () => request(app!.getHttpServer());

  async function start(env: Record<string, string> = {}) {
    const config = AppConfig.fromEnv({
      NODE_ENV: 'test',
      JWT_SIGNING_KEY: 'test-signing-key-test-signing-key-123456',
      PERSISTENCE_PROVIDER: 'PostgreSql',
      DATABASE_URL: database.url,
      PERSISTENCE_APPLY_MIGRATIONS: 'true',
      ...env,
    });
    const module = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, config);
    await app.init();
  }

  async function stop() {
    await app?.close();
    app = undefined;
  }

  async function adminCount() {
    const client = new Client({ connectionString: database.url });
    await client.connect();
    try {
      const { rows } = await client.query<{ count: string }>(
        "SELECT count(*) AS count FROM user_accounts WHERE role = 'Admin'",
      );
      return Number(rows[0].count);
    } finally {
      await client.end();
    }
  }

  const login = (email: string, password: string) =>
    http().post('/api/auth/login').send({ email, password });

  const bootstrap = {
    PERSISTENCE_SEED_DEMO_DATA: 'false',
    BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD,
    BOOTSTRAP_ADMIN_NAME: 'Chủ Hệ Thống',
  };

  beforeEach(async () => {
    database = await createTestDatabase(process.env.E2E_POSTGRES_URL!);
  });

  afterEach(async () => {
    await stop();
    await database.drop();
  });

  it('không nạp dữ liệu demo nhưng tạo quản trị viên đầu tiên từ biến môi trường', async () => {
    await start(bootstrap);

    await login('admin@jobboard.vn', 'JobBoard@123').expect(401);
    await login('candidate@jobboard.vn', 'JobBoard@123').expect(401);
    expect((await http().get('/api/jobs').expect(200)).body.totalItems).toBe(0);

    const admin = (await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200)).body;
    expect(admin.user).toMatchObject({
      name: 'Chủ Hệ Thống',
      email: ADMIN_EMAIL,
      role: 'Admin',
    });
    expect(admin.user.id).toBeGreaterThanOrEqual(101);
    await http()
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
  });

  it('khởi động lại không tạo thêm quản trị viên và không đặt lại mật khẩu đã đổi', async () => {
    await start(bootstrap);
    const token = (await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200)).body
      .accessToken;
    await http()
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: 'MatKhauMoi#2027' })
      .expect(204);

    await stop();
    await start(bootstrap);

    await login(ADMIN_EMAIL, 'MatKhauMoi#2027').expect(200);
    await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(401);
    expect(await adminCount()).toBe(1);
  });

  it('đã có quản trị viên (dữ liệu demo) thì không tạo thêm', async () => {
    await start({
      PERSISTENCE_SEED_DEMO_DATA: 'true',
      BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL,
      BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD,
    });

    await login('admin@jobboard.vn', 'JobBoard@123').expect(200);
    await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(401);
    expect(await adminCount()).toBe(1);
  });

  it('email đã thuộc tài khoản khác thì ứng dụng vẫn khởi động và không tạo quản trị viên', async () => {
    await start({ PERSISTENCE_SEED_DEMO_DATA: 'false' });
    await http()
      .post('/api/auth/register/candidate')
      .send({
        name: 'Ứng Viên Trùng',
        email: ADMIN_EMAIL,
        password: 'MatKhauUngVien#1',
      })
      .expect(201);

    await stop();
    await start(bootstrap);

    expect(await adminCount()).toBe(0);
    const response = await login(ADMIN_EMAIL, 'MatKhauUngVien#1').expect(200);
    expect(response.body.user.role).toBe('Candidate');
  });
});
