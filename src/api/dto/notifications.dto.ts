import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationType } from '../../application/abstractions/notifications';

export class NotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page?: number = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unreadOnly?: boolean = false;
}

export class NotificationResponseDto {
  id!: number;
  type!: NotificationType;
  title!: string;
  body!: string;
  link!: string | null;
  createdAt!: Date;
  read!: boolean;
}

export class NotificationPageResponseDto {
  items!: NotificationResponseDto[];
  page!: number;
  pageSize!: number;
  totalItems!: number;
  totalPages!: number;
}

export class UnreadCountResponseDto {
  count!: number;
}
