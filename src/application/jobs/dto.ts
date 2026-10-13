import { JobLevel, JobStatus, WorkMode } from '../../domain';

export interface JobSummaryDto {
  id: number;
  title: string;
  companyId: number;
  company: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  level: JobLevel;
  workMode: WorkMode;
  category: string;
  deadline: Date;
  postedAt: Date;
  featured: boolean;
  skills: string[];
}

export interface JobDetailDto extends Omit<
  JobSummaryDto,
  'deadline' | 'postedAt' | 'featured' | 'skills'
> {
  summary: string;
  description: readonly string[];
  requirements: readonly string[];
  benefits: readonly string[];
  postedAt: Date;
  deadline: Date;
  featured: boolean;
  skills: string[];
}

export interface EmployerJobDto {
  id: number;
  title: string;
  status: JobStatus;
  applications: number;
  deadline: Date;
  postedAt: Date;
}

export interface CreateJobCommand {
  companyId: number;
  companyName: string;
  title: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  deadline: Date;
  level: JobLevel;
  workMode: WorkMode;
  category: string;
  summary: string;
  skills: readonly string[];
}

export enum JobSortOrder {
  Newest = 'Newest',
  SalaryDescending = 'SalaryDescending',
}

export interface SearchJobsQuery {
  keyword?: string | null;
  minimumSalary?: number | null;
  skills?: readonly string[] | null;
  page?: number;
  pageSize?: number;
  location?: string | null;
  category?: string | null;
  level?: JobLevel | null;
  sort?: JobSortOrder;
}
