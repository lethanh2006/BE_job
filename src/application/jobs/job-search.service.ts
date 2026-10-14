import { Injectable } from '@nestjs/common';
import { ArgumentError } from '../../domain';
import { JobCategoryCount, JobSearchReader } from '../abstractions/persistence';
import { PagedResult } from '../common/paged-result';
import { foldText, stripControlCharacters } from '../common/text-folding';
import { JobSortOrder, JobSummaryDto, SearchJobsQuery } from './dto';

@Injectable()
export class JobSearchService {
  constructor(private readonly reader: JobSearchReader) {}

  categories(): Promise<JobCategoryCount[]> {
    return this.reader.categories();
  }

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

    const skills = [
      ...new Set(
        (query.skills ?? [])
          .map((skill) => foldText(stripControlCharacters(skill).trim()))
          .filter((skill) => skill !== ''),
      ),
    ];
    const { items, total } = await this.reader.search({
      keyword: normalizeText(query.keyword),
      location: normalizeText(query.location),
      category: normalizeText(query.category),
      level: query.level ?? undefined,
      minimumSalary: query.minimumSalary ?? undefined,
      featured: query.featured ?? undefined,
      companyId: query.companyId ?? undefined,
      skills,
      sort: query.sort ?? JobSortOrder.Newest,
      page,
      pageSize,
    });

    return new PagedResult(items, page, pageSize, total);
  }
}

const normalizeText = (value?: string | null): string | undefined =>
  stripControlCharacters(value ?? '').trim() || undefined;
