import { JobSearchCriteria } from '../../application/abstractions/persistence';
import { foldText } from '../../application/common/text-folding';
import { JobSortOrder } from '../../application/jobs/dto';
import { JobStatus } from '../../domain';

/** Escape ký tự đặc biệt của LIKE để từ khóa của người dùng luôn được hiểu là chuỗi thường. */
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, '\\$&');

export interface BuiltQuery {
  text: string;
  params: unknown[];
}

const SUMMARY_COLUMNS = `id, title, company_id, company_name, location, salary_min, salary_max,
  level, work_mode, category, deadline, posted_at, featured, skills`;

function whereClause(criteria: JobSearchCriteria, now: Date) {
  const params: unknown[] = [JobStatus.Published, now];
  const bind = (value: unknown) => `$${params.push(value)}`;
  const conditions = ['status = $1', 'deadline > $2'];

  // Mẫu tìm đã chuẩn hóa (không dấu, chữ thường) để khớp với cột/hàm vn_fold phía database.
  const contains = (value: string) => bind(`%${escapeLike(foldText(value))}%`);

  if (criteria.keyword) {
    conditions.push(`search_text LIKE ${contains(criteria.keyword)}`);
  }
  if (criteria.location) {
    conditions.push(`vn_fold(location) LIKE ${contains(criteria.location)}`);
  }
  if (criteria.category) {
    conditions.push(`vn_fold(category) LIKE ${contains(criteria.category)}`);
  }
  if (criteria.level) conditions.push(`level = ${bind(criteria.level)}`);
  if (criteria.minimumSalary !== undefined) {
    conditions.push(`salary_min >= ${bind(criteria.minimumSalary)}`);
  }
  if (criteria.skills.length > 0) {
    conditions.push(`skills_folded @> ${bind(criteria.skills)}::text[]`);
  }

  return { where: conditions.join(' AND '), params };
}

/** Câu truy vấn trang kết quả; `total` lấy cùng lúc bằng window function. */
export function buildJobSearchQuery(
  criteria: JobSearchCriteria,
  now: Date,
): BuiltQuery {
  const { where, params } = whereClause(criteria, now);
  // Thứ tự là danh sách cố định, không bao giờ nội suy dữ liệu người dùng vào ORDER BY.
  const orderBy =
    criteria.sort === JobSortOrder.SalaryDescending
      ? 'salary_max DESC, id ASC'
      : 'posted_at DESC, id ASC';
  const limit = `$${params.push(criteria.pageSize)}`;
  const offset = `$${params.push((criteria.page - 1) * criteria.pageSize)}`;

  return {
    text: `SELECT ${SUMMARY_COLUMNS}, count(*) OVER() AS total
             FROM jobs WHERE ${where}
            ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
    params,
  };
}

export function buildJobCountQuery(
  criteria: JobSearchCriteria,
  now: Date,
): BuiltQuery {
  const { where, params } = whereClause(criteria, now);
  return { text: `SELECT count(*) AS total FROM jobs WHERE ${where}`, params };
}
