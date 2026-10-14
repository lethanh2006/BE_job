import { Logger } from '@nestjs/common';
import { Candidate, Company, Employer, SalaryRange, Skill } from '../../domain';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryNotificationRepository } from '../../infrastructure/persistence/in-memory-notification-repository';
import { InMemoryUserAccountRepository } from '../../infrastructure/persistence/in-memory-user-account-repository';
import { InMemoryCompanyRepository } from '../../infrastructure/persistence/in-memory-company-repository';
import { InMemoryJobApplicationRepository } from '../../infrastructure/persistence/in-memory-job-application-repository';
import { Pbkdf2PasswordHasher } from '../../infrastructure/auth/pbkdf2-password-hasher';
import {
  FakeJobRepository,
  makeJob,
  MutableClock,
} from '../../testing/test-helpers';
import { ApplicationService } from '../applications/application.service';
import { JobMatchService } from '../matching/job-match.service';
import {
  NotificationService,
  JOB_MATCH_MAX_RECIPIENTS,
} from './notification.service';
import { JobManagementService } from '../jobs/job-management.service';

async function setup() {
  const clock = new MutableClock();
  const repository = new InMemoryNotificationRepository();
  const candidates = new InMemoryCandidateRepository(true);
  const companies = new InMemoryCompanyRepository();
  await companies.add(new Company(1, 'Công ty thử nghiệm'));
  const accounts = await InMemoryUserAccountRepository.createWithDemoData(
    new Pbkdf2PasswordHasher(),
    candidates,
    companies,
  );
  const service = new NotificationService(
    repository,
    accounts,
    candidates,
    new JobMatchService(),
    clock,
  );
  return { clock, repository, candidates, companies, accounts, service };
}

describe('NotificationService', () => {
  it('lỗi lưu thông báo hoặc đọc hồ sơ không làm hỏng ứng tuyển/đăng tin đã lưu', async () => {
    const { clock, repository, candidates, companies, service } = await setup();
    const jobs = new FakeJobRepository().seed(makeJob(clock, { companyId: 1 }));
    const applications = new InMemoryJobApplicationRepository();
    const apply = new ApplicationService(jobs, applications, clock, service);
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      jest
        .spyOn(repository, 'addMany')
        .mockRejectedValue(new Error('DB thông báo không khả dụng'));
      const result = await apply.apply(20, 1);
      expect(await applications.getById(result.id)).not.toBeNull();
      jest
        .spyOn(candidates, 'getById')
        .mockRejectedValue(new Error('Không tải được hồ sơ'));
      jobs.seed(makeJob(clock, { id: 2, companyId: 1 }));
      await expect(apply.apply(20, 2)).resolves.toMatchObject({ jobId: 2 });
      jobs.seed(
        makeJob(clock, { id: 3, companyId: 1, publish: false, skills: ['C#'] }),
      );
      const management = new JobManagementService(
        jobs,
        applications,
        companies,
        clock,
        service,
      );
      await expect(
        management.publish(
          3,
          new Employer(1, 'Bình', 'b@test.vn', new Company(1, 'ABC')),
        ),
      ).resolves.toMatchObject({ status: 'Published' });
      expect(log).toHaveBeenCalledTimes(3);
    } finally {
      log.mockRestore();
    }
  });

  it('giới hạn người nhận theo điểm và không báo khi không có kỹ năng', async () => {
    const { clock, repository, candidates, service } = await setup();
    for (let i = 1; i <= 120; i++) {
      const candidate = new Candidate(
        1000 + i,
        `Ứng viên ${i}`,
        `c${i}@test.vn`,
        null,
        new SalaryRange(1000, 2000),
      );
      candidate.addSkill(new Skill('React'));
      await candidates.add(candidate);
    }
    await service.jobPublished(makeJob(clock, { skills: [] }));
    expect(await repository.countUnread(1001)).toBe(0);
    await service.jobPublished(makeJob(clock, { skills: ['React'] }));
    expect(await repository.countUnread(1001)).toBe(1);
    expect(await repository.countUnread(1000 + JOB_MATCH_MAX_RECIPIENTS)).toBe(
      1,
    );
    expect(await repository.countUnread(1001 + JOB_MATCH_MAX_RECIPIENTS)).toBe(
      0,
    );
    expect(await repository.countUnread(20)).toBe(0);
  });

  it('không gửi cho tài khoản nhà tuyển dụng bị khóa', async () => {
    const { clock, repository, accounts, service } = await setup();
    await accounts.setDisabled(1, true);
    await service.jobTakenDown(makeJob(clock, { companyId: 1 }));
    expect(await repository.countUnread(1)).toBe(0);
  });
});
