import { Injectable } from '@nestjs/common';
import { Candidate, Job } from '../../domain';
import {
  CompositeScorer,
  JobMatchScorer,
  SalaryFitScorer,
  SkillOverlapScorer,
  WeightedScorer,
} from './job-match-scorer';

export interface MatchBreakdown {
  /** Độ phù hợp 0–100. */
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  salaryFit: boolean;
}

/**
 * Độ phù hợp giữa ứng viên và tin tuyển dụng: 70% theo kỹ năng, 30% theo mức lương.
 * Thêm tiêu chí mới = thêm một scorer vào danh sách, không sửa CompositeScorer.
 */
@Injectable()
export class JobMatchService {
  private readonly scorer: JobMatchScorer = new CompositeScorer([
    new WeightedScorer(new SkillOverlapScorer(), 0.7),
    new WeightedScorer(new SalaryFitScorer(), 0.3),
  ]);

  score(job: Job, candidate: Candidate): number {
    return Math.round(this.scorer.score(job, candidate));
  }

  breakdown(job: Job, candidate: Candidate): MatchBreakdown {
    const owned = new Set(
      candidate.skills.map((skill) => skill.name.toLowerCase()),
    );
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];
    for (const skill of job.skills) {
      (owned.has(skill.name.toLowerCase())
        ? matchedSkills
        : missingSkills
      ).push(skill.name);
    }

    return {
      score: this.score(job, candidate),
      matchedSkills,
      missingSkills,
      salaryFit:
        candidate.desiredSalary !== null &&
        job.salary.overlaps(candidate.desiredSalary),
    };
  }
}
