import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { EmailSender } from '../src/application/abstractions/email';
import { AppConfig } from '../src/config/app-config';
import { setupOpenApi } from '../src/openapi';
import { InMemoryEmailSender } from '../src/testing/in-memory-email-sender';

const PASSWORD = 'JobBoard@123';

async function startApp(env: Record<string, string>) {
  const config = AppConfig.fromEnv({
    NODE_ENV: 'test',
    JWT_SIGNING_KEY: 'test-signing-key-test-signing-key-123456',
    ...env,
  });
  const module = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  })
    .overrideProvider(EmailSender)
    .useValue(new InMemoryEmailSender())
    .compile();
  const app = module.createNestApplication();
  configureApp(app, config);
  setupOpenApi(app);
  await app.init();
  return app;
}

describe('Giới hạn tần suất (tin cậy proxy loopback)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const from = (ip: string) => ({ 'X-Forwarded-For': ip });

  const forgot = (ip: string, email = 'khong.co@example.com') =>
    http().post('/api/auth/forgot-password').set(from(ip)).send({ email });
  const login = (ip: string, email: string, password: string) =>
    http().post('/api/auth/login').set(from(ip)).send({ email, password });

  beforeAll(async () => {
    app = await startApp({
      RATE_LIMIT_ENABLED: 'true',
      TRUST_PROXY: 'loopback',
    });
  }, 60_000);

  afterAll(() => app?.close());

  it('trả 429 ProblemDetails kèm Retry-After sau 10 lượt quên mật khẩu mỗi giờ cho một IP', async () => {
    const first = await forgot('198.51.100.1').expect(202);
    expect(first.headers['ratelimit-limit']).toBe('10');
    expect(first.headers['ratelimit-remaining']).toBe('9');
    expect(Number(first.headers['ratelimit-reset'])).toBeGreaterThan(3500);

    for (let i = 1; i < 10; i++) await forgot('198.51.100.1').expect(202);

    const blocked = await forgot('198.51.100.1').expect(429);
    expect(blocked.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(blocked.headers['ratelimit-remaining']).toBe('0');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(3500);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(3600);
    expect(blocked.body).toMatchObject({
      status: 429,
      title: 'Quá nhiều yêu cầu',
      instance: '/api/auth/forgot-password',
    });
    expect(blocked.body.detail).toMatch(
      /^Bạn gửi yêu cầu quá nhanh\. Vui lòng thử lại sau \d+ phút\.$/,
    );
    expect(blocked.body).not.toHaveProperty('retryAfterSeconds');
  });

  it('IP khác không bị ảnh hưởng, kể cả IPv6 khác dải', async () => {
    await forgot('198.51.100.2').expect(202);
    await forgot('2001:db8:aaaa:1::7').expect(202);
  });

  it('IPv6 trong cùng dải /64 dùng chung bộ đếm', async () => {
    for (let i = 0; i < 10; i++) {
      await forgot(`2001:db8:bbbb:1::${i + 1}`).expect(202);
    }

    await forgot('2001:db8:bbbb:1:ffff::1').expect(429);
    await forgot('2001:db8:bbbb:2::1').expect(202);
  });

  it('giới hạn đăng nhập theo IP: lượt thứ 31 trong 15 phút bị chặn', async () => {
    for (let i = 0; i < 30; i++) {
      await login('198.51.100.10', `nguoi${i}@example.com`, 'sai').expect(401);
    }

    const blocked = await login(
      '198.51.100.10',
      'nguoi.moi@example.com',
      'sai',
    ).expect(429);
    expect(blocked.body.title).toBe('Quá nhiều yêu cầu');
    await login('198.51.100.11', 'nguoi.moi@example.com', 'sai').expect(401);
  });

  it('đăng nhập sai 8 lần cùng email từ cùng IP bị khóa; IP khác của chính chủ vẫn vào được', async () => {
    const email = 'candidate@jobboard.vn';
    for (let i = 0; i < 8; i++) {
      await login('198.51.100.20', email, 'sai-mat-khau').expect(401);
    }

    // Lần thứ 9 bị chặn dù mật khẩu đã đúng.
    const blocked = await login('198.51.100.20', email, PASSWORD).expect(429);
    expect(blocked.body.detail).toBe(
      'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    );
    expect(blocked.headers['retry-after']).toBe('900');

    await login('198.51.100.21', email, PASSWORD).expect(200);
  });

  it('đăng nhập đúng xóa số lần sai đang tích lũy', async () => {
    const email = 'employer@jobboard.vn';
    for (let i = 0; i < 7; i++) {
      await login('198.51.100.30', email, 'sai-mat-khau').expect(401);
    }
    await login('198.51.100.30', email, PASSWORD).expect(200);

    for (let i = 0; i < 7; i++) {
      await login('198.51.100.30', email, 'sai-mat-khau').expect(401);
    }
    await login('198.51.100.30', email, PASSWORD).expect(200);
  });

  it('giới hạn đăng ký 10 lượt mỗi giờ, tính chung hai loại tài khoản; chặn trước cả bước kiểm tra dữ liệu', async () => {
    for (let i = 0; i < 5; i++) {
      await http()
        .post('/api/auth/register/candidate')
        .set(from('198.51.100.40'))
        .send({})
        .expect(400);
      await http()
        .post('/api/auth/register/employer')
        .set(from('198.51.100.40'))
        .send({})
        .expect(400);
    }

    await http()
      .post('/api/auth/register/candidate')
      .set(from('198.51.100.40'))
      .send({})
      .expect(429);
  });

  it('đặt lại mật khẩu có giới hạn riêng 20 lượt mỗi giờ', async () => {
    const reset = () =>
      http()
        .post('/api/auth/reset-password')
        .set(from('198.51.100.50'))
        .send({ token: 'khong-phai-token', newPassword: 'MatKhau#Moi2026' });
    for (let i = 0; i < 20; i++) await reset().expect(400);

    await reset().expect(429);
  });

  it('endpoint không gắn giới hạn không bị ảnh hưởng và OpenAPI mô tả mã 429', async () => {
    for (let i = 0; i < 40; i++) {
      await http().get('/api/health').set(from('198.51.100.60')).expect(200);
    }

    const docs = (await http().get('/api/openapi.json').expect(200)).body;
    for (const path of [
      '/api/auth/login',
      '/api/auth/register/candidate',
      '/api/auth/register/employer',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
    ]) {
      expect(docs.paths[path].post.responses['429']).toBeDefined();
    }
    expect(docs.paths['/api/auth/password'].put.responses['429']).toBeDefined();
  });
});

describe('Giới hạn tần suất (không tin proxy)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startApp({ RATE_LIMIT_ENABLED: 'true', TRUST_PROXY: 'false' });
  }, 60_000);

  afterAll(() => app?.close());

  it('bỏ qua X-Forwarded-For giả mạo: đổi header không thoát được giới hạn', async () => {
    const forgot = (spoofed: string) =>
      request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', spoofed)
        .send({ email: 'khong.co@example.com' });

    for (let i = 0; i < 10; i++) await forgot(`203.0.113.${i + 1}`).expect(202);

    await forgot('203.0.113.200').expect(429);
  });
});

describe('Giới hạn tần suất (tắt)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startApp({ RATE_LIMIT_ENABLED: 'false' });
  }, 60_000);

  afterAll(() => app?.close());

  it('không chặn gì và không đếm số lần đăng nhập sai', async () => {
    for (let i = 0; i < 25; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'khong.co@example.com' })
        .expect(202);
    }
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'candidate@jobboard.vn', password: 'sai-mat-khau' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'candidate@jobboard.vn', password: PASSWORD })
      .expect(200);
  });
});
