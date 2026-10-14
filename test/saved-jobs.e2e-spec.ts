import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { AppConfig } from '../src/config/app-config';
import { createTestDatabase } from './support/postgres-test-database';
import { setupOpenApi } from '../src/openapi';

const providers = [
  'InMemory',
  ...(process.env.E2E_POSTGRES_URL ? ['PostgreSql'] : []),
];

describe.each(providers)('Việc làm đã lưu — %s', (provider) => {
  let app: INestApplication;
  let database: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  let config: AppConfig;
  let candidate: string;
  let stranger: string;
  let employer: string;
  let admin: string;
  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token: string, query = '') =>
    http().get(`/api/saved-jobs${query}`).set(bearer(token)).expect(200);
  const save = (token: string, id: number) =>
    http().put(`/api/saved-jobs/${id}`).set(bearer(token));
  const remove = (token: string, id: number) =>
    http().delete(`/api/saved-jobs/${id}`).set(bearer(token));

  async function startApp() {
    const module = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, config);
    setupOpenApi(app);
    await app.init();
  }

  async function createJob(publish = true) {
    const draft = await http()
      .post('/api/employers/1/jobs')
      .set(bearer(employer))
      .send({
        title: 'Việc làm kiểm thử lưu tin',
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
        skills: [],
        deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .expect(201);
    const id = draft.body.id as number;
    if (publish)
      await http()
        .post(`/api/employers/1/jobs/${id}/publish`)
        .set(bearer(employer))
        .expect(200);
    return id;
  }

  beforeAll(async () => {
    if (provider === 'PostgreSql')
      database = await createTestDatabase(process.env.E2E_POSTGRES_URL!);
    config = AppConfig.fromEnv({
      NODE_ENV: 'test',
      JWT_SIGNING_KEY: 'test-signing-key-test-signing-key-123456',
      PERSISTENCE_PROVIDER: provider,
      ...(database
        ? { DATABASE_URL: database.url, PERSISTENCE_APPLY_MIGRATIONS: 'true' }
        : {}),
    });
    await startApp();
    for (const role of ['candidate', 'employer', 'admin']) {
      const response = await http()
        .post('/api/auth/login')
        .send({ email: `${role}@jobboard.vn`, password: 'JobBoard@123' })
        .expect(200);
      if (role === 'candidate') candidate = response.body.accessToken;
      else if (role === 'employer') employer = response.body.accessToken;
      else admin = response.body.accessToken;
    }
    stranger = (
      await http()
        .post('/api/auth/register/candidate')
        .send({
          name: 'Ứng viên khác',
          email: 'saved@tests.vn',
          password: 'JobBoard@123',
        })
        .expect(201)
    ).body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.drop();
  });

  it('chỉ ứng viên đăng nhập mới được dùng; tài liệu OpenAPI đủ route và schema', async () => {
    await http().get('/api/saved-jobs').expect(401);
    await http().put('/api/saved-jobs/1').expect(401);
    for (const token of [employer, admin]) {
      await listForbidden(token);
      await save(token, 1).expect(403);
      await remove(token, 1).expect(403);
      await http()
        .get('/api/saved-jobs/ids?jobIds=1')
        .set(bearer(token))
        .expect(403);
    }
    const docs = (await http().get('/api/openapi.json').expect(200)).body;
    expect(docs.paths['/api/saved-jobs/{jobId}'].put).toBeDefined();
    expect(docs.paths['/api/saved-jobs/ids'].get).toBeDefined();
    expect(
      docs.components.schemas.SavedJobResponseDto.properties.job.nullable,
    ).toBe(true);
  });

  function listForbidden(token: string) {
    return http().get('/api/saved-jobs').set(bearer(token)).expect(403);
  }

  it('lưu đồng thời chỉ một bản ghi, giữ thời điểm lưu và chưa tạo đơn ứng tuyển', async () => {
    const id = await createJob();
    const before = (
      await http()
        .get('/api/candidates/20/applications')
        .set(bearer(candidate))
        .expect(200)
    ).body.length;
    await Promise.all(
      Array.from({ length: 5 }, () => save(candidate, id).expect(204)),
    );
    const first = (await list(candidate)).body;
    expect(
      first.items.filter((item: { jobId: number }) => item.jobId === id),
    ).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      jobId: id,
      availability: 'Open',
      job: { id },
    });
    const savedAt = first.items[0].savedAt;
    await save(candidate, id).expect(204);
    expect((await list(candidate)).body.items[0].savedAt).toBe(savedAt);
    expect(
      (
        await http()
          .get('/api/candidates/20/applications')
          .set(bearer(candidate))
          .expect(200)
      ).body,
    ).toHaveLength(before);
  });

  it('dữ liệu và thao tác bỏ lưu tách biệt giữa hai ứng viên', async () => {
    const id = await createJob();
    await save(candidate, id).expect(204);
    expect((await list(stranger)).body.totalItems).toBe(0);
    await http()
      .get(`/api/saved-jobs/ids?jobIds=${id}`)
      .set(bearer(stranger))
      .expect(200, []);
    await remove(stranger, id).expect(204);
    await http()
      .get(`/api/saved-jobs/ids?jobIds=${id},${id}`)
      .set(bearer(candidate))
      .expect(200, [id]);
    await save(stranger, id).expect(204);
    await remove(candidate, id).expect(204);
    await remove(candidate, id).expect(204);
    await http()
      .get(`/api/saved-jobs/ids?jobIds=${id}`)
      .set(bearer(stranger))
      .expect(200, [id]);
    await remove(stranger, id).expect(204);
  });

  it('phân trang đúng và từ chối dữ liệu không hợp lệ', async () => {
    for (let i = 0; i < 3; i++)
      await save(stranger, await createJob()).expect(204);
    const first = (await list(stranger, '?pageSize=2')).body;
    const second = (await list(stranger, '?page=2&pageSize=2')).body;
    expect(first).toMatchObject({ totalItems: 3, totalPages: 2 });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(
      new Set(
        [...first.items, ...second.items].map(
          (item: { jobId: number }) => item.jobId,
        ),
      ).size,
    ).toBe(3);
    for (const query of [
      'page=0',
      'page=1.5',
      'pageSize=101',
      'page=9007199254740992',
    ])
      await http()
        .get(`/api/saved-jobs?${query}`)
        .set(bearer(candidate))
        .expect(400);
    for (const query of [
      '',
      'jobIds=abc',
      'jobIds=0',
      'jobIds=2147483648',
      `jobIds=${Array.from({ length: 101 }, () => 1).join(',')}`,
    ])
      await http()
        .get(`/api/saved-jobs/ids?${query}`)
        .set(bearer(candidate))
        .expect(400);
    for (const id of ['abc', '0', '-1', '2147483648']) {
      await http()
        .put(`/api/saved-jobs/${id}`)
        .set(bearer(candidate))
        .expect(400);
      await http()
        .delete(`/api/saved-jobs/${id}`)
        .set(bearer(candidate))
        .expect(400);
    }
  });

  it('không lưu mới bản nháp/tin thiếu/tin đã đóng; tin đóng đã lưu vẫn xem và bỏ lưu được', async () => {
    await save(candidate, 999999).expect(404);
    await save(candidate, await createJob(false)).expect(404);
    const id = await createJob();
    await save(candidate, id).expect(204);
    await http()
      .post(`/api/employers/1/jobs/${id}/close`)
      .set(bearer(employer))
      .expect(200);
    // Cùng quy tắc với ứng tuyển: tin đã đóng là lỗi nghiệp vụ (400), không phải xung đột.
    await save(stranger, id).expect(400);
    expect(
      (await list(candidate)).body.items.find(
        (item: { jobId: number }) => item.jobId === id,
      ),
    ).toMatchObject({ availability: 'Closed', job: { id } });
    await save(candidate, id).expect(204);
    await remove(candidate, id).expect(204);
  });

  it('tin bị gỡ/công ty khóa không lộ tiêu đề, công ty hoặc kỹ năng qua mục đã lưu', async () => {
    const id = await createJob();
    await save(candidate, id).expect(204);
    await http()
      .post(`/api/admin/jobs/${id}/takedown`)
      .set(bearer(admin))
      .send({ reason: 'Nội dung cần sửa' })
      .expect(200);
    const item = (await list(candidate)).body.items.find(
      (item: { jobId: number }) => item.jobId === id,
    );
    expect(item).toEqual({
      jobId: id,
      savedAt: expect.any(String),
      availability: 'Unavailable',
      job: null,
    });
    await save(stranger, id).expect(404);
    await remove(candidate, id).expect(204);
    const other = await createJob();
    await save(candidate, other).expect(204);
    await http()
      .post('/api/admin/companies/1/suspend')
      .set(bearer(admin))
      .send({ reason: 'Cần xác minh' })
      .expect(200);
    expect(
      (await list(candidate)).body.items.every(
        (item: { job: unknown }) => item.job === null,
      ),
    ).toBe(true);
    await save(stranger, other).expect(404);
    await http()
      .post('/api/admin/companies/1/reactivate')
      .set(bearer(admin))
      .expect(200);
    expect(
      (await list(candidate)).body.items.find(
        (item: { jobId: number }) => item.jobId === other,
      ).availability,
    ).toBe('Open');
  });

  if (provider === 'PostgreSql')
    it('khởi động lại ứng dụng vẫn giữ danh sách và thời điểm đã lưu', async () => {
      const before = (await list(candidate)).body;
      await app.close();
      await startApp();
      expect((await list(candidate)).body).toEqual(before);
    });
});
