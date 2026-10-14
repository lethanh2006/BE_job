import { join } from 'node:path';
import { ApplicationStatus, JobApplication, JobStatus } from '../../domain';
import { MutableClock, makeJob } from '../../testing/test-helpers';
import { InMemoryJobApplicationRepository } from './in-memory-job-application-repository';
import { InMemoryJobRepository } from './in-memory-job-repository';

describe('InMemoryJobRepository', () => {
  const seedFile = join(__dirname, '..', '..', 'data', 'seed', 'jobs.json');

  it('nạp tin tuyển dụng từ file seed và cấp mã tiếp theo', async () => {
    const repository = new InMemoryJobRepository(seedFile, new MutableClock());

    const jobs = await repository.getAll();
    const first = await repository.getById(1);

    expect(jobs.length).toBeGreaterThan(0);
    expect(first!.title).toBe('Backend Developer (.NET)');
    expect(first!.status).toBe(JobStatus.Published);
    expect(first!.skills.map((s) => s.name)).toEqual([
      'C#',
      'ASP.NET Core',
      'PostgreSQL',
    ]);
    expect(await repository.getNextId()).toBe(
      Math.max(...jobs.map((j) => j.id)) + 1,
    );
  });

  it('thêm tin mới, từ chối mã trùng', async () => {
    const clock = new MutableClock();
    const repository = new InMemoryJobRepository(seedFile, clock);
    const job = makeJob(clock, { id: await repository.getNextId() });

    await repository.add(job);

    expect(await repository.getById(job.id)).toBe(job);
    await expect(repository.add(job)).rejects.toThrow();
  });
});

describe('InMemoryJobApplicationRepository', () => {
  it('seed demo: lịch sử của ứng viên 20 mới nhất trước và cấp mã tiếp theo', async () => {
    const repository = new InMemoryJobApplicationRepository(true);

    const history = await repository.getByCandidateId(20);

    expect(history.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(await repository.getNextId()).toBe(4);
    expect(await repository.hasApplied(20, 2)).toBe(true);
    expect(await repository.hasApplied(20, 3)).toBe(false);
  });

  it('cập nhật trạng thái đơn được lưu lại', async () => {
    const repository = new InMemoryJobApplicationRepository();
    const application = new JobApplication(1, 2, 3, new Date());
    await repository.add(application);

    expect((await repository.getById(1))!.status).toBe(
      ApplicationStatus.Submitted,
    );
    expect(await repository.getByJobId(2)).toHaveLength(1);
  });
});
