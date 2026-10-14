import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ArgumentError, Clock } from '../../domain';
import {
  CandidateFile,
  CandidateFileRepository,
  FileStorage,
} from '../abstractions/files';
import {
  JobApplicationRepository,
  JobRepository,
} from '../abstractions/persistence';
import { ResourceNotFoundException } from '../exceptions';
import { CvInfoDto, toCvInfo } from './cv-info';

export const CV_MAX_BYTES = 5 * 1024 * 1024;

export interface CvDownload {
  fileName: string;
  contentType: string;
  content: Buffer;
}

interface DetectedType {
  contentType: string;
  extension: string;
}

const PDF: DetectedType = { contentType: 'application/pdf', extension: 'pdf' };
const DOC: DetectedType = {
  contentType: 'application/msword',
  extension: 'doc',
};
const DOCX: DetectedType = {
  contentType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extension: 'docx',
};

/**
 * Nhận diện loại tệp theo nội dung (chữ ký đầu tệp), không tin đuôi tệp hay Content-Type do
 * client gửi. Chỉ chấp nhận PDF, DOC và DOCX.
 */
export function detectCvType(content: Buffer): DetectedType | null {
  if (content.subarray(0, 5).toString('latin1') === '%PDF-') return PDF;
  if (
    content.length >= 8 &&
    content.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))
  ) {
    return DOC;
  }
  // DOCX là tệp ZIP chứa thư mục `word/`; ZIP khác (jar, apk...) bị từ chối.
  if (
    content.length >= 4 &&
    content.subarray(0, 4).equals(Buffer.from('504b0304', 'hex')) &&
    content.includes('word/')
  ) {
    return DOCX;
  }

  return null;
}

/** Tên hiển thị an toàn: bỏ đường dẫn, ký tự điều khiển/đặc biệt, giới hạn độ dài, đuôi theo nội dung thật. */
export function toSafeFileName(original: string, extension: string): string {
  const base = (original ?? '')
    .normalize('NFC')
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]*$/, '')
    // eslint-disable-next-line no-control-regex -- cố ý loại ký tự điều khiển
    .replace(/[\u0000-\u001f\u007f"<>:*?|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();

  return `${base || 'CV'}.${extension}`;
}

@Injectable()
export class CandidateCvService {
  constructor(
    private readonly files: CandidateFileRepository,
    private readonly storage: FileStorage,
    private readonly applications: JobApplicationRepository,
    private readonly jobs: JobRepository,
    private readonly clock: Clock,
  ) {}

  /** Tải CV mới, thay thế CV hiện tại. Đơn đã nộp vẫn giữ bản CV tại thời điểm nộp. */
  async upload(
    candidateId: number,
    upload: { originalName: string; content: Buffer } | undefined,
  ): Promise<CvInfoDto> {
    if (!upload || upload.content.length === 0) {
      throw new ArgumentError('Vui lòng chọn tệp CV.');
    }
    if (upload.content.length > CV_MAX_BYTES) {
      throw new ArgumentError('CV không được lớn hơn 5 MB.');
    }
    const type = detectCvType(upload.content);
    if (!type) {
      throw new ArgumentError('CV phải là tệp PDF, DOC hoặc DOCX hợp lệ.');
    }

    const previous = await this.files.getCurrent(candidateId);
    const file: CandidateFile = {
      id: randomUUID(),
      candidateId,
      fileName: toSafeFileName(upload.originalName, type.extension),
      contentType: type.contentType,
      sizeBytes: upload.content.length,
      storageKey: randomUUID(),
      uploadedAt: this.clock.utcNow,
    };

    await this.storage.put(file.storageKey, upload.content);
    try {
      await this.files.addAsCurrent(file);
    } catch (error) {
      await this.storage.delete(file.storageKey);
      throw error;
    }
    if (previous) await this.discardIfUnused(previous);

    return toCvInfo(file);
  }

  async getInfo(candidateId: number): Promise<CvInfoDto | null> {
    const file = await this.files.getCurrent(candidateId);
    return file ? toCvInfo(file) : null;
  }

  async download(candidateId: number): Promise<CvDownload> {
    const file = await this.files.getCurrent(candidateId);
    if (!file) throw noCv();

    return this.read(file);
  }

  /** Xóa CV hiện tại; tệp chỉ bị xóa hẳn khi không còn đơn ứng tuyển nào đã nộp kèm nó. */
  async remove(candidateId: number): Promise<void> {
    const file = await this.files.getCurrent(candidateId);
    if (!file) return;

    await this.files.clearCurrent(candidateId);
    await this.discardIfUnused(file);
  }

  /** Id tệp CV hiện tại, để gắn vào đơn ứng tuyển lúc nộp. */
  async currentFileId(candidateId: number): Promise<string | null> {
    return (await this.files.getCurrent(candidateId))?.id ?? null;
  }

  /** CV đính kèm đơn ứng tuyển; chỉ công ty sở hữu tin mới tải được. */
  async downloadForApplication(
    companyId: number,
    applicationId: number,
  ): Promise<CvDownload> {
    const application = await this.applications.getById(applicationId);
    const job = application ? await this.jobs.getById(application.jobId) : null;
    // Trả 404 thay vì 403 để không lộ sự tồn tại của đơn thuộc công ty khác.
    if (!application || !job || job.companyId !== companyId) {
      throw new ResourceNotFoundException(
        `Không tìm thấy đơn ứng tuyển có mã ${applicationId}.`,
      );
    }
    const file = application.cvFileId
      ? await this.files.getById(application.cvFileId)
      : null;
    if (!file) throw noCv();

    return this.read(file);
  }

  private async read(file: CandidateFile): Promise<CvDownload> {
    const content = await this.storage.get(file.storageKey);
    if (!content) throw noCv();

    return {
      fileName: file.fileName,
      contentType: file.contentType,
      content,
    };
  }

  private async discardIfUnused(file: CandidateFile): Promise<void> {
    if (await this.files.isReferencedByApplication(file.id)) return;

    await this.files.delete(file.id);
    await this.storage.delete(file.storageKey);
  }
}

const noCv = () => new ResourceNotFoundException('Không tìm thấy CV.');
