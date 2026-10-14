import { makeNotifier } from '../../testing/test-helpers';
import { Candidate, JobStatus, SalaryRange, Skill } from '../../domain';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryJobApplicationRepository } from '../../infrastructure/persistence/in-memory-job-application-repository';
import { InMemoryJobSearchReader } from '../../infrastructure/persistence/in-memory-job-search-reader';
import {
  FakeJobRepository,
  makeJob,
  MutableClock,
} from '../../testing/test-helpers';
import { ApplicationService } from '../applications/application.service';
import { ResourceNotFoundException } from '../exceptions';
import { CandidateMatchService } from './candidate-match.service';
import { JobMatchService } from './job-match.service';

describe('CandidateMatchService', () => {
  const clock = new MutableClock();

  async function setup() {
    const jobs = new FakeJobRepository().seed(
      makeJob(clock, { id: 1, skills: ['C#', 'Docker'], salary: [1000, 2000] }),
      makeJob(clock, { id: 2, skills: ['C#'], salary: [5000, 6000] }),
      makeJob(clock, { id: 3, skills: ['Figma'], salary: [5000, 6000] }),
      makeJob(clock, { id: 4, skills: ['C#', 'Docker'], publish: false }),
    );
    const candidates = new InMemoryCandidateRepository();
    const candidate = new Candidate(
      20,
      'An',
      'an@x.vn',
      null,
      new SalaryRange(1500, 2500),
    );
    ['C#', 'Docker'].forEach((skill) => candidate.addSkill(new Skill(skill)));
    await candidates.add(candidate);
    const applications = new InMemoryJobApplicationRepository();

    return {
      applications,
      jobs,
      apply: new ApplicationService(jobs, applications, clock, makeNotifier()),
      service: new CandidateMatchService(
        candidates,
        jobs,
        applications,
        new InMemoryJobSearchReader(jobs),
        new JobMatchService(),
      ),
    };
  }

  it('getMatches bỏ qua mã không tồn tại và bản nháp', async () => {
    const { service } = await setup();

    const matches = await service.getMatches(20, [1, 4, 99, 1]);

    expect(matches.map((m) => m.jobId)).toEqual([1]);
    expect(matches[0]).toMatchObject({
      score: 100,
      matchedSkills: ['C#', 'Docker'],
      salaryFit: true,
    });
  });

  it('getMatches báo không tìm thấy khi ứng viên không tồn tại', async () => {
    const { service } = await setup();
    await expect(service.getMatches(404, [1])).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('recommend xếp theo điểm, bỏ tin điểm 0, tin nháp và tin đã ứng tuyển', async () => {
    const { service, apply, jobs } = await setup();

    const all = await service.recommend(20, 10);
    expect(all.map((job) => [job.id, job.matchScore])).toEqual([
      [1, 100],
      [2, 70], // đủ kỹ năng nhưng lương lệch: 100% * 70%
    ]);

    await apply.apply(20, 1);
    expect((await service.recommend(20, 10)).map((job) => job.id)).toEqual([2]);
    expect((await service.recommend(20, 1)).map((job) => job.id)).toEqual([2]);

    // Tin đã đóng không được gợi ý.
    const closed = (await jobs.getById(2))!;
    closed.close();
    expect(closed.status).toBe(JobStatus.Closed);
    expect(await service.recommend(20, 10)).toEqual([]);
  });
});
