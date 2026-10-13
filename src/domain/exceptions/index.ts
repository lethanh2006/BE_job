/** Lỗi tham số/dữ liệu đầu vào không hợp lệ (tương đương ArgumentException → HTTP 400). */
export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgumentError';
  }
}

export abstract class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AlreadyAppliedException extends DomainException {}
export class InvalidJobStateException extends DomainException {}
export class JobClosedException extends DomainException {}
export class JobManagementForbiddenException extends DomainException {}
