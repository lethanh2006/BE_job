export enum ApplicationStatus {
  Submitted = 'Submitted',
  Reviewing = 'Reviewing',
  Accepted = 'Accepted',
  Rejected = 'Rejected',
}

export enum JobLevel {
  Internship = 'Internship',
  Junior = 'Junior',
  Middle = 'Middle',
  Senior = 'Senior',
  Lead = 'Lead',
}

export enum JobStatus {
  Draft = 'Draft',
  Published = 'Published',
  Closed = 'Closed',
  /** Bị quản trị viên gỡ vì vi phạm; ẩn khỏi công khai cho tới khi được khôi phục. */
  Removed = 'Removed',
}

export enum WorkMode {
  Onsite = 'Onsite',
  Hybrid = 'Hybrid',
  Remote = 'Remote',
}

export function isEnumValue<T extends Record<string, string>>(
  enumType: T,
  value: unknown,
): value is T[keyof T] {
  return Object.values(enumType).includes(value as string);
}
