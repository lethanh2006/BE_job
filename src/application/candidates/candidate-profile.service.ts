import { Injectable } from '@nestjs/common';
import { ArgumentError, Candidate, SalaryRange, Skill } from '../../domain';
import { CandidateFileRepository } from '../abstractions/files';
import { CandidateRepository } from '../abstractions/persistence';
import { ResourceNotFoundException } from '../exceptions';
import { CvInfoDto, toCvInfo } from './cv-info';

export interface CandidateProfileDto {
  id: number;
  name: string;
  email: string;
  bio: string | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  skills: string[];
}

/** Hồ sơ nhìn từ chính ứng viên: có thêm CV hiện tại (nhà tuyển dụng chỉ thấy CV đính kèm đơn). */
export interface OwnCandidateProfileDto extends CandidateProfileDto {
  cv: CvInfoDto | null;
}

export interface UpdateCandidateProfileCommand {
  email: string;
  bio?: string | null;
  desiredSalaryMin?: number | null;
  desiredSalaryMax?: number | null;
  skills: readonly string[];
}

@Injectable()
export class CandidateProfileService {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly files: CandidateFileRepository,
  ) {}

  async getById(id: number): Promise<OwnCandidateProfileDto> {
    return this.toOwnProfile(await this.getCandidate(id));
  }

  async update(
    id: number,
    command: UpdateCandidateProfileCommand,
  ): Promise<OwnCandidateProfileDto> {
    const candidate = await this.getCandidate(id);
    const salary = createSalaryRange(
      command.desiredSalaryMin,
      command.desiredSalaryMax,
    );
    const skills = command.skills.map((skill) => new Skill(skill));

    candidate.updateProfile(command.email, command.bio, salary, skills);
    await this.candidates.update(candidate);

    return this.toOwnProfile(candidate);
  }

  private async toOwnProfile(
    candidate: Candidate,
  ): Promise<OwnCandidateProfileDto> {
    const cv = await this.files.getCurrent(candidate.id);
    return {
      ...toCandidateProfileDto(candidate),
      cv: cv ? toCvInfo(cv) : null,
    };
  }

  private async getCandidate(id: number): Promise<Candidate> {
    const candidate = await this.candidates.getById(id);
    if (!candidate) {
      throw new ResourceNotFoundException(
        `Không tìm thấy ứng viên có mã ${id}.`,
      );
    }
    return candidate;
  }
}

function createSalaryRange(
  min?: number | null,
  max?: number | null,
): SalaryRange | null {
  if (min == null && max == null) return null;
  if (min == null || max == null) {
    throw new ArgumentError(
      'Khoảng lương mong muốn phải có đủ mức tối thiểu và tối đa.',
    );
  }
  return new SalaryRange(min, max);
}

export const toCandidateProfileDto = (
  candidate: Candidate,
): CandidateProfileDto => ({
  id: candidate.id,
  name: candidate.name,
  email: candidate.email,
  bio: candidate.bio,
  desiredSalaryMin: candidate.desiredSalary?.min ?? null,
  desiredSalaryMax: candidate.desiredSalary?.max ?? null,
  skills: candidate.skills
    .map((skill) => skill.name)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
});
