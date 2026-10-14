import { CandidateFile } from '../abstractions/files';

/** Thông tin hiển thị của một CV (không gồm nội dung và khóa lưu trữ). */
export interface CvInfoDto {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export const toCvInfo = (file: CandidateFile): CvInfoDto => ({
  fileName: file.fileName,
  contentType: file.contentType,
  sizeBytes: file.sizeBytes,
  uploadedAt: file.uploadedAt,
});
