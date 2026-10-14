import { Job } from '../../domain';
import { JobSummaryDto } from './dto';

export const companyNameOf = (job: Job): string =>
  job.company?.name ?? `Công ty #${job.companyId}`;

/** So sánh tên kỹ năng không phân biệt hoa thường để mọi nơi hiển thị cùng một thứ tự. */
export const compareSkillNames = (a: string, b: string): number =>
  a.localeCompare(b, 'en', { sensitivity: 'base' });

export const sortedSkillNames = (job: Job): string[] =>
  job.skills.map((skill) => skill.name).sort(compareSkillNames);

export const toJobSummary = (job: Job): JobSummaryDto => ({
  id: job.id,
  title: job.title,
  companyId: job.companyId,
  company: companyNameOf(job),
  location: job.location,
  salaryMin: job.salary.min,
  salaryMax: job.salary.max,
  level: job.level,
  workMode: job.workMode,
  category: job.category,
  deadline: job.deadline,
  postedAt: job.postedAt,
  featured: job.featured,
  skills: sortedSkillNames(job),
});
