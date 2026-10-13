import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ArgumentError } from '../src/domain';

const PASSWORD = 'JobBoard@123';

describe('JobBoard API (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  const login = (email: string, password = PASSWORD) =>
    http().post('/api/auth/login').send({ email, password });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.JWT_SIGNING_KEY = 'test-signing-key-test-signing-key-123456';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        exceptionFactory: (errors) =>
          new ArgumentError(
            errors
              .flatMap((error) => Object.values(error.constraints ?? {}))
              .join('; '),
          ),
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

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
