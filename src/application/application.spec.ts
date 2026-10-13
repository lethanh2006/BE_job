import { Candidate, Job, SalaryRange, Skill, Clock } from '../domain';
import { validatePassword } from './auth';
import {
  CompositeScorer,
  SalaryFitScorer,
  SkillOverlapScorer,
} from './matching/job-match-scorer';
import { PagedResult } from './common/paged-result';

const clock = { utcNow: new Date('2026-10-01T00:00:00Z') } as Clock;
const job = (skills: string[], salary = new SalaryRange(1000, 2000)) => {
  const j = Job.create({
    id: 1,
    title: 'J',
    companyId: 1,
    salary,
    deadline: new Date('2026-12-01T00:00:00Z'),
    clock,
  });
  skills.forEach((s) => j.addSkill(new Skill(s)));
  return j;
};

describe('chấm điểm phù hợp', () => {
  const candidate = new Candidate(
    1,
    'An',
    'an@x.vn',
    null,
    new SalaryRange(1500, 3000),
  );
  ['C#', 'Docker'].forEach((s) => candidate.addSkill(new Skill(s)));

  it('SkillOverlapScorer tính tỉ lệ kỹ năng khớp', () => {
    const scorer = new SkillOverlapScorer();
    expect(scorer.score(job([]), candidate)).toBe(100);
    expect(scorer.score(job(['c#', 'Go', 'AWS']), candidate)).toBe(33.33);
  });

  it('SalaryFitScorer và CompositeScorer', () => {
    expect(new SalaryFitScorer().score(job([]), candidate)).toBe(100);
    expect(
      new SalaryFitScorer().score(
        job([], new SalaryRange(5000, 6000)),
        candidate,
      ),
    ).toBe(0);
    const composite = new CompositeScorer([
      new SalaryFitScorer(),
      new SkillOverlapScorer(),
    ]);
    expect(composite.score(job(['C#']), candidate)).toBe(200);
  });
});

describe('PasswordPolicy', () => {
  it('chấp nhận mật khẩu mạnh, từ chối mật khẩu yếu', () => {
    expect(() => validatePassword('JobBoard@123')).not.toThrow();
    for (const weak of [
      '',
      'short1A!',
      'alllowercase1!',
      'ALLUPPERCASE1!',
      'NoDigits!!!!',
      'NoSpecial1234',
    ]) {
      expect(() => validatePassword(weak)).toThrow();
    }
  });
});

describe('PagedResult', () => {
  it('tính tổng số trang', () => {
    expect(new PagedResult([], 1, 10, 0).toJSON().totalPages).toBe(0);
    expect(new PagedResult([], 1, 10, 21).toJSON().totalPages).toBe(3);
  });
});
