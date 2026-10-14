export class ResourceNotFoundException extends Error {}
export class InvalidCredentialsException extends Error {}
export class InvalidRefreshTokenException extends Error {}
export class CurrentPasswordIncorrectException extends Error {}
export class EmailAlreadyExistsException extends Error {}
export class CompanyNameAlreadyExistsException extends Error {}
export class AccountDisabledException extends Error {}
export class InvalidPasswordResetTokenException extends Error {}

/** Vượt giới hạn tần suất; `retryAfterSeconds` cho client biết bao lâu nữa thử lại được. */
export class TooManyRequestsException extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}
