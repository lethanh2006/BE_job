import {
  JobSearchCriteria,
  JobSearchPage,
  JobSearchReader,
} from '../../application/abstractions/persistence';
import { JobSummaryDto } from '../../application/jobs/dto';
import { compareSkillNames } from '../../application/jobs/job-mapping';
import { Clock, JobLevel, WorkMode } from '../../domain';
import { Database } from './database';
import { buildJobCountQuery, buildJobSearchQuery } from './job-search-query';

interface SummaryRow {
  id: number;
  title: string;
  company_id: number;
  company_name: string;
  location: string;
  salary_min: string;
  salary_max: string;
  level: JobLevel;
  work_mode: WorkMode;
  category: string;
  deadline: Date;
  posted_at: Date;
  featured: boolean;
  skills: string[];
  total: string;
}

/** Lọc, sắp xếp, phân trang ngay trong PostgreSQL và chỉ đọc các cột của thẻ việc làm. */
export class PostgresJobSearchReader extends JobSearchReader {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    super();
  }

  async search(criteria: JobSearchCriteria): Promise<JobSearchPage> {
    const now = this.clock.utcNow;
    const page = buildJobSearchQuery(criteria, now);
    const { rows } = await this.db.query<SummaryRow>(page.text, page.params);

    let total = rows.length > 0 ? Number(rows[0].total) : 0;
    // Trang vượt quá dữ liệu thì window function không trả dòng nào: đếm riêng để total vẫn đúng.
    if (rows.length === 0 && criteria.page > 1) {
      const count = buildJobCountQuery(criteria, now);
      total = Number(
        (await this.db.query<{ total: string }>(count.text, count.params))
          .rows[0].total,
      );
    }

    return { items: rows.map(toSummary), total };
  }
}

const toSummary = (row: SummaryRow): JobSummaryDto => ({
  id: row.id,
  title: row.title,
  companyId: row.company_id,
  company: row.company_name,
  location: row.location,
  salaryMin: Number(row.salary_min),
  salaryMax: Number(row.salary_max),
  level: row.level,
  workMode: row.work_mode,
  category: row.category,
  deadline: row.deadline,
  postedAt: row.posted_at,
  featured: row.featured,
  skills: [...row.skills].sort(compareSkillNames),
});
