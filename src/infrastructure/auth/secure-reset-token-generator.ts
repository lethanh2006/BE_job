import { createHash, randomBytes } from 'node:crypto';
import { ResetTokenGenerator } from '../../application/abstractions/authentication';

const TOKEN_BYTES = 32;

/** Token 256 bit ngẫu nhiên nên chỉ cần SHA-256 (không cần hash chậm như mật khẩu) để lưu trữ. */
export class SecureResetTokenGenerator extends ResetTokenGenerator {
  generate(): { value: string; hash: string } {
    const value = randomBytes(TOKEN_BYTES).toString('base64url');
    return { value, hash: this.hash(value) };
  }

  hash(token: string): string {
    if (!token?.trim()) throw new Error('Token không được để trống.');
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
