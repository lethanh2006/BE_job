import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Job, JobApplication } from '../../domain';
import {
  CandidateRepository,
  JobApplicationRepository,
  JobRepository,
} from '../abstractions/persistence';
import { companyNameOf } from '../jobs/job-mapping';

export interface ApplicationDto {
  id: number;
  jobId: number;
  candidateId: number;
  candidateName: string;
  jobTitle: string;
  company: string;
  location: string;
  status: ApplicationStatus;
  appliedAt: Date;
}

@Injectable()
export class ApplicationQueryService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly applications: JobApplicationRepository,
    private readonly candidates: CandidateRepository,
  ) {}

  async getByCandidateId(candidateId: number): Promise<ApplicationDto[]> {
    const mine = await this.applications.getByCandidateId(candidateId);
    const jobsById = new Map((await this.jobs.getAll()).map((j) => [j.id, j]));

    return this.toDtos(mine, jobsById);
  }

  async getByCompanyId(companyId: number): Promise<ApplicationDto[]> {
    const companyJobs = new Map(
      (await this.jobs.getAll())
        .filter((job) => job.companyId === companyId)
        .map((job) => [job.id, job]),
    );

    return this.toDtos(await this.applications.getAll(), companyJobs);
  }

  private async toDtos(
    applications: JobApplication[],
    jobsById: Map<number, Job>,
  ): Promise<ApplicationDto[]> {
    const relevant = applications.filter((a) => jobsById.has(a.jobId));
    const names = new Map<number, string>();
    for (const candidateId of new Set(relevant.map((a) => a.candidateId))) {
      const candidate = await this.candidates.getById(candidateId);
      names.set(candidateId, candidate?.name ?? `Ứng viên #${candidateId}`);
    }

    return relevant
      .map((application) => {
        const job = jobsById.get(application.jobId)!;
        return {
          id: application.id,
          jobId: job.id,
          candidateId: application.candidateId,
          candidateName: names.get(application.candidateId)!,
          jobTitle: job.title,
          company: companyNameOf(job),
          location: job.location,
          status: application.status,
          appliedAt: application.appliedAt,
        };
      })
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());
  }
}
