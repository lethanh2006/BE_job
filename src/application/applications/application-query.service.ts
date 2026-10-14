import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  Candidate,
  Job,
  JobApplication,
} from '../../domain';
import {
  CandidateRepository,
  JobApplicationRepository,
  JobRepository,
} from '../abstractions/persistence';
import {
  CandidateProfileDto,
  toCandidateProfileDto,
} from '../candidates/candidate-profile.service';
import { ResourceNotFoundException } from '../exceptions';
import { companyNameOf } from '../jobs/job-mapping';
import { JobMatchService } from '../matching/job-match.service';

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

/** Đơn ứng tuyển nhìn từ phía nhà tuyển dụng, kèm độ phù hợp của ứng viên (0–100). */
export interface EmployerApplicationDto extends ApplicationDto {
  matchScore: number;
}

export interface ApplicantDetailDto {
  application: EmployerApplicationDto;
  candidate: CandidateProfileDto;
  matchedSkills: string[];
  missingSkills: string[];
  salaryFit: boolean;
}

const unique = (ids: number[]) => [...new Set(ids)];

@Injectable()
export class ApplicationQueryService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly applications: JobApplicationRepository,
    private readonly candidates: CandidateRepository,
    private readonly matching: JobMatchService,
  ) {}

  async getByCandidateId(candidateId: number): Promise<ApplicationDto[]> {
    const mine = await this.applications.getByCandidateId(candidateId);
    const jobs = await this.jobsById(mine.map((a) => a.jobId));
    const candidate = await this.candidates.getById(candidateId);

    return mine
      .filter((application) => jobs.has(application.jobId))
      .map((application) =>
        toApplicationDto(application, jobs.get(application.jobId)!, candidate),
      )
      .sort(byNewest);
  }

  async getByCompanyId(companyId: number): Promise<EmployerApplicationDto[]> {
    const companyJobs = new Map(
      (await this.jobs.getByCompanyId(companyId)).map((job) => [job.id, job]),
    );
    const applications = await this.applications.getByJobIds([
      ...companyJobs.keys(),
    ]);
    const candidates = new Map(
      (
        await this.candidates.getByIds(
          unique(applications.map((a) => a.candidateId)),
        )
      ).map((candidate) => [candidate.id, candidate]),
    );

    return applications
      .map((application) =>
        toEmployerApplicationDto(
          application,
          companyJobs.get(application.jobId)!,
          candidates.get(application.candidateId) ?? null,
          this.matching,
        ),
      )
      .sort(byNewest);
  }

  /** Hồ sơ ứng viên của một đơn; chỉ công ty sở hữu tin mới xem được. */
  async getApplicant(
    companyId: number,
    applicationId: number,
  ): Promise<ApplicantDetailDto> {
    const notFound = new ResourceNotFoundException(
      `Không tìm thấy đơn ứng tuyển có mã ${applicationId}.`,
    );
    const application = await this.applications.getById(applicationId);
    if (!application) throw notFound;

    const job = await this.jobs.getById(application.jobId);
    // Trả 404 thay vì 403 để không lộ sự tồn tại của đơn thuộc công ty khác.
    if (!job || job.companyId !== companyId) throw notFound;

    const candidate = await this.candidates.getById(application.candidateId);
    if (!candidate) throw notFound;

    const match = this.matching.breakdown(job, candidate);
    return {
      application: {
        ...toApplicationDto(application, job, candidate),
        matchScore: match.score,
      },
      candidate: toCandidateProfileDto(candidate),
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
      salaryFit: match.salaryFit,
    };
  }

  private async jobsById(ids: number[]): Promise<Map<number, Job>> {
    return new Map(
      (await this.jobs.getByIds(unique(ids))).map((job) => [job.id, job]),
    );
  }
}

const byNewest = (a: ApplicationDto, b: ApplicationDto) =>
  b.appliedAt.getTime() - a.appliedAt.getTime() || b.id - a.id;

function toApplicationDto(
  application: JobApplication,
  job: Job,
  candidate: Candidate | null,
): ApplicationDto {
  return {
    id: application.id,
    jobId: job.id,
    candidateId: application.candidateId,
    candidateName: candidate?.name ?? `Ứng viên #${application.candidateId}`,
    jobTitle: job.title,
    company: companyNameOf(job),
    location: job.location,
    status: application.status,
    appliedAt: application.appliedAt,
  };
}

function toEmployerApplicationDto(
  application: JobApplication,
  job: Job,
  candidate: Candidate | null,
  matching: JobMatchService,
): EmployerApplicationDto {
  return {
    ...toApplicationDto(application, job, candidate),
    matchScore: candidate ? matching.score(job, candidate) : 0,
  };
}
