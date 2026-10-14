import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { ReadinessProbe } from '../src/application/abstractions/health';
import { AppConfig } from '../src/config/app-config';
import { setupOpenApi } from '../src/openapi';
import { createTestDatabase } from './support/postgres-test-database';

const providers = [
  'InMemory',
  ...(process.env.E2E_POSTGRES_URL ? ['PostgreSql'] : []),
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

async function startApp(
  provider: string,
  database?: TestDatabase,
  probe?: ReadinessProbe,
) {
  const config = AppConfig.fromEnv({
    NODE_ENV: 'test',
    JWT_SIGNING_KEY: 'test-signing-key-test-signing-key-123456',
    PERSISTENCE_PROVIDER: provider,
    ...(database
      ? { DATABASE_URL: database.url, PERSISTENCE_APPLY_MIGRATIONS: 'true' }
      : {}),
  });
  let builder = Test.createTestingModule({
    imports: [AppModule.register(config)],
  });
  if (probe) builder = builder.overrideProvider(ReadinessProbe).useValue(probe);
  const app = (await builder.compile()).createNestApplication();
  configureApp(app, config);
  setupOpenApi(app);
  await app.init();
  return app;
}

describe.each(providers)('Bảo mật HTTP — %s', (provider) => {
  let app: INestApplication;
  let database: TestDatabase | undefined;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    if (provider === 'PostgreSql') {
      database = await createTestDatabase(process.env.E2E_POSTGRES_URL!);
    }
    app = await startApp(provider, database);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.drop();
  });

  it('gắn header bảo mật cho mọi phản hồi (cả lỗi) và không lộ X-Powered-By', async () => {
    for (const response of [
      await http().get('/api/health').expect(200),
      await http().get('/api/khong-co-route').expect(404),
    ]) {
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['strict-transport-security']).toContain(
        'max-age=',
      );
      expect(response.headers).not.toHaveProperty('x-powered-by');
    }
  });

  it('mã request: tạo mới khi thiếu, giữ khi hợp lệ, thay khi có dạng lạ', async () => {
    const generated = await http().get('/api/health').expect(200);
    expect(generated.headers['x-request-id']).toMatch(UUID);

    const echoed = await http()
      .get('/api/health')
      .set('X-Request-Id', 'abc12345-trace_01.x')
      .expect(200);
    expect(echoed.headers['x-request-id']).toBe('abc12345-trace_01.x');

    for (const bad of [
      'ngan',
      'co khoang trang',
      'x'.repeat(65),
      '<script>1</script>',
    ]) {
      const replaced = await http()
        .get('/api/health')
        .set('X-Request-Id', bad)
        .expect(200);
      expect(replaced.headers['x-request-id']).toMatch(UUID);
    }
  });

  it('nội dung lỗi mang mã request trùng với header', async () => {
    const notFound = await http()
      .get('/api/khong-co-route')
      .set('X-Request-Id', 'truy-vet-404-001')
      .expect(404);
    expect(notFound.body.requestId).toBe('truy-vet-404-001');

    const rejected = await http()
      .post('/api/auth/login')
      .send({ email: 'khong.co@example.com', password: 'sai' })
      .expect(401);
    expect(rejected.body.requestId).toBe(rejected.headers['x-request-id']);
    expect(rejected.body.requestId).toMatch(UUID);
  });

  it('phản hồi xác thực chứa token không được cache; endpoint công khai thì không bị ép', async () => {
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'candidate@jobboard.vn', password: 'JobBoard@123' })
      .expect(200);
    expect(login.headers['cache-control']).toBe('no-store');

    const me = await http().get('/api/auth/me').expect(401);
    expect(me.headers['cache-control']).toBe('no-store');

    const jobs = await http().get('/api/jobs').expect(200);
    expect(jobs.headers['cache-control']).not.toBe('no-store');
  });

  it('liveness không chạm cơ sở dữ liệu, readiness xác nhận phụ thuộc đã sẵn sàng', async () => {
    await http().get('/api/health').expect(200, { status: 'healthy' });
    await http().get('/api/health/ready').expect(200, { status: 'ready' });

    const docs = (await http().get('/api/openapi.json').expect(200)).body;
    expect(docs.paths['/api/health/ready'].get.responses['503']).toBeDefined();
  });

  it('Swagger UI vẫn tải được dưới CSP và CORS preflight vẫn hoạt động', async () => {
    const ui = await http().get('/api/docs').expect(200);
    expect(ui.headers['content-type']).toContain('text/html');
    expect(ui.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );

    const preflight = await http()
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
  });
});

describe('Readiness khi phụ thuộc lỗi', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const failing: ReadinessProbe = {
      check: () =>
        Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    };
    app = await startApp('InMemory', undefined, failing);
  }, 60_000);

  afterAll(() => app?.close());

  it('trả 503 ProblemDetails không lộ chi tiết nội bộ, còn liveness vẫn 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503);

    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.body).toMatchObject({
      status: 503,
      title: 'Dịch vụ chưa sẵn sàng',
      instance: '/api/health/ready',
    });
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
