import { ArgumentError } from '../exceptions';
import { Company } from './company';
import type { Job } from './job';
import { SalaryRange } from './salary-range';
import { Skill, SkillSet } from './skill';

export const MAX_CANDIDATE_SKILLS = 30;

export abstract class User {
  readonly name: string;
  private currentEmail: string;

  protected constructor(
    readonly id: number,
    name: string,
    email: string,
  ) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ArgumentError('Tên người dùng không được để trống.');
    }
    this.name = name.trim();
    this.currentEmail = User.normalizeEmail(email);
  }

  get email(): string {
    return this.currentEmail;
  }

  changeEmail(email: string): void {
    this.currentEmail = User.normalizeEmail(email);
  }

  abstract canManage(job: Job): boolean;

  getDisplayName(): string {
    return this.name;
  }

  private static normalizeEmail(email: string): string {
    if (typeof email !== 'string' || email.trim() === '') {
      throw new ArgumentError('Email người dùng không được để trống.');
    }
    const normalized = email.trim();
    if (!normalized.includes('@')) {
      throw new ArgumentError('Email người dùng phải chứa ký tự @.');
    }
    return normalized;
  }
}

export class AdminUser extends User {
  constructor(id: number, name: string, email: string) {
    super(id, name, email);
  }

  canManage(): boolean {
    return true;
  }
}

export class Employer extends User {
  constructor(
    id: number,
    name: string,
    email: string,
    readonly company: Company,
  ) {
    super(id, name, email);
  }

  get companyId(): number {
    return this.company.id;
  }

  canManage(job: Job): boolean {
    return job.companyId === this.companyId;
  }

  override getDisplayName(): string {
    return `${this.name} (${this.company.name})`;
  }
}

export class Candidate extends User {
  bio: string | null;
  desiredSalary: SalaryRange | null;
  private readonly skillSet = new SkillSet();

  constructor(
    id: number,
    name: string,
    email: string,
    bio: string | null = null,
    desiredSalary: SalaryRange | null = null,
  ) {
    super(id, name, email);
    this.bio = bio?.trim() ?? null;
    this.desiredSalary = desiredSalary;
  }

  get skills(): readonly Skill[] {
    return this.skillSet.values();
  }

  addSkill(skill: Skill): boolean {
    if (this.skillSet.has(skill)) return false;
    if (this.skillSet.size >= MAX_CANDIDATE_SKILLS) {
      throw new ArgumentError(
        `Ứng viên không được có quá ${MAX_CANDIDATE_SKILLS} kỹ năng.`,
      );
    }
    return this.skillSet.add(skill);
  }

  updateProfile(
    email: string,
    bio: string | null | undefined,
    desiredSalary: SalaryRange | null,
    skills: Iterable<Skill>,
  ): void {
    const normalizedSkills = new SkillSet(skills);
    if (normalizedSkills.size > MAX_CANDIDATE_SKILLS) {
      throw new ArgumentError(
        `Ứng viên không được có quá ${MAX_CANDIDATE_SKILLS} kỹ năng.`,
      );
    }

    this.changeEmail(email);
    this.bio = bio?.trim() ?? null;
    this.desiredSalary = desiredSalary;
    this.skillSet.clear();
    normalizedSkills.values().forEach((skill) => this.skillSet.add(skill));
  }

  canManage(): boolean {
    return false;
  }
}
