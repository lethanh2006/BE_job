/** Lỗi theo chuẩn ProblemDetails (application/problem+json). */
export class ProblemDetailsDto {
  /** Mã trạng thái HTTP. */
  status!: number;
  /** Tiêu đề ngắn của loại lỗi. */
  title!: string;
  /** Mô tả chi tiết, an toàn để hiển thị cho người dùng. */
  detail!: string;
  /** Đường dẫn của request gây lỗi. */
  instance!: string;
}

export class HealthResponseDto {
  status!: string;
}
