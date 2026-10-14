import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { AppConfig } from '../src/config/app-config';
import { setupOpenApi } from '../src/openapi';
import { createTestDatabase } from './support/postgres-test-database';

const providers = [
  'InMemory',
  ...(process.env.E2E_POSTGRES_URL ? ['PostgreSql'] : []),
];

const pdf = (text: string) => Buffer.from(`%PDF-1.7\n${text}\n%%EOF`);
const pdfFile = { filename: 'cv.pdf', contentType: 'application/pdf' };

describe.each(providers)('CV ứng viên — %s', (provider) => {
  let app: INestApplication;
  let database: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  let storageDir: string;
  let config: AppConfig;
  let candidate: string;
  let candidateId: number;
  let stranger: string;
  let strangerId: number;
  let employer: string;
  let otherEmployer: string;
  let otherCompanyId: number;
  let admin: string;
  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const upload = (token: string, id: number, content: Buffer, file = pdfFile) =>
    http()
      .post(`/api/candidates/${id}/cv`)
      .set(bearer(token))
      .attach('file', content, file);

  async function startApp() {
    const module = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, config);
    setupOpenApi(app);
    await app.init();
  }

  async function login(email: string) {
    return (
      await http()
        .post('/api/auth/login')
        .send({ email, password: 'JobBoard@123' })
        .expect(200)
    ).body.accessToken as string;
  }

  async function register(kind: 'candidate' | 'employer', suffix: string) {
    const body =
      kind === 'candidate'
        ? { name: `Ứng viên ${suffix}`, email: `${suffix}@cv.tests.vn` }
        : {
            name: `Chủ ${suffix}`,
            email: `${suffix}@cv.tests.vn`,
            companyName: `Công ty CV ${suffix}`,
          };
    const res = await http()
      .post(`/api/auth/register/${kind}`)
      .send({ ...body, password: 'JobBoard@123' })
      .expect(201);
    return {
      token: res.body.accessToken as string,
      id: res.body.user.id as number,
      companyId: res.body.user.companyId as number | null,
    };
  }

  async function publishJob() {
    const created = await http()
      .post('/api/employers/1/jobs')
      .set(bearer(employer))
      .send({
        title: 'Tin kiểm thử CV',
        location: 'Hà Nội',
        salaryMin: 1000,
        salaryMax: 2000,
        level: 'Middle',
        workMode: 'Remote',
        category: 'Công nghệ',
        summary: 'Kiểm thử',
        skills: [],
        deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(201);
    await http()
      .post(`/api/employers/1/jobs/${created.body.id}/publish`)
      .set(bearer(employer))
      .expect(200);
    return created.body.id as number;
  }

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'jobboard-cv-'));
    if (provider === 'PostgreSql') {
      database = await createTestDatabase(process.env.E2E_POSTGRES_URL!);
    }
    config = AppConfig.fromEnv({
      NODE_ENV: 'test',
      JWT_SIGNING_KEY: 'test-signing-key-test-signing-key-123456',
      PERSISTENCE_PROVIDER: provider,
      STORAGE_DIR: storageDir,
      ...(database
        ? { DATABASE_URL: database.url, PERSISTENCE_APPLY_MIGRATIONS: 'true' }
        : {}),
    });
    await startApp();
    employer = await login('employer@jobboard.vn');
    admin = await login('admin@jobboard.vn');
    ({ token: candidate, id: candidateId } = await register(
      'candidate',
      'ung-vien-cv',
    ));
    ({ token: stranger, id: strangerId } = await register(
      'candidate',
      'nguoi-la-cv',
    ));
    const otherCompany = await register('employer', 'cong-ty-khac-cv');
    otherEmployer = otherCompany.token;
    otherCompanyId = otherCompany.companyId!;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.drop();
    await rm(storageDir, { recursive: true, force: true });
  });

  it('chỉ ứng viên chủ sở hữu được dùng các endpoint CV của ứng viên', async () => {
    await http().get(`/api/candidates/${candidateId}/cv`).expect(401);
    await http().post(`/api/candidates/${candidateId}/cv`).expect(401);
    for (const token of [employer, admin]) {
      await http()
        .get(`/api/candidates/${candidateId}/cv`)
        .set(bearer(token))
        .expect(403);
      await upload(token, candidateId, pdf('x')).expect(403);
      await http()
        .delete(`/api/candidates/${candidateId}/cv`)
        .set(bearer(token))
        .expect(403);
    }
    await upload(stranger, candidateId, pdf('x')).expect(403);
    await http()
      .get(`/api/candidates/${candidateId}/cv`)
      .set(bearer(stranger))
      .expect(403);
    await http()
      .delete(`/api/candidates/${candidateId}/cv`)
      .set(bearer(stranger))
      .expect(403);
  });

  it('từ chối thiếu tệp, sai loại, quá lớn và sai tên trường', async () => {
    const noFile = await http()
      .post(`/api/candidates/${candidateId}/cv`)
      .set(bearer(candidate))
      .expect(400);
    expect(noFile.body.detail).toContain('chọn tệp');

    const fake = await upload(
      candidate,
      candidateId,
      Buffer.from('chỉ là văn bản'),
      {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      },
    ).expect(400);
    expect(fake.body.detail).toContain('PDF, DOC hoặc DOCX');

    const tooBig = await upload(
      candidate,
      candidateId,
      Buffer.concat([pdf('lớn'), Buffer.alloc(6 * 1024 * 1024)]),
    ).expect(413);
    expect(tooBig.body.title).toBe('Tệp quá lớn');

    await http()
      .post(`/api/candidates/${candidateId}/cv`)
      .set(bearer(candidate))
      .attach('khac', pdf('x'), pdfFile)
      .expect(400);

    const profile = await http()
      .get(`/api/candidates/${candidateId}/profile`)
      .set(bearer(candidate))
      .expect(200);
    expect(profile.body.cv).toBeNull();
  });

  it('tải lên giữ nguyên tên tiếng Việt, hồ sơ có CV và tải về đúng nội dung với header an toàn', async () => {
    const content = pdf('Nội dung CV bản đầu');
    const info = await upload(candidate, candidateId, content, {
      filename: 'CV Nguyễn Văn Ứng.pdf',
      contentType: 'application/octet-stream',
    }).expect(201);

    expect(info.body).toMatchObject({
      fileName: 'CV Nguyễn Văn Ứng.pdf',
      contentType: 'application/pdf',
      sizeBytes: content.length,
    });
    const profile = await http()
      .get(`/api/candidates/${candidateId}/profile`)
      .set(bearer(candidate))
      .expect(200);
    expect(profile.body.cv).toMatchObject({
      fileName: 'CV Nguyễn Văn Ứng.pdf',
    });

    const download = await http()
      .get(`/api/candidates/${candidateId}/cv`)
      .set(bearer(candidate))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.from(download.body as Buffer).equals(content)).toBe(true);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('CV Nguyễn Văn Ứng.pdf')}`,
    );
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['cache-control']).toBe('private, no-store');
  });

  it('CV đính kèm đơn khi nộp; nhà tuyển dụng đúng công ty tải được, công ty khác thì không; đổi/xóa CV sau đó không ảnh hưởng đơn đã nộp', async () => {
    const original = pdf('CV tại thời điểm nộp');
    await upload(candidate, candidateId, original).expect(201);
    const jobId = await publishJob();

    const applied = await http()
      .post('/api/applications')
      .set(bearer(candidate))
      .send({ jobId })
      .expect(201);
    expect(applied.body.cvAttached).toBe(true);
    const applicationId = applied.body.id as number;

    const list = await http()
      .get('/api/employers/1/applications')
      .set(bearer(employer))
      .expect(200);
    expect(
      list.body.find((item: { id: number }) => item.id === applicationId),
    ).toMatchObject({
      cvAttached: true,
    });
    const detail = await http()
      .get(`/api/employers/1/applications/${applicationId}`)
      .set(bearer(employer))
      .expect(200);
    expect(detail.body.cv).toMatchObject({ contentType: 'application/pdf' });
    // Hồ sơ nhìn từ nhà tuyển dụng không lộ CV hiện tại của ứng viên.
    expect(detail.body.candidate).not.toHaveProperty('cv');

    const sent = (token: string, companyId: number) =>
      http()
        .get(`/api/employers/${companyId}/applications/${applicationId}/cv`)
        .set(bearer(token))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });
    expect(
      Buffer.from((await sent(employer, 1).expect(200)).body as Buffer).equals(
        original,
      ),
    ).toBe(true);
    await sent(otherEmployer, otherCompanyId).expect(404);
    await http()
      .get(`/api/employers/1/applications/${applicationId}/cv`)
      .set(bearer(otherEmployer))
      .expect(403);
    await http()
      .get(`/api/employers/1/applications/${applicationId}/cv`)
      .expect(401);

    // Ứng viên đổi sang CV mới rồi xóa luôn: đơn cũ vẫn giữ bản đã nộp.
    await upload(candidate, candidateId, pdf('CV mới hơn')).expect(201);
    await http()
      .delete(`/api/candidates/${candidateId}/cv`)
      .set(bearer(candidate))
      .expect(204);
    expect(
      Buffer.from((await sent(employer, 1).expect(200)).body as Buffer).equals(
        original,
      ),
    ).toBe(true);

    const profile = await http()
      .get(`/api/candidates/${candidateId}/profile`)
      .set(bearer(candidate))
      .expect(200);
    expect(profile.body.cv).toBeNull();
    await http()
      .get(`/api/candidates/${candidateId}/cv`)
      .set(bearer(candidate))
      .expect(404);
    await http()
      .delete(`/api/candidates/${candidateId}/cv`)
      .set(bearer(candidate))
      .expect(204);
  });

  it('đơn nộp khi chưa có CV không có CV để tải', async () => {
    const jobId = await publishJob();
    const applied = await http()
      .post('/api/applications')
      .set(bearer(stranger))
      .send({ jobId })
      .expect(201);
    expect(applied.body.cvAttached).toBe(false);

    await http()
      .get(`/api/employers/1/applications/${applied.body.id}/cv`)
      .set(bearer(employer))
      .expect(404);
    const detail = await http()
      .get(`/api/employers/1/applications/${applied.body.id}`)
      .set(bearer(employer))
      .expect(200);
    expect(detail.body.cv).toBeNull();
    await http()
      .get(`/api/employers/1/applications/999999/cv`)
      .set(bearer(employer))
      .expect(404);
    expect(strangerId).toBeGreaterThan(0);
  });

  it('OpenAPI mô tả các endpoint CV', async () => {
    const docs = (await http().get('/api/openapi.json').expect(200)).body;

    expect(docs.paths['/api/candidates/{candidateId}/cv'].post).toBeDefined();
    expect(docs.paths['/api/candidates/{candidateId}/cv'].get).toBeDefined();
    expect(docs.paths['/api/candidates/{candidateId}/cv'].delete).toBeDefined();
    expect(
      docs.paths['/api/employers/{companyId}/applications/{applicationId}/cv']
        .get,
    ).toBeDefined();
  });

  if (provider === 'PostgreSql') {
    it('khởi động lại ứng dụng vẫn giữ CV hiện tại (thông tin trong database, nội dung trong thư mục lưu)', async () => {
      const content = pdf('CV sau khi khởi động lại');
      await upload(candidate, candidateId, content, {
        filename: 'Bền vững.pdf',
        contentType: 'application/pdf',
      }).expect(201);

      await app.close();
      await startApp();

      const profile = await http()
        .get(`/api/candidates/${candidateId}/profile`)
        .set(bearer(candidate))
        .expect(200);
      expect(profile.body.cv).toMatchObject({ fileName: 'Bền vững.pdf' });
      const download = await http()
        .get(`/api/candidates/${candidateId}/cv`)
        .set(bearer(candidate))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.from(download.body as Buffer).equals(content)).toBe(true);
    });
  }
});
