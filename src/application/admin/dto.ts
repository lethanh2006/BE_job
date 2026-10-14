import { CompanyStatus, JobStatus } from '../../domain';

export interface AdminActor {
  id: number;
  name: string;
}

export interface JobModerationResult {
  id: number;
  status: JobStatus;
  removalReason: string | null;
}

export interface CompanyModerationResult {
  id: number;
  status: CompanyStatus;
  suspensionReason: string | null;
}

export interface UserModerationResult {
  id: number;
  disabled: boolean;
}
