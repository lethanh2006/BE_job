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
import { ApplyDto, ChangeApplicationStatusDto } from '../dto/dto';

@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @Roles(AccountRole.Candidate)
  apply(@CurrentUser() user: AuthPrincipal, @Body() body: ApplyDto) {
    return this.applicationService.apply(user.id, body.jobId);
  }

  @Patch(':id/status')
  @Roles(AccountRole.Employer)
  @HttpCode(HttpStatus.OK)
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
