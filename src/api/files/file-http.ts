import { StreamableFile } from '@nestjs/common';

/**
 * Multer đọc tên tệp theo latin1 nên tên tiếng Việt bị lỗi dấu; đọc lại byte gốc theo UTF-8.
 * Nếu kết quả có ký tự thay thế (không phải UTF-8 hợp lệ) thì giữ nguyên tên gốc.
 */
export function decodeUploadedFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

/** Content-Disposition luôn là attachment (không cho trình duyệt tự mở tệp người dùng tải lên). */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function toDownload(file: {
  fileName: string;
  contentType: string;
  content: Buffer;
}): StreamableFile {
  return new StreamableFile(file.content, {
    type: file.contentType,
    disposition: attachmentDisposition(file.fileName),
    length: file.content.length,
  });
}
