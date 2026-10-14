import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApplicationService } from '../../application/applications/application.service';
import { AccountRole } from '../../application/auth';
import {
  AuthPrincipal,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  toEmployer,
} from '../auth/auth';
import { ApiProblems } from '../dto/api-responses';
import {
  ApplicationResponseDto,
  ApplyDto,
  ChangeApplicationStatusDto,
} from '../dto/applications.dto';

@ApiTags('Đơn ứng tuyển')
@ApiBearerAuth()
@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @Roles(AccountRole.Candidate)
  @ApiOperation({
    summary: 'Ứng viên nộp đơn ứng tuyển',
    description:
      'Danh tính ứng viên lấy từ access token; mã đơn do server cấp.',
  })
  @ApiCreatedResponse({ type: ApplicationResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  apply(@CurrentUser() user: AuthPrincipal, @Body() body: ApplyDto) {
    return this.applicationService.apply(user.id, body.jobId);
  }

  @Patch(':id/status')
  @Roles(AccountRole.Employer)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nhà tuyển dụng đổi trạng thái đơn',
    description: 'Chỉ công ty sở hữu tin tuyển dụng mới được đổi.',
  })
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  changeStatus(
    @CurrentUser() user: AuthPrincipal,
    @Param(
      'id',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    id: number,
    @Body() body: ChangeApplicationStatusDto,
  ) {
    return this.applicationService.changeStatus(
      id,
      body.status,
      toEmployer(user, user.companyId!),
    );
  }
}
