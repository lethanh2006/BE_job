/** Thông tin một tệp CV đã tải lên. Nội dung nằm ở `FileStorage`, khóa tham chiếu là `storageKey`. */
export interface CandidateFile {
  id: string;
  candidateId: number;
  /** Tên hiển thị khi tải về (đã làm sạch, có đuôi đúng với nội dung thật). */
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedAt: Date;
}

/** Nơi lưu nội dung tệp. Khóa do hệ thống sinh (UUID), không bao giờ lấy từ tên tệp của người dùng. */
export abstract class FileStorage {
  abstract put(key: string, content: Buffer): Promise<void>;
  /** Trả null nếu tệp không tồn tại. */
  abstract get(key: string): Promise<Buffer | null>;
  /** Xóa nếu có; không lỗi khi tệp không tồn tại. */
  abstract delete(key: string): Promise<void>;
}

export abstract class CandidateFileRepository {
  /** Lưu tệp mới và đặt làm CV hiện tại của ứng viên (CV hiện tại cũ chuyển thành không còn hiện tại). */
  abstract addAsCurrent(file: CandidateFile): Promise<void>;
  abstract getById(id: string): Promise<CandidateFile | null>;
  abstract getCurrent(candidateId: number): Promise<CandidateFile | null>;
  /** Bỏ đánh dấu CV hiện tại; bản ghi vẫn còn (đơn đã nộp có thể đang tham chiếu). */
  abstract clearCurrent(candidateId: number): Promise<void>;
  /** Tệp có còn được đơn ứng tuyển nào tham chiếu không. */
  abstract isReferencedByApplication(fileId: string): Promise<boolean>;
  abstract delete(id: string): Promise<void>;
}
