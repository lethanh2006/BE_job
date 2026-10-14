import { ArgumentError } from '../exceptions';

export enum CompanyStatus {
  Active = 'Active',
  /** Bị quản trị viên tạm khóa: không đăng tin được. */
  Suspended = 'Suspended',
}

export const COMPANY_NAME_MAX = 200;
export const COMPANY_LOCATION_MAX = 200;
export const COMPANY_WEBSITE_MAX = 300;
export const COMPANY_DESCRIPTION_MAX = 4000;

export interface CompanyProfile {
  name: string;
  location?: string | null;
  website?: string | null;
  description?: string | null;
}

interface NormalizedProfile {
  name: string;
  location?: string;
  website?: string;
  description?: string;
}

function optional(
  value: string | null | undefined,
  label: string,
  max: number,
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > max) {
    throw new ArgumentError(`${label} không được dài quá ${max} ký tự.`);
  }

  return text;
}

function normalize(profile: CompanyProfile): NormalizedProfile {
  if (typeof profile.name !== 'string' || profile.name.trim() === '') {
    throw new ArgumentError('Tên công ty không được để trống.');
  }
  const name = profile.name.trim();
  if (name.length > COMPANY_NAME_MAX) {
    throw new ArgumentError(
      `Tên công ty không được dài quá ${COMPANY_NAME_MAX} ký tự.`,
    );
  }

  const website = optional(profile.website, 'Website', COMPANY_WEBSITE_MAX);
  if (website !== undefined && !isHttpUrl(website)) {
    throw new ArgumentError('Website phải là địa chỉ http:// hoặc https://.');
  }

  return {
    name,
    location: optional(profile.location, 'Địa điểm', COMPANY_LOCATION_MAX),
    website,
    description: optional(
      profile.description,
      'Giới thiệu công ty',
      COMPANY_DESCRIPTION_MAX,
    ),
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class Company {
  private profile: NormalizedProfile;
  private currentStatus: CompanyStatus;

  constructor(
    readonly id: number,
    name: string,
    location?: string | null,
    extra: {
      website?: string | null;
      description?: string | null;
      status?: CompanyStatus;
    } = {},
  ) {
    this.profile = normalize({ name, location, ...extra });
    this.currentStatus = extra.status ?? CompanyStatus.Active;
  }

  get name(): string {
    return this.profile.name;
  }

  get location(): string | undefined {
    return this.profile.location;
  }

  get website(): string | undefined {
    return this.profile.website;
  }

  get description(): string | undefined {
    return this.profile.description;
  }

  get status(): CompanyStatus {
    return this.currentStatus;
  }

  /** Thay toàn bộ hồ sơ công ty (tên, địa điểm, website, giới thiệu). */
  updateProfile(profile: CompanyProfile): void {
    this.profile = normalize(profile);
  }
}
