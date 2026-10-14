import { Clock } from '../clock';
import { ArgumentError, InvalidJobStateException } from '../exceptions';
import { Company } from './company';
import { JobLevel, JobStatus, WorkMode } from './enums';
import { SalaryRange } from './salary-range';
import { Skill, SkillSet } from './skill';

export const MAX_SKILLS_PER_JOB = 15;

export interface JobProps {
  id: number;
  title: string;
  companyId: number;
  salary: SalaryRange;
  deadline: Date;
  clock: Clock;
  company?: Company | null;
  location?: string;
  level?: JobLevel;
  workMode?: WorkMode;
  category?: string;
  summary?: string;
  description?: Iterable<string> | null;
  requirements?: Iterable<string> | null;
  benefits?: Iterable<string> | null;
  postedAt?: Date | null;
  featured?: boolean;
}

function normalizeItems(items?: Iterable<string> | null): string[] {
  return [...(items ?? [])]
    .filter((item) => item.trim() !== '')
    .map((item) => item.trim());
}

/** Phần nội dung của tin mà nhà tuyển dụng được phép chỉnh sửa. */
export interface JobContent {
  title: string;
  salary: SalaryRange;
  deadline: Date;
  location: string;
  level: JobLevel;
  workMode: WorkMode;
  category: string;
  summary: string;
  description: readonly string[];
  requirements: readonly string[];
  benefits: readonly string[];
}

function normalizeContent(
  input: Omit<JobContent, 'description' | 'requirements' | 'benefits'> & {
    description?: Iterable<string> | null;
    requirements?: Iterable<string> | null;
    benefits?: Iterable<string> | null;
  },
): JobContent {
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    throw new ArgumentError('Tiêu đề công việc không được để trống.');
  }

  return {
    title: input.title.trim(),
    salary: input.salary,
    deadline: input.deadline,
    location: (input.location ?? '').trim(),
    level: input.level,
    workMode: input.workMode,
    category: (input.category ?? '').trim(),
    summary: (input.summary ?? '').trim(),
    description: normalizeItems(input.description),
    requirements: normalizeItems(input.requirements),
    benefits: normalizeItems(input.benefits),
  };
}

export class Job {
  readonly id: number;
  readonly companyId: number;
  private currentCompany: Company | null;
  readonly postedAt: Date;
  readonly featured: boolean;
  private content: JobContent;
  private currentStatus: JobStatus;
  private readonly skillSet = new SkillSet();
  private readonly clock: Clock;
  private readonly publishedListeners: ((job: Job) => void)[] = [];

  private constructor(
    props: JobProps,
    status: JobStatus,
    validateFutureDeadline: boolean,
  ) {
    if (!(props.companyId > 0)) {
      throw new ArgumentError('CompanyId phải lớn hơn 0.');
    }
    if (props.company && props.company.id !== props.companyId) {
      throw new ArgumentError(
        'Công ty không khớp với CompanyId của tin tuyển dụng.',
      );
    }
    if (
      validateFutureDeadline &&
      props.deadline.getTime() <= props.clock.utcNow.getTime()
    ) {
      throw new ArgumentError('Hạn nộp hồ sơ phải ở tương lai.');
    }

    this.id = props.id;
    this.companyId = props.companyId;
    this.currentCompany = props.company ?? null;
    this.content = normalizeContent({
      ...props,
      location: props.location ?? '',
      category: props.category ?? '',
      summary: props.summary ?? '',
      level: props.level ?? JobLevel.Middle,
      workMode: props.workMode ?? WorkMode.Onsite,
    });
    this.postedAt = props.postedAt ?? props.clock.utcNow;
    this.featured = props.featured ?? false;
    this.currentStatus = status;
    this.clock = props.clock;
  }

  /** Tạo tin mới ở trạng thái Draft; hạn nộp phải ở tương lai. */
  static create(props: JobProps): Job {
    return new Job(props, JobStatus.Draft, true);
  }

  /** Khôi phục từ nơi lưu trữ: giữ nguyên trạng thái, không kiểm tra hạn nộp. */
  static restore(props: JobProps & { status: JobStatus }): Job {
    return new Job(props, props.status, false);
  }

  /** Bản chụp thông tin công ty đi kèm tin (để hiển thị và tìm kiếm). */
  get company(): Company | null {
    return this.currentCompany;
  }

  /** Cập nhật bản chụp công ty khi công ty đổi hồ sơ. */
  refreshCompany(company: Company): void {
    if (company.id !== this.companyId) {
      throw new ArgumentError(
        'Công ty không khớp với CompanyId của tin tuyển dụng.',
      );
    }
    this.currentCompany = company;
  }

  get title(): string {
    return this.content.title;
  }

  get salary(): SalaryRange {
    return this.content.salary;
  }

  get deadline(): Date {
    return this.content.deadline;
  }

  get location(): string {
    return this.content.location;
  }

  get level(): JobLevel {
    return this.content.level;
  }

  get workMode(): WorkMode {
    return this.content.workMode;
  }

  get category(): string {
    return this.content.category;
  }

  get summary(): string {
    return this.content.summary;
  }

  get description(): readonly string[] {
    return this.content.description;
  }

  get requirements(): readonly string[] {
    return this.content.requirements;
  }

  get benefits(): readonly string[] {
    return this.content.benefits;
  }

  get status(): JobStatus {
    return this.currentStatus;
  }

  get skills(): readonly Skill[] {
    return this.skillSet.values();
  }

  get isExpired(): boolean {
    return this.deadline.getTime() <= this.clock.utcNow.getTime();
  }

  /**
   * Thay toàn bộ nội dung và kỹ năng. Không sửa được tin đã đóng; hạn nộp chỉ được
   * kiểm tra "ở tương lai" khi người dùng đổi nó (để vẫn sửa được nội dung tin đã quá hạn).
   */
  update(
    content: Omit<JobContent, 'description' | 'requirements' | 'benefits'> & {
      description?: Iterable<string> | null;
      requirements?: Iterable<string> | null;
      benefits?: Iterable<string> | null;
    },
    skills: Iterable<Skill>,
  ): void {
    if (this.currentStatus === JobStatus.Closed) {
      throw new InvalidJobStateException(
        'Tin tuyển dụng đã đóng không thể chỉnh sửa.',
      );
    }

    const next = normalizeContent(content);
    const deadlineChanged =
      next.deadline.getTime() !== this.content.deadline.getTime();
    if (
      deadlineChanged &&
      next.deadline.getTime() <= this.clock.utcNow.getTime()
    ) {
      throw new ArgumentError('Hạn nộp hồ sơ phải ở tương lai.');
    }

    const nextSkills = new SkillSet(skills);
    if (nextSkills.size > MAX_SKILLS_PER_JOB) {
      throw new ArgumentError(
        `Một tin tuyển dụng không được có quá ${MAX_SKILLS_PER_JOB} kỹ năng.`,
      );
    }

    this.content = next;
    this.skillSet.clear();
    nextSkills.values().forEach((skill) => this.skillSet.add(skill));
  }

  /** Đăng ký lắng nghe sự kiện tin được đăng (tương đương event Job.Published). */
  onPublished(listener: (job: Job) => void): void {
    this.publishedListeners.push(listener);
  }

  publish(): void {
    if (this.currentStatus !== JobStatus.Draft) {
      throw new InvalidJobStateException(
        'Chỉ tin tuyển dụng ở trạng thái Draft mới được đăng.',
      );
    }
    this.currentStatus = JobStatus.Published;
    this.publishedListeners.forEach((listener) => listener(this));
  }

  close(): void {
    if (this.currentStatus !== JobStatus.Published) {
      throw new InvalidJobStateException(
        'Chỉ tin tuyển dụng ở trạng thái Published mới được đóng.',
      );
    }
    this.currentStatus = JobStatus.Closed;
  }

  addSkill(skill: Skill): boolean {
    if (this.skillSet.has(skill)) return false;
    if (this.skillSet.size >= MAX_SKILLS_PER_JOB) {
      throw new ArgumentError(
        `Một tin tuyển dụng không được có quá ${MAX_SKILLS_PER_JOB} kỹ năng.`,
      );
    }
    return this.skillSet.add(skill);
  }
}
