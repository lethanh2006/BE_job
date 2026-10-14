import { Injectable } from '@nestjs/common';
import { JobRepository } from '../abstractions/persistence';
import { ResourceNotFoundException } from '../exceptions';
import { JobDetailDto } from './dto';
import { companyNameOf, sortedSkillNames } from './job-mapping';

@Injectable()
export class JobDetailService {
  constructor(private readonly jobs: JobRepository) {}

  async getById(id: number): Promise<JobDetailDto> {
    const job = await this.jobs.getById(id);
    // Bản nháp, tin bị gỡ và tin của công ty bị khóa không công khai: coi như không tồn tại.
    if (!job || !job.isPubliclyVisible) {
      throw new ResourceNotFoundException(
        `Không tìm thấy tin tuyển dụng có mã ${id}.`,
      );
    }

    return {
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
      summary: job.summary,
      description: job.description,
      requirements: job.requirements,
      benefits: job.benefits,
      postedAt: job.postedAt,
      deadline: job.deadline,
      featured: job.featured,
      skills: sortedSkillNames(job),
      status: job.status,
      expired: job.isExpired,
    };
  }
}
