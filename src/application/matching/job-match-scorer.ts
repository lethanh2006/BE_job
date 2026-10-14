import { Candidate, Job } from '../../domain';

export interface JobMatchScorer {
  score(job: Job, candidate: Candidate): number;
}

export class SalaryFitScorer implements JobMatchScorer {
  score(job: Job, candidate: Candidate): number {
    return candidate.desiredSalary &&
      job.salary.overlaps(candidate.desiredSalary)
      ? 100
      : 0;
  }
}

export class SkillOverlapScorer implements JobMatchScorer {
  score(job: Job, candidate: Candidate): number {
    if (job.skills.length === 0) return 100;

    const candidateSkills = new Set(
      candidate.skills.map((skill) => skill.name.toLowerCase()),
    );
    const matched = job.skills.filter((skill) =>
      candidateSkills.has(skill.name.toLowerCase()),
    ).length;

    return Math.round((matched * 100 * 100) / job.skills.length) / 100;
  }
}

export class CompositeScorer implements JobMatchScorer {
  constructor(private readonly scorers: readonly JobMatchScorer[]) {}

  score(job: Job, candidate: Candidate): number {
    return this.scorers.reduce(
      (sum, scorer) => sum + scorer.score(job, candidate),
      0,
    );
  }
}

/** Nhân điểm của scorer con với một trọng số (decorator, không sửa scorer gốc). */
export class WeightedScorer implements JobMatchScorer {
  constructor(
    private readonly inner: JobMatchScorer,
    private readonly weight: number,
  ) {}

  score(job: Job, candidate: Candidate): number {
    return this.inner.score(job, candidate) * this.weight;
  }
}
