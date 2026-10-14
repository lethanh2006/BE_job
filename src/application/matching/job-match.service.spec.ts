import { Candidate, SalaryRange, Skill } from '../../domain';
import { MutableClock, makeJob } from '../../testing/test-helpers';
import { JobMatchService } from './job-match.service';

describe('JobMatchService', () => {
  const clock = new MutableClock();
  const service = new JobMatchService();
  const candidate = (skills: string[], salary: [number, number] | null) => {
    const c = new Candidate(
      1,
      'An',
      'an@x.vn',
      null,
      salary ? new SalaryRange(...salary) : null,
    );
    skills.forEach((skill) => c.addSkill(new Skill(skill)));
    return c;
  };

  it('khớp hoàn toàn kỹ năng và lương cho 100 điểm', () => {
    const job = makeJob(clock, {
      skills: ['C#', 'Docker'],
      salary: [1000, 2000],
    });

    expect(
      service.score(job, candidate(['c#', 'docker', 'Go'], [1500, 2500])),
    ).toBe(100);
  });

  it('kỹ năng chiếm 70% và lương chiếm 30%', () => {
    const job = makeJob(clock, {
      skills: ['C#', 'Docker'],
      salary: [1000, 2000],
    });

    expect(service.score(job, candidate(['C#'], [1500, 2500]))).toBe(65); // 50*0.7 + 100*0.3
    expect(service.score(job, candidate(['C#', 'Docker'], [5000, 6000]))).toBe(
      70,
    );
    expect(service.score(job, candidate([], null))).toBe(0);
  });

  it('liệt kê kỹ năng khớp, còn thiếu và độ khớp lương', () => {
    const job = makeJob(clock, { skills: ['C#', 'Docker', 'AWS'] });

    expect(service.breakdown(job, candidate(['docker'], [1500, 2500]))).toEqual(
      {
        score: expect.any(Number),
        matchedSkills: ['Docker'],
        missingSkills: ['C#', 'AWS'],
        salaryFit: true,
      },
    );
  });
});
