import { Injectable } from '@nestjs/common';
import { ArgumentError, Job, JobStatus } from '../../domain';
import { JobRepository } from '../abstractions/persistence';
import { PagedResult } from '../common/paged-result';
import { JobSortOrder, JobSummaryDto, SearchJobsQuery } from './dto';
import { companyNameOf, sortedSkillNames } from './job-mapping';

const includesIgnoreCase = (text: string, part: string) =>
  text.toLowerCase().includes(part.toLowerCase());

@Injectable()
export class JobSearchService {
  constructor(private readonly jobs: JobRepository) {}

  async search(query: SearchJobsQuery): Promise<PagedResult<JobSummaryDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    if (!(page > 0)) throw new ArgumentError('Số trang phải lớn hơn 0.');
    if (!(pageSize > 0 && pageSize <= 100)) {
      throw new ArgumentError('Kích thước trang phải từ 1 đến 100.');
    }
    if (query.minimumSalary != null && query.minimumSalary < 0) {
      throw new ArgumentError('Mức lương lọc không được âm.');
    }

    const keyword = query.keyword?.trim();
    const location = query.location?.trim();
    const category = query.category?.trim();
    const requiredSkills = new Set(
      (query.skills ?? [])
        .filter((skill) => skill.trim() !== '')
        .map((skill) => skill.trim().toLowerCase()),
    );

    const matches = (job: Job): boolean =>
      (!keyword ||
        includesIgnoreCase(job.title, keyword) ||
        (job.company ? includesIgnoreCase(job.company.name, keyword) : false) ||
        job.skills.some((skill) => includesIgnoreCase(skill.name, keyword))) &&
      (query.minimumSalary == null || job.salary.min >= query.minimumSalary) &&
      (requiredSkills.size === 0 ||
        [...requiredSkills].every((required) =>
          job.skills.some((skill) => skill.name.toLowerCase() === required),
        )) &&
      (!location || includesIgnoreCase(job.location, location)) &&
      (!category || includesIgnoreCase(job.category, category)) &&
      (query.level == null || job.level === query.level);

    const filtered = (await this.jobs.getAll())
      .filter((job) => job.status === JobStatus.Published && !job.isExpired)
      .filter(matches);

    filtered.sort(
      query.sort === JobSortOrder.SalaryDescending
        ? (a, b) => b.salary.max - a.salary.max || a.id - b.id
        : (a, b) => b.postedAt.getTime() - a.postedAt.getTime() || a.id - b.id,
    );

    const items = filtered
      .slice((page - 1) * pageSize, page * pageSize)
      .map(toSummary);

    return new PagedResult(items, page, pageSize, filtered.length);
  }
}

const toSummary = (job: Job): JobSummaryDto => ({
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
