import { ArgumentError } from '../../domain';

export const PASSWORD_MIN_LENGTH = 10;

export function validatePassword(password: string): void {
  if (
    typeof password !== 'string' ||
    password.trim() === '' ||
    password.length < PASSWORD_MIN_LENGTH ||
    !/\p{Lu}/u.test(password) ||
    !/\p{Ll}/u.test(password) ||
    !/\p{Nd}/u.test(password) ||
    !/[^\p{L}\p{Nd}]/u.test(password)
  ) {
    throw new ArgumentError(
      `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.`,
    );
  }
}
