import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ProblemDetailsDto } from './common.dto';

/** Khai báo các mã lỗi ProblemDetails mà một endpoint có thể trả về. */
export const ApiProblems = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, type: ProblemDetailsDto }),
    ),
  );
