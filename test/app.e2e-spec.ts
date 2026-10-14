import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { AppConfig } from '../src/config/app-config';
import { setupOpenApi } from '../src/openapi';
import { createTestDatabase } from './support/postgres-test-database';

const PASSWORD = 'JobBoard@123';

const baseEnv = {
  NODE_ENV: 'test',
  JWT_SIGNING_KEY: 'test-signing-key-test-signing-key-123456',
};

interface Backend {
  name: string;
  setup(): Promise<AppConfig>;
  teardown(): Promise<void>;
}

const inMemoryBackend: Backend = {
  name: 'InMemory',
  setup: () => Promise.resolve(AppConfig.fromEnv(baseEnv)),
  teardown: () => Promise.resolve(),
};

/** Mỗi lần chạy dùng một database riêng để không đụng dữ liệu phát triển. */
function postgresBackend(adminUrl: string): Backend {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;

  return {
    name: 'PostgreSql',
    async setup() {
      database = await createTestDatabase(adminUrl);
      return AppConfig.fromEnv({
        ...baseEnv,
        PERSISTENCE_PROVIDER: 'PostgreSql',
        DATABASE_URL: database.url,
        PERSISTENCE_APPLY_MIGRATIONS: 'true',
      });
    },
    teardown: () => database.drop(),
  };
}

// Suite PostgreSql chỉ chạy khi có E2E_POSTGRES_URL (kết nối quản trị, ví dụ
// postgres://jobboard:jobboard_dev_password@localhost:5434/postgres).
const backends = [
  inMemoryBackend,
  ...(process.env.E2E_POSTGRES_URL
    ? [postgresBackend(process.env.E2E_POSTGRES_URL)]
    : []),
];

describe.each(backends)('JobBoard API (e2e) — $name', (backend) => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  const login = (email: string, password = PASSWORD) =>
    http().post('/api/auth/login').send({ email, password });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const config = await backend.setup();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, config);
    setupOpenApi(app);
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  it('phát tài liệu OpenAPI đủ các nhóm endpoint', async () => {
    const res = await http().get('/api/openapi.json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/jobs',
        '/api/auth/login',
        '/api/applications/{id}/status',
        '/api/employers/{companyId}/jobs/{jobId}/publish',
      ]),
    );
    expect(res.body.components.securitySchemes.bearer).toBeDefined();
    await http().get('/api/docs').expect(200);
  });

  it('GET /api/health', async () => {
    await http().get('/api/health').expect(200, { status: 'healthy' });
  });

  describe('jobs', () => {
    it('tìm kiếm có phân trang và lọc theo kỹ năng', async () => {
      const res = await http()
        .get('/api/jobs?skills=docker&skills=AWS&pageSize=5')
        .expect(200);
      expect(res.body.totalItems).toBeGreaterThan(0);
      for (const job of res.body.items) {
        expect(job.skills).toEqual(expect.arrayContaining(['AWS', 'Docker']));
      }
    });

    it('kích thước trang không hợp lệ → 400 ProblemDetails', async () => {
      const res = await http().get('/api/jobs?pageSize=1000').expect(400);
      expect(res.type).toBe('application/problem+json');
      expect(res.body.title).toBe('Dữ liệu không hợp lệ');
    });

    it('lọc tin nổi bật', async () => {
      const featured = await http().get('/api/jobs?featured=true').expect(200);
      expect(featured.body.totalItems).toBeGreaterThan(0);
      expect(
        featured.body.items.every((job: { featured: boolean }) => job.featured),
      ).toBe(true);
      const normal = await http().get('/api/jobs?featured=false').expect(200);
      expect(
        normal.body.items.every((job: { featured: boolean }) => !job.featured),
      ).toBe(true);
      await http().get('/api/jobs?featured=maybe').expect(400);
    });

    it('danh sách lĩnh vực đang tuyển (không nhầm với :id)', async () => {
      const res = await http().get('/api/jobs/categories').expect(200);
      expect(res.body.length).toBeGreaterThan(2);
      expect(res.body[0]).toEqual({
        name: expect.any(String),
        count: expect.any(Number),
      });
    });

    it('chi tiết tin: 200 và 404', async () => {
      await http().get('/api/jobs/1').expect(200);
      await http().get('/api/jobs/9999').expect(404);
    });
  });

  describe('xác thực', () => {
    it('đăng nhập sai mật khẩu → 401', async () => {
      const res = await login('candidate@jobboard.vn', 'sai-mat-khau');
      expect(res.status).toBe(401);
    });

    it('/auth/me cần token hợp lệ', async () => {
      await http().get('/api/auth/me').expect(401);
      await http().get('/api/auth/me').set(bearer('abc.def.ghi')).expect(401);

      const { body } = await login('employer@jobboard.vn');
      const me = await http()
        .get('/api/auth/me')
        .set(bearer(body.accessToken))
        .expect(200);
      expect(me.body).toMatchObject({
        role: 'Employer',
        companyId: 1,
        companyName: 'Nova Technology',
      });
    });

    it('refresh token xoay vòng và phát hiện tái sử dụng', async () => {
      const first = (await login('candidate@jobboard.vn')).body;
      const second = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(second.body.refreshToken).not.toBe(first.refreshToken);

      // Dùng lại token cũ → từ chối và thu hồi cả họ token.
      await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(401);
    });

    it('đăng ký ứng viên, đổi mật khẩu và thu hồi phiên', async () => {
      const email = `new.${Date.now()}@example.com`;
      const reg = await http()
        .post('/api/auth/register/candidate')
        .send({ name: 'Ứng viên mới', email, password: 'Mat-khau-1234' })
        .expect(201);
      await http()
        .post('/api/auth/register/candidate')
        .send({ name: 'Trùng', email, password: 'Mat-khau-1234' })
        .expect(409);
      await http()
        .post('/api/auth/register/candidate')
        .send({ name: 'Yếu', email: 'a@b.co', password: 'yeu' })
        .expect(400);

      await http()
        .put('/api/auth/password')
        .set(bearer(reg.body.accessToken))
        .send({
          currentPassword: 'Mat-khau-1234',
          newPassword: 'Mat-khau-5678',
        })
        .expect(204);
      await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken })
        .expect(401);
      const relogin = await login(email, 'Mat-khau-5678');
      expect(relogin.status).toBe(200);
    });
  });

  describe('nhà tuyển dụng đăng ký và hồ sơ công ty', () => {
    const unique = Date.now();
    const registration = {
      name: 'Chủ mới',
      email: `chu.${unique}@example.com`,
      password: 'Mat-khau-1234',
      companyName: `Công ty E2E ${unique}`,
      companyLocation: 'Cần Thơ',
    };
    let token: string;
    let companyId: number;

    it('đăng ký tạo công ty và tài khoản quản lý, đăng nhập được', async () => {
      const res = await http()
        .post('/api/auth/register/employer')
        .send(registration)
        .expect(201);

      expect(res.body.user).toMatchObject({
        role: 'Employer',
        companyName: registration.companyName,
      });
      companyId = res.body.user.companyId;
      token = res.body.accessToken;
      expect(companyId).toBeGreaterThanOrEqual(100);
      const relogin = await login(registration.email, registration.password);
      expect(relogin.status).toBe(200);
    });

    it('email hoặc tên công ty trùng → 409; dữ liệu sai → 400', async () => {
      await http()
        .post('/api/auth/register/employer')
        .send({ ...registration, companyName: 'Tên khác hẳn' })
        .expect(409);
      const duplicateName = await http()
        .post('/api/auth/register/employer')
        .send({
          ...registration,
          email: `khac.${unique}@example.com`,
          companyName: registration.companyName.toUpperCase(),
        })
        .expect(409);
      expect(duplicateName.body.title).toBe('Tên công ty đã tồn tại');
      await http()
        .post('/api/auth/register/employer')
        .send({
          ...registration,
          email: `y.${unique}@example.com`,
          password: 'yeu',
        })
        .expect(400);
      await http()
        .post('/api/auth/register/employer')
        .send({
          ...registration,
          email: `z.${unique}@example.com`,
          companyName: '',
        })
        .expect(400);
    });

    it('tạo và đăng tin; tin hiển thị công khai kèm công ty, lọc được theo companyId', async () => {
      const created = await http()
        .post(`/api/employers/${companyId}/jobs`)
        .set(bearer(token))
        .send({
          title: 'Tin của công ty mới',
          location: 'Cần Thơ',
          salaryMin: 500,
          salaryMax: 900,
          deadline: '2099-01-01T00:00:00Z',
          level: 'Junior',
          workMode: 'Onsite',
          category: 'Kinh doanh',
          summary: 'Tóm tắt',
          skills: [],
        })
        .expect(201);
      await http()
        .post(`/api/employers/${companyId}/jobs/${created.body.id}/publish`)
        .set(bearer(token))
        .expect(200);

      const byCompany = await http()
        .get(`/api/jobs?companyId=${companyId}`)
        .expect(200);
      expect(byCompany.body.items).toHaveLength(1);
      expect(byCompany.body.items[0]).toMatchObject({
        title: 'Tin của công ty mới',
        companyId,
        company: registration.companyName,
      });
    });

    it('hồ sơ công ty: xem công khai, chủ sở hữu sửa, tên mới đồng bộ vào tin và đăng nhập', async () => {
      await http()
        .get(`/api/companies/${companyId}`)
        .expect(200)
        .then((res) =>
          expect(res.body).toMatchObject({
            id: companyId,
            location: 'Cần Thơ',
            website: null,
          }),
        );

      const newName = `${registration.companyName} Mới`;
      await http()
        .put(`/api/employers/${companyId}/company`)
        .set(bearer(token))
        .send({
          name: newName,
          location: 'Hà Nội',
          website: 'https://example.com',
          description: 'Giới thiệu công ty',
        })
        .expect(200);

      const jobs = await http()
        .get(`/api/jobs?companyId=${companyId}`)
        .expect(200);
      expect(jobs.body.items[0].company).toBe(newName);
      const search = await http()
        .get(`/api/jobs?keyword=${encodeURIComponent('công ty e2e')}`)
        .expect(200);
      expect(
        search.body.items.some(
          (job: { companyId: number }) => job.companyId === companyId,
        ),
      ).toBe(true);
      const relogin = await login(registration.email, registration.password);
      expect(relogin.body.user.companyName).toBe(newName);
    });

    it('không sửa được công ty của người khác; dữ liệu sai → 400; trùng tên → 409', async () => {
      const demo = (await login('employer@jobboard.vn')).body.accessToken;

      await http()
        .put(`/api/employers/${companyId}/company`)
        .set(bearer(demo))
        .send({ name: 'Chiếm quyền' })
        .expect(403);
      await http()
        .get(`/api/employers/${companyId}/company`)
        .set(bearer(demo))
        .expect(403);
      await http()
        .put(`/api/employers/${companyId}/company`)
        .set(bearer(token))
        .send({ name: 'Công ty', website: 'ftp://example.com' })
        .expect(400);
      await http()
        .put(`/api/employers/${companyId}/company`)
        .set(bearer(token))
        .send({ name: 'nova technology' })
        .expect(409);
      await http().get('/api/companies/9999').expect(404);
      await http().get('/api/companies/abc').expect(404);
    });
  });

  describe('ứng viên', () => {
    let token: string;
    beforeAll(async () => {
      token = (await login('candidate@jobboard.vn')).body.accessToken;
    });

    it('chỉ xem/sửa hồ sơ của chính mình', async () => {
      await http()
        .get('/api/candidates/21/profile')
        .set(bearer(token))
        .expect(403);

      const profile = await http()
        .put('/api/candidates/20/profile')
        .set(bearer(token))
        .send({
          email: 'an@example.com',
          bio: ' Xin chào ',
          desiredSalaryMin: 1000,
          desiredSalaryMax: 2000,
          skills: ['TypeScript', 'typescript', 'NestJS'],
        })
        .expect(200);
      expect(profile.body).toMatchObject({
        bio: 'Xin chào',
        skills: ['NestJS', 'TypeScript'],
      });
    });

    it('nộp đơn: 201, trùng → 409, tin không tồn tại → 404', async () => {
      const res = await http()
        .post('/api/applications')
        .set(bearer(token))
        .send({ jobId: 1 })
        .expect(201);
      expect(res.body).toMatchObject({
        jobId: 1,
        candidateId: 20,
        status: 'Submitted',
      });
      await http()
        .post('/api/applications')
        .set(bearer(token))
        .send({ jobId: 1 })
        .expect(409);
      await http()
        .post('/api/applications')
        .set(bearer(token))
        .send({ jobId: 9999 })
        .expect(404);
    });

    it('độ phù hợp với các tin: kỹ năng khớp/thiếu và khoảng lương', async () => {
      // Hồ sơ hiện có (sau khi cập nhật ở test trên): TypeScript, NestJS; lương 1000-2000.
      const res = await http()
        .get('/api/candidates/20/job-matches?jobIds=2,9999&jobIds=1')
        .set(bearer(token))
        .expect(200);

      const byJob = Object.fromEntries(
        res.body.map((m: { jobId: number }) => [m.jobId, m]),
      );
      expect(Object.keys(byJob).sort()).toEqual(['1', '2']);
      expect(byJob[2]).toMatchObject({
        score: 53, // 1/3 kỹ năng * 70% + lương khớp * 30%
        matchedSkills: ['TypeScript'],
        missingSkills: ['React', 'Next.js'],
        salaryFit: true,
      });
    });

    it('job-matches từ chối tham số sai và hồ sơ của người khác', async () => {
      await http()
        .get('/api/candidates/20/job-matches')
        .set(bearer(token))
        .expect(400);
      await http()
        .get('/api/candidates/20/job-matches?jobIds=abc')
        .set(bearer(token))
        .expect(400);
      await http()
        .get('/api/candidates/21/job-matches?jobIds=1')
        .set(bearer(token))
        .expect(403);
      await http().get('/api/candidates/20/job-matches?jobIds=1').expect(401);
    });

    it('gợi ý việc làm: bỏ tin đã ứng tuyển, xếp theo độ phù hợp, tối đa limit', async () => {
      const res = await http()
        .get('/api/candidates/20/recommended-jobs?limit=3')
        .set(bearer(token))
        .expect(200);

      expect(res.body.length).toBeLessThanOrEqual(3);
      const applied = [1, 2, 5, 6]; // seed + đơn đã nộp ở test trước
      for (const job of res.body) {
        expect(applied).not.toContain(job.id);
        expect(job.matchScore).toBeGreaterThan(0);
      }
      const scores = res.body.map(
        (job: { matchScore: number }) => job.matchScore,
      );
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      await http()
        .get('/api/candidates/20/recommended-jobs?limit=0')
        .set(bearer(token))
        .expect(400);
    });

    it('employer không được nộp đơn', async () => {
      const employer = (await login('employer@jobboard.vn')).body.accessToken;
      await http()
        .post('/api/applications')
        .set(bearer(employer))
        .send({ jobId: 1 })
        .expect(403);
    });

    it('lịch sử ứng tuyển có thông tin tin tuyển dụng', async () => {
      const res = await http()
        .get('/api/candidates/20/applications')
        .set(bearer(token))
        .expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
      expect(res.body[0]).toHaveProperty('jobTitle');
    });
  });

  describe('nhà tuyển dụng', () => {
    let token: string;
    beforeAll(async () => {
      token = (await login('employer@jobboard.vn')).body.accessToken;
    });

    const newJob = (deadline: string) => ({
      title: 'NestJS Developer',
      location: 'Hà Nội',
      salaryMin: 1500,
      salaryMax: 2500,
      deadline,
      level: 'Middle',
      workMode: 'Remote',
      category: 'Lập trình Backend',
      summary: 'Tin thử nghiệm',
      skills: ['NestJS', 'TypeScript'],
    });

    it('chỉ thao tác được trên công ty của mình', async () => {
      await http().get('/api/employers/2/jobs').set(bearer(token)).expect(403);
      await http().get('/api/employers/1/jobs').set(bearer(token)).expect(200);
    });

    it('tạo nháp → đăng → đóng; đăng lại → 400', async () => {
      const created = await http()
        .post('/api/employers/1/jobs')
        .set(bearer(token))
        .send(newJob('2099-01-01T00:00:00Z'))
        .expect(201);
      expect(created.body.status).toBe('Draft');
      const id = created.body.id;

      const draftSearch = await http().get('/api/jobs?keyword=NestJS');
      expect(draftSearch.body.totalItems).toBe(0);

      await http()
        .post(`/api/employers/1/jobs/${id}/publish`)
        .set(bearer(token))
        .expect(200);
      await http()
        .post(`/api/employers/1/jobs/${id}/publish`)
        .set(bearer(token))
        .expect(400);

      const published = await http().get('/api/jobs?keyword=NestJS');
      expect(published.body.totalItems).toBe(1);

      await http()
        .post(`/api/employers/1/jobs/${id}/close`)
        .set(bearer(token))
        .expect(200);
    });

    it('xem chi tiết và thay thế toàn bộ nội dung của một tin', async () => {
      const created = await http()
        .post('/api/employers/1/jobs')
        .set(bearer(token))
        .send({
          ...newJob('2099-01-01T00:00:00Z'),
          title: 'Bản nháp để sửa',
          description: ['Mô tả A'],
        })
        .expect(201);
      const id = created.body.id;

      const detail = await http()
        .get(`/api/employers/1/jobs/${id}`)
        .set(bearer(token))
        .expect(200);
      expect(detail.body).toMatchObject({
        title: 'Bản nháp để sửa',
        description: ['Mô tả A'],
        requirements: [],
        skills: ['NestJS', 'TypeScript'],
        status: 'Draft',
      });

      const updated = await http()
        .put(`/api/employers/1/jobs/${id}`)
        .set(bearer(token))
        .send({
          ...newJob('2099-06-01T00:00:00Z'),
          title: 'Đã sửa',
          level: 'Lead',
          description: ['Mô tả B', 'Mô tả C'],
          requirements: ['Yêu cầu 1'],
          benefits: ['Quyền lợi 1'],
          skills: ['Go'],
        })
        .expect(200);
      expect(updated.body).toMatchObject({
        title: 'Đã sửa',
        level: 'Lead',
        description: ['Mô tả B', 'Mô tả C'],
        benefits: ['Quyền lợi 1'],
        skills: ['Go'],
      });

      // Sửa tin đã đóng → 400.
      await http()
        .post(`/api/employers/1/jobs/${id}/publish`)
        .set(bearer(token))
        .expect(200);
      await http()
        .post(`/api/employers/1/jobs/${id}/close`)
        .set(bearer(token))
        .expect(200);
      await http()
        .put(`/api/employers/1/jobs/${id}`)
        .set(bearer(token))
        .send(newJob('2099-06-01T00:00:00Z'))
        .expect(400);
    });

    it('từ chối dữ liệu quá dài và tin của công ty khác', async () => {
      await http()
        .post('/api/employers/1/jobs')
        .set(bearer(token))
        .send({ ...newJob('2099-01-01T00:00:00Z'), title: 'x'.repeat(201) })
        .expect(400);
      await http()
        .get('/api/employers/2/jobs/1')
        .set(bearer(token))
        .expect(403);
      await http()
        .get('/api/employers/1/jobs/9999')
        .set(bearer(token))
        .expect(404);
      // Tin #2 thuộc công ty khác: không được xem/sửa bằng token công ty 1.
      await http()
        .get('/api/employers/1/jobs/2')
        .set(bearer(token))
        .expect(403);
    });

    it('xem hồ sơ ứng viên kèm độ phù hợp; đơn công ty khác trả 404', async () => {
      const list = await http()
        .get('/api/employers/1/applications')
        .set(bearer(token))
        .expect(200);
      expect(list.body[0]).toHaveProperty('matchScore');

      const detail = await http()
        .get(`/api/employers/1/applications/${list.body[0].id}`)
        .set(bearer(token))
        .expect(200);
      expect(detail.body.candidate).toMatchObject({ id: 20 });
      expect(detail.body.application.matchScore).toBe(list.body[0].matchScore);
      expect(detail.body.matchedSkills).toEqual(expect.any(Array));
      expect(detail.body).toHaveProperty('salaryFit');

      // Đơn #2 thuộc tin của công ty khác.
      await http()
        .get('/api/employers/1/applications/2')
        .set(bearer(token))
        .expect(404);
    });

    it('bản nháp không xem được công khai cho tới khi đăng', async () => {
      const created = await http()
        .post('/api/employers/1/jobs')
        .set(bearer(token))
        .send({ ...newJob('2099-01-01T00:00:00Z'), title: 'Nháp bí mật' })
        .expect(201);
      const id = created.body.id;

      await http().get(`/api/jobs/${id}`).expect(404);
      await http()
        .post(`/api/employers/1/jobs/${id}/publish`)
        .set(bearer(token))
        .expect(200);
      const detail = await http().get(`/api/jobs/${id}`).expect(200);
      expect(detail.body).toMatchObject({
        title: 'Nháp bí mật',
        status: 'Published',
        expired: false,
      });

      await http()
        .post(`/api/employers/1/jobs/${id}/close`)
        .set(bearer(token))
        .expect(200);
      await http()
        .get(`/api/jobs/${id}`)
        .expect(200)
        .then((r) => expect(r.body.status).toBe('Closed'));
    });

    it('hạn nộp trong quá khứ → 400', async () => {
      await http()
        .post('/api/employers/1/jobs')
        .set(bearer(token))
        .send(newJob('2000-01-01T00:00:00Z'))
        .expect(400);
    });

    it('đổi trạng thái đơn chỉ cho công ty sở hữu tin', async () => {
      const apps = await http()
        .get('/api/employers/1/applications')
        .set(bearer(token))
        .expect(200);
      expect(apps.body.length).toBeGreaterThan(0);
      const own = apps.body[0];

      const changed = await http()
        .patch(`/api/applications/${own.id}/status`)
        .set(bearer(token))
        .send({ status: 'Accepted' })
        .expect(200);
      expect(changed.body.status).toBe('Accepted');

      // Đơn #2 thuộc tin của công ty khác → 403.
      await http()
        .patch('/api/applications/2/status')
        .set(bearer(token))
        .send({ status: 'Accepted' })
        .expect(403);
      await http()
        .patch(`/api/applications/${own.id}/status`)
        .set(bearer(token))
        .send({ status: 'Bogus' })
        .expect(400);
    });
  });
});
