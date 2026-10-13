import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AlreadyAppliedException,
  ArgumentError,
  DomainException,
  JobManagementForbiddenException,
} from '../../domain';
import {
  CurrentPasswordIncorrectException,
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
  ResourceNotFoundException,
} from '../../application/exceptions';

interface Problem {
  status: number;
  title: string;
  detail: string;
}

/** Chuẩn hóa mọi lỗi về ProblemDetails (application/problem+json), giống backend C#. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const problem = this.toProblem(exception);

    if (problem.status === Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error(
        `Lỗi không được xử lý khi gọi ${request.method} ${request.path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json({ ...problem, instance: request.path });
  }

  private toProblem(exception: unknown): Problem {
    const message = exception instanceof Error ? exception.message : '';
    const make = (status: number, title: string): Problem => ({
      status,
      title,
      detail: message,
    });

    if (exception instanceof InvalidCredentialsException) {
      return make(HttpStatus.UNAUTHORIZED, 'Đăng nhập thất bại');
    }
    if (exception instanceof InvalidRefreshTokenException) {
      return make(HttpStatus.UNAUTHORIZED, 'Phiên đăng nhập không hợp lệ');
    }
    if (exception instanceof CurrentPasswordIncorrectException) {
      return make(HttpStatus.BAD_REQUEST, 'Không thể đổi mật khẩu');
    }
    if (exception instanceof EmailAlreadyExistsException) {
      return make(HttpStatus.CONFLICT, 'Email đã tồn tại');
    }
    if (exception instanceof ResourceNotFoundException) {
      return make(HttpStatus.NOT_FOUND, 'Không tìm thấy tài nguyên');
    }
    if (exception instanceof JobManagementForbiddenException) {
      return make(HttpStatus.FORBIDDEN, 'Không có quyền thực hiện');
    }
    if (exception instanceof AlreadyAppliedException) {
      return make(HttpStatus.CONFLICT, 'Đơn ứng tuyển đã tồn tại');
    }
    if (exception instanceof DomainException) {
      return make(HttpStatus.BAD_REQUEST, 'Không thể thực hiện nghiệp vụ');
    }
    if (exception instanceof ArgumentError) {
      return make(HttpStatus.BAD_REQUEST, 'Dữ liệu không hợp lệ');
    }
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Đã xảy ra lỗi hệ thống',
      detail: 'Vui lòng thử lại sau.',
    };
  }

  private fromHttpException(exception: HttpException): Problem {
    const status: number = exception.getStatus();
    switch (status) {
      case Number(HttpStatus.UNAUTHORIZED):
        return {
          status,
          title: 'Chưa xác thực',
          detail: 'Vui lòng đăng nhập để tiếp tục.',
        };
      case Number(HttpStatus.FORBIDDEN):
        return {
          status,
          title: 'Không có quyền thực hiện',
          detail: 'Tài khoản không có quyền truy cập tài nguyên này.',
        };
      case Number(HttpStatus.NOT_FOUND):
        return {
          status,
          title: 'Không tìm thấy tài nguyên',
          detail: 'Đường dẫn hoặc tài nguyên không tồn tại.',
        };
      default:
        return {
          status,
          title: 'Yêu cầu không hợp lệ',
          detail: exception.message,
        };
    }
  }
}
