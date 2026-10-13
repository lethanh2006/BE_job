import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '../../application/abstractions/authentication';

const pbkdf2Async = promisify(pbkdf2);

const ITERATIONS = 210_000;
const SALT_SIZE = 16;
const HASH_SIZE = 32;
const VERSION = 'v1';

/** Định dạng `v1.<iterations>.<salt b64>.<hash b64>` — tương thích hash của backend C#. */
@Injectable()
export class Pbkdf2PasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    if (!password?.trim()) throw new Error('Mật khẩu không được để trống.');

    const salt = randomBytes(SALT_SIZE);
    const hash = await pbkdf2Async(
      password,
      salt,
      ITERATIONS,
      HASH_SIZE,
      'sha256',
    );

    return [
      VERSION,
      ITERATIONS,
      salt.toString('base64'),
      hash.toString('base64'),
    ].join('.');
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    if (!password || !passwordHash) return false;

    const parts = passwordHash.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) return false;
    if (Number(parts[1]) !== ITERATIONS) return false;

    const salt = Buffer.from(parts[2], 'base64');
    const expected = Buffer.from(parts[3], 'base64');
    if (salt.length !== SALT_SIZE || expected.length !== HASH_SIZE)
      return false;

    const actual = await pbkdf2Async(
      password,
      salt,
      ITERATIONS,
      expected.length,
      'sha256',
    );
    return timingSafeEqual(actual, expected);
  }
}
