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
  UseGuards,
} from '@nestjs/common';
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
import { CreateJobDto } from '../dto/dto';

const notFoundOnNaN = () =>
  new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@Controller('employers/:companyId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.Employer)
export class EmployersController {
  constructor(
    private readonly jobManagementService: JobManagementService,
    private readonly applicationQueryService: ApplicationQueryService,
  ) {}

  @Get('jobs')
  getJobs(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.jobManagementService.getByCompanyId(companyId);
  }

  @Post('jobs')
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

  @Post('jobs/:jobId/publish')
  @HttpCode(HttpStatus.OK)
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
  closeJob(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
    @Param('jobId', notFoundOnNaN()) jobId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.jobManagementService.close(jobId, toEmployer(user, companyId));
  }

  @Get('applications')
  getApplications(
    @CurrentUser() user: AuthPrincipal,
    @Param('companyId', notFoundOnNaN()) companyId: number,
  ) {
    assertCompanyScope(user, companyId);
    return this.applicationQueryService.getByCompanyId(companyId);
  }
}
