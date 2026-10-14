import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationService } from '../../application/notifications/notification.service';
import { AuthPrincipal, CurrentUser, JwtAuthGuard } from '../auth/auth';
import { ApiProblems } from '../dto/api-responses';
import {
  NotificationPageResponseDto,
  NotificationsQueryDto,
  UnreadCountResponseDto,
} from '../dto/notifications.dto';

@ApiTags('Thông báo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Thông báo của chính mình, mới nhất trước' })
  @ApiOkResponse({ type: NotificationPageResponseDto })
  @ApiProblems(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: NotificationsQueryDto,
  ) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Đếm thông báo chưa đọc của chính mình' })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  @ApiProblems(HttpStatus.UNAUTHORIZED)
  async countUnread(@CurrentUser() user: AuthPrincipal) {
    return { count: await this.notifications.countUnread(user.id) };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo của mình đã đọc' })
  @ApiNoContentResponse()
  @ApiProblems(HttpStatus.UNAUTHORIZED)
  markAllRead(@CurrentUser() user: AuthPrincipal) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đánh dấu một thông báo của mình đã đọc' })
  @ApiNoContentResponse()
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.NOT_FOUND,
  )
  markRead(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notifications.markRead(user.id, id);
  }
}
