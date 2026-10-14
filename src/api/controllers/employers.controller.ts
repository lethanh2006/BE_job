import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApplicationQueryService } from '../../application/applications/application-query.service';
import { AccountRole } from '../../application/auth';
import { JobManagementService } from '../../application/jobs/job-management.service';
import {
  AuthPrincipal,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  assertCompanyScope,
  toEmployer,
} from '../auth/auth';
import { ApiProblems } from '../dto/api-responses';
import {
  ApplicantDetailResponseDto,
  EmployerApplicationResponseDto,
} from '../dto/applications.dto';
import {
  CreateJobDto,
  EmployerJobDetailResponseDto,
  EmployerJobResponseDto,
} from '../dto/jobs.dto';

const notFoundOnNaN = () =>
  new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('Nhà tuyển dụng')
@ApiBearerAuth()
@Controller('employers/:companyId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.Employer)
export class EmployersController {
  constructor(
    private readonly jobManagementService: JobManagementService,
    private readonly applicationQueryService: ApplicationQueryService,
  ) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Danh sách tin của công ty (mọi trạng thái)' })
  @ApiOkResponse({ type: [EmployerJobResponseDto] })
  @ApiProblems(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  getJobs(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.jobManagementService.getByCompanyId(companyId);
  }

  @Post('jobs')
  @ApiOperation({ summary: 'Tạo tin tuyển dụng ở trạng thái nháp' })
  @ApiCreatedResponse({ type: EmployerJobResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  createJob(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
    @Body() body: CreateJobDto,
  ) {
    assertCompanyScope(user, companyId);
    if (!user.companyName) {
      throw new BadRequestException('Token thiếu thông tin tên công ty.');
    }

    return this.jobManagementService.createDraft({
      ...body,
      companyId,
      companyName: user.companyName,
    });
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Xem toàn bộ nội dung một tin (kể cả bản nháp)' })
  @ApiOkResponse({ type: EmployerJobDetailResponseDto })
  @ApiProblems(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  getJob(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
    @Param('jobId', notFoundOnNaN()) jobId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.jobManagementService.getDetail(
      jobId,
      toEmployer(user, companyId),
    );
  }

  @Put('jobs/:jobId')
  @ApiOperation({
    summary: 'Thay thế toàn bộ nội dung một tin',
    description:
      'Áp dụng cho tin nháp hoặc đang đăng; tin đã đóng không sửa được. Hạn nộp chỉ bị kiểm tra "ở tương lai" khi được thay đổi.',
  })
  @ApiOkResponse({ type: EmployerJobDetailResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  updateJob(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
    @Param('jobId', notFoundOnNaN()) jobId: number,
    @Body() body: CreateJobDto,
  ) {
    assertCompanyScope(user, companyId);
    return this.jobManagementService.update(
      jobId,
      toEmployer(user, companyId),
      body,
    );
  }

  @Post('jobs/:jobId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng tin (Draft → Published)' })
  @ApiOkResponse({ type: EmployerJobResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  publishJob(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
    @Param('jobId', notFoundOnNaN()) jobId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.jobManagementService.publish(
      jobId,
      toEmployer(user, companyId),
    );
  }

  @Post('jobs/:jobId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đóng tin (Published → Closed)' })
  @ApiOkResponse({ type: EmployerJobResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  closeJob(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
    @Param('jobId', notFoundOnNaN()) jobId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.jobManagementService.close(jobId, toEmployer(user, companyId));
  }

  @Get('applications')
  @ApiOperation({ summary: 'Đơn ứng tuyển vào các tin của công ty' })
  @ApiOkResponse({ type: [EmployerApplicationResponseDto] })
  @ApiProblems(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  getApplications(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.applicationQueryService.getByCompanyId(companyId);
  }

  @Get('applications/:applicationId')
  @ApiOperation({
    summary: 'Xem hồ sơ ứng viên của một đơn',
    description:
      'Kèm độ phù hợp và danh sách kỹ năng khớp/thiếu so với tin. Đơn của công ty khác trả 404.',
  })
  @ApiOkResponse({ type: ApplicantDetailResponseDto })
  @ApiProblems(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  getApplicant(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
    @Param('applicationId', notFoundOnNaN()) applicationId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.applicationQueryService.getApplicant(companyId, applicationId);
  }
}
