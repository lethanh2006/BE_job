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

export class Job {
  readonly id: number;
  readonly title: string;
  readonly companyId: number;
  readonly company: Company | null;
  readonly salary: SalaryRange;
  readonly deadline: Date;
  readonly location: string;
  readonly level: JobLevel;
  readonly workMode: WorkMode;
  readonly category: string;
  readonly summary: string;
  readonly description: readonly string[];
  readonly requirements: readonly string[];
  readonly benefits: readonly string[];
  readonly postedAt: Date;
  readonly featured: boolean;
  private currentStatus: JobStatus;
  private readonly skillSet = new SkillSet();
  private readonly clock: Clock;
  private readonly publishedListeners: ((job: Job) => void)[] = [];

  private constructor(
    props: JobProps,
    status: JobStatus,
    validateFutureDeadline: boolean,
  ) {
    if (typeof props.title !== 'string' || props.title.trim() === '') {
      throw new ArgumentError('Tiêu đề công việc không được để trống.');
    }
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
    this.title = props.title.trim();
    this.companyId = props.companyId;
    this.company = props.company ?? null;
    this.salary = props.salary;
    this.deadline = props.deadline;
    this.location = (props.location ?? '').trim();
    this.level = props.level ?? JobLevel.Middle;
    this.workMode = props.workMode ?? WorkMode.Onsite;
    this.category = (props.category ?? '').trim();
    this.summary = (props.summary ?? '').trim();
    this.description = normalizeItems(props.description);
    this.requirements = normalizeItems(props.requirements);
    this.benefits = normalizeItems(props.benefits);
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

  get status(): JobStatus {
    return this.currentStatus;
  }

  get skills(): readonly Skill[] {
    return this.skillSet.values();
  }

  get isExpired(): boolean {
    return this.deadline.getTime() <= this.clock.utcNow.getTime();
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
