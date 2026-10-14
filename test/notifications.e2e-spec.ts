import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { AppConfig } from '../src/config/app-config';
import { NotificationRepository } from '../src/application/abstractions/notifications';
import { createTestDatabase } from './support/postgres-test-database';

const providers = [
  'InMemory',
  ...(process.env.E2E_POSTGRES_URL ? ['PostgreSql'] : []),
];

describe.each(providers)('Thông báo — %s', (provider) => {
  let app: INestApplication;
  let database: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  let employer: string;
  let candidate: string;
  let stranger: string;
  let admin: string;
  let candidateId: number;
  let strangerId: number;
  let jobId: number;
  let applicationId: number;
  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token: string, query = '') =>
    http().get(`/api/notifications${query}`).set(bearer(token)).expect(200);
  const count = async (token: string) =>
    (
      await http()
        .get('/api/notifications/unread-count')
        .set(bearer(token))
        .expect(200)
    ).body.count as number;

  beforeAll(async () => {
    if (provider === 'PostgreSql')
      database = await createTestDatabase(process.env.E2E_POSTGRES_URL!);
    const config = AppConfig.fromEnv({
      NODE_ENV: 'test',
      JWT_SIGNING_KEY: 'test-signing-key-test-signing-key-123456',
      PERSISTENCE_PROVIDER: provider,
      ...(database
        ? { DATABASE_URL: database.url, PERSISTENCE_APPLY_MIGRATIONS: 'true' }
        : {}),
    });
    const module = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, config);
    await app.init();
    for (const role of ['employer', 'admin']) {
      const response = await http()
        .post('/api/auth/login')
        .send({ email: `${role}@jobboard.vn`, password: 'JobBoard@123' })
        .expect(200);
      if (role === 'employer') employer = response.body.accessToken;
      else admin = response.body.accessToken;
    }
    for (const name of ['candidate', 'stranger']) {
      const response = await http()
        .post('/api/auth/register/candidate')
        .send({
          name,
          email: `${name}@notifications.test`,
          password: 'JobBoard@123',
        })
        .expect(201);
      if (name === 'candidate') {
        candidate = response.body.accessToken;
        candidateId = response.body.user.id;
      } else {
        stranger = response.body.accessToken;
        strangerId = response.body.user.id;
      }
    }
    await http()
      .put(`/api/candidates/${candidateId}/profile`)
      .set(bearer(candidate))
      .send({
        email: 'candidate@notifications.test',
        bio: 'Kiểm thử thông báo',
        skills: ['NotificationSkill'],
        desiredSalaryMin: 1000,
        desiredSalaryMax: 2000,
      })
      .expect(200);
    const draft = await http()
      .post('/api/employers/1/jobs')
      .set(bearer(employer))
      .send({
        title: 'Vị trí kiểm thử thông báo',
        location: 'Hà Nội',
        salaryMin: 1000,
        salaryMax: 2000,
        level: 'Middle',
        workMode: 'Remote',
        category: 'Công nghệ',
        summary: 'Kiểm thử',
        description: [],
        requirements: [],
        benefits: [],
        skills: ['NotificationSkill'],
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(201);
    jobId = draft.body.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.drop();
  });

  it('yêu cầu đăng nhập và từ chối bộ lọc/phân trang sai', async () => {
    await http().get('/api/notifications').expect(401);
    await http().get('/api/notifications/unread-count').expect(401);
    await http().patch('/api/notifications/read-all').expect(401);
    await http().patch('/api/notifications/1/read').expect(401);
    for (const query of [
      'page=0',
      'page=1.5',
      'pageSize=101',
      'unreadOnly=maybe',
    ]) {
      await http()
        .get(`/api/notifications?${query}`)
        .set(bearer(candidate))
        .expect(400);
    }
  });

  it('chỉ phát gợi ý khi đăng tin và gửi cho ứng viên phù hợp', async () => {
    expect(await count(candidate)).toBe(0);
    await http()
      .post(`/api/employers/1/jobs/${jobId}/publish`)
      .set(bearer(employer))
      .expect(200);
    const result = await list(candidate);
    expect(result.body.totalItems).toBe(1);
    expect(result.body.items[0]).toMatchObject({
      type: 'JobMatch',
      read: false,
      link: `/viec-lam/${jobId}`,
    });
    expect(result.body.items[0].body).toContain('100%');
    expect(await count(stranger)).toBe(0);
    expect(await count(admin)).toBe(0);
    await http()
      .post(`/api/employers/1/jobs/${jobId}/publish`)
      .set(bearer(employer));
    expect(await count(candidate)).toBe(1);
  });

  it('ứng tuyển báo đúng nhà tuyển dụng; ứng tuyển trùng không phát thêm', async () => {
    const response = await http()
      .post('/api/applications')
      .set(bearer(candidate))
      .send({ jobId })
      .expect(201);
    applicationId = response.body.id;
    const result = await list(employer);
    expect(result.body.items[0]).toMatchObject({
      type: 'ApplicationReceived',
      link: `/nha-tuyen-dung?tab=candidates&application=${applicationId}`,
    });
    expect(result.body.items[0].body).toContain('candidate');
    const before = await count(employer);
    await http()
      .post('/api/applications')
      .set(bearer(candidate))
      .send({ jobId })
      .expect(409);
    expect(await count(employer)).toBe(before);
  });

  it('đổi trạng thái báo ứng viên; giữ nguyên trạng thái không tạo thông báo trùng', async () => {
    const path = `/api/applications/${applicationId}/status`;
    await http()
      .patch(path)
      .set(bearer(employer))
      .send({ status: 'Reviewing' })
      .expect(200);
    const result = await list(candidate);
    expect(result.body.items[0]).toMatchObject({
      type: 'ApplicationStatusChanged',
      link: '/ung-vien/don-ung-tuyen',
    });
    expect(result.body.items[0].body).toContain('đang được xem xét');
    const before = await count(candidate);
    await http()
      .patch(path)
      .set(bearer(employer))
      .send({ status: 'Reviewing' })
      .expect(200);
    expect(await count(candidate)).toBe(before);
    expect(await count(stranger)).toBe(0);
  });

  it('các thao tác kiểm duyệt gửi thông báo kèm lý do cho công ty', async () => {
    await http()
      .post(`/api/admin/jobs/${jobId}/takedown`)
      .set(bearer(admin))
      .send({ reason: 'Nội dung cần sửa' })
      .expect(200);
    expect((await list(employer)).body.items[0].body).toContain(
      'Nội dung cần sửa',
    );
    await http()
      .post(`/api/admin/jobs/${jobId}/reinstate`)
      .set(bearer(admin))
      .expect(200);
    await http()
      .post('/api/admin/companies/1/suspend')
      .set(bearer(admin))
      .send({ reason: 'Cần xác minh công ty' })
      .expect(200);
    expect((await list(employer)).body.items[0].body).toContain(
      'Cần xác minh công ty',
    );
    await http()
      .post('/api/admin/companies/1/reactivate')
      .set(bearer(admin))
      .expect(200);
    expect(
      (await list(employer)).body.items.map((n: { type: string }) => n.type),
    ).toEqual([
      'CompanyReactivated',
      'CompanySuspended',
      'JobReinstated',
      'JobTakenDown',
      'ApplicationReceived',
    ]);
    expect(await count(stranger)).toBe(0);
  });

  it('không đọc/đánh dấu thông báo của người khác; đánh dấu lặp giữ nguyên kết quả', async () => {
    const id = (await list(candidate)).body.items[0].id as number;
    await http()
      .patch(`/api/notifications/${id}/read`)
      .set(bearer(stranger))
      .expect(404);
    expect((await list(stranger)).body.totalItems).toBe(0);
    const before = await count(candidate);
    for (let i = 0; i < 2; i++)
      await http()
        .patch(`/api/notifications/${id}/read`)
        .set(bearer(candidate))
        .expect(204);
    expect(await count(candidate)).toBe(before - 1);
    expect(
      (await list(candidate, '?unreadOnly=true')).body.items.every(
        (n: { read: boolean }) => !n.read,
      ),
    ).toBe(true);
    expect((await list(candidate, '?unreadOnly=false')).body.totalItems).toBe(
      before,
    );
    await http()
      .patch('/api/notifications/999999/read')
      .set(bearer(candidate))
      .expect(404);
  });

  it('phân trang ổn định khi trùng thời điểm; đọc tất cả chỉ tác động chính mình', async () => {
    await app.get(NotificationRepository).addMany(
      Array.from({ length: 25 }, (_, i) => ({
        userId: strangerId,
        type: 'JobMatch' as const,
        title: `Tin ${i}`,
        body: 'Nội dung',
        link: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
    );
    const first = (await list(stranger, '?pageSize=20')).body;
    const second = (await list(stranger, '?page=2&pageSize=20')).body;
    expect(first).toMatchObject({ totalItems: 25, totalPages: 2 });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(5);
    expect(first.items[0].title).toBe('Tin 24');
    const ids = [...first.items, ...second.items].map(
      (n: { id: number }) => n.id,
    );
    expect(new Set(ids).size).toBe(25);
    const employerBefore = await count(employer);
    await http()
      .patch('/api/notifications/read-all')
      .set(bearer(stranger))
      .expect(204);
    await http()
      .patch('/api/notifications/read-all')
      .set(bearer(stranger))
      .expect(204);
    expect(await count(stranger)).toBe(0);
    expect((await list(stranger, '?unreadOnly=true')).body.totalItems).toBe(0);
    expect(await count(employer)).toBe(employerBefore);
  });
});
