import {
  JobCategoryCount,
  JobRepository,
  JobSearchCriteria,
  JobSearchPage,
  JobSearchReader,
} from '../../application/abstractions/persistence';
import { JobSortOrder } from '../../application/jobs/dto';
import {
  sortCategoryCounts,
  toJobSummary,
} from '../../application/jobs/job-mapping';
import { foldText } from '../../application/common/text-folding';
import { Job, JobStatus } from '../../domain';

/** "Chứa" không phân biệt hoa thường và dấu tiếng Việt. */
const includesFolded = (text: string, part: string) =>
  foldText(text).includes(foldText(part));

/** Triển khai trong bộ nhớ: lọc trên toàn bộ tin; dùng cho provider InMemory và làm chuẩn so sánh trong test. */
export class InMemoryJobSearchReader extends JobSearchReader {
  constructor(private readonly jobs: JobRepository) {
    super();
  }

  async search(criteria: JobSearchCriteria): Promise<JobSearchPage> {
    const filtered = (await this.jobs.getAll())
      .filter((job) => job.status === JobStatus.Published && !job.isExpired)
      .filter((job) => matches(job, criteria));

    filtered.sort(
      criteria.sort === JobSortOrder.SalaryDescending
        ? (a, b) => b.salary.max - a.salary.max || a.id - b.id
        : (a, b) => b.postedAt.getTime() - a.postedAt.getTime() || a.id - b.id,
    );

    const start = (criteria.page - 1) * criteria.pageSize;
    return {
      items: filtered.slice(start, start + criteria.pageSize).map(toJobSummary),
      total: filtered.length,
    };
  }

  async categories(): Promise<JobCategoryCount[]> {
    const counts = new Map<string, number>();
    for (const job of await this.jobs.getAll()) {
      if (
        job.status !== JobStatus.Published ||
        job.isExpired ||
        !job.category
      ) {
        continue;
      }
      counts.set(job.category, (counts.get(job.category) ?? 0) + 1);
    }

    return sortCategoryCounts(
      [...counts].map(([name, count]) => ({ name, count })),
    );
  }
}

function matches(job: Job, c: JobSearchCriteria): boolean {
  return (
    (!c.keyword ||
      includesFolded(job.title, c.keyword) ||
      (job.company ? includesFolded(job.company.name, c.keyword) : false) ||
      job.skills.some((skill) => includesFolded(skill.name, c.keyword!))) &&
    (c.minimumSalary === undefined || job.salary.min >= c.minimumSalary) &&
    c.skills.every((required) =>
      job.skills.some((skill) => foldText(skill.name) === required),
    ) &&
    (!c.location || includesFolded(job.location, c.location)) &&
    (!c.category || includesFolded(job.category, c.category)) &&
    (c.level === undefined || job.level === c.level)
  );
}
