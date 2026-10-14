import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminModerationService } from '../../application/admin/admin-moderation.service';
import { AdminQueryService } from '../../application/admin/admin-query.service';
import { AccountRole } from '../../application/auth';
import {
  AuthPrincipal,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../auth/auth';
import {
  AdminCompaniesQueryDto,
  AdminJobsQueryDto,
  AdminStatsResponseDto,
  AdminUsersQueryDto,
  AuditLogsQueryDto,
  CompanyModerationResponseDto,
  JobModerationResponseDto,
  ModerationReasonDto,
  PagedAdminCompaniesResponseDto,
  PagedAdminJobsResponseDto,
  PagedAdminUsersResponseDto,
  PagedAuditLogsResponseDto,
  UserModerationResponseDto,
} from '../dto/admin.dto';
import { ApiProblems } from '../dto/api-responses';

const Id = (name: string) =>
  Param(name, new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));

const actorOf = (user: AuthPrincipal) => ({ id: user.id, name: user.name });

@ApiTags('Quản trị')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.Admin)
export class AdminController {
  constructor(
    private readonly queries: AdminQueryService,
    private readonly moderation: AdminModerationService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Thống kê tổng quan toàn hệ thống' })
  @ApiOkResponse({ type: AdminStatsResponseDto })
  @ApiProblems(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  stats() {
    return this.queries.stats();
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Danh sách tin ở mọi trạng thái' })
  @ApiOkResponse({ type: PagedAdminJobsResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  jobs(@Query() query: AdminJobsQueryDto) {
    return this.queries.jobs(query);
  }

  @Post('jobs/:id/takedown')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gỡ tin vi phạm',
    description:
      'Tin chuyển sang Removed và biến mất khỏi công khai; lý do hiển thị cho nhà tuyển dụng.',
  })
  @ApiOkResponse({ type: JobModerationResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  takeDownJob(
    @CurrentUser() user: AuthPrincipal,
    @Id('id') id: number,
    @Body() body: ModerationReasonDto,
  ) {
    return this.moderation.takeDownJob(actorOf(user), id, body.reason);
  }

  @Post('jobs/:id/reinstate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khôi phục tin bị gỡ',
    description: 'Tin quay về bản nháp để nhà tuyển dụng xem lại và đăng lại.',
  })
  @ApiOkResponse({ type: JobModerationResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  reinstateJob(@CurrentUser() user: AuthPrincipal, @Id('id') id: number) {
    return this.moderation.reinstateJob(actorOf(user), id);
  }

  @Get('companies')
  @ApiOperation({ summary: 'Danh sách công ty' })
  @ApiOkResponse({ type: PagedAdminCompaniesResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  companies(@Query() query: AdminCompaniesQueryDto) {
    return this.queries.companies(query);
  }

  @Post('companies/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khóa công ty',
    description:
      'Tin của công ty bị ẩn khỏi tìm kiếm và công ty không đăng được tin mới.',
  })
  @ApiOkResponse({ type: CompanyModerationResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  suspendCompany(
    @CurrentUser() user: AuthPrincipal,
    @Id('id') id: number,
    @Body() body: ModerationReasonDto,
  ) {
    return this.moderation.suspendCompany(actorOf(user), id, body.reason);
  }

  @Post('companies/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mở khóa công ty' })
  @ApiOkResponse({ type: CompanyModerationResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  reactivateCompany(@CurrentUser() user: AuthPrincipal, @Id('id') id: number) {
    return this.moderation.reactivateCompany(actorOf(user), id);
  }

  @Get('users')
  @ApiOperation({ summary: 'Danh sách tài khoản' })
  @ApiOkResponse({ type: PagedAdminUsersResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  users(@Query() query: AdminUsersQueryDto) {
    return this.queries.users(query);
  }

  @Post('users/:id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khóa tài khoản',
    description:
      'Thu hồi mọi phiên đăng nhập; access token đã cấp còn hiệu lực tối đa vài phút. Không khóa được chính mình hoặc quản trị viên khác.',
  })
  @ApiOkResponse({ type: UserModerationResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  disableUser(@CurrentUser() user: AuthPrincipal, @Id('id') id: number) {
    return this.moderation.disableUser(actorOf(user), id);
  }

  @Post('users/:id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mở khóa tài khoản' })
  @ApiOkResponse({ type: UserModerationResponseDto })
  @ApiProblems(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  enableUser(@CurrentUser() user: AuthPrincipal, @Id('id') id: number) {
    return this.moderation.enableUser(actorOf(user), id);
  }

  @Get('audit-logs')
  @ApiOperation({
    summary: 'Nhật ký thao tác của quản trị viên, mới nhất trước',
  })
  @ApiOkResponse({ type: PagedAuditLogsResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  auditLogs(@Query() query: AuditLogsQueryDto) {
    return this.queries.auditLogs(query);
  }
}
