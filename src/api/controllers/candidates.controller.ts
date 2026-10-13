import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApplicationQueryService } from '../../application/applications/application-query.service';
import { AccountRole } from '../../application/auth';
import { CandidateProfileService } from '../../application/candidates/candidate-profile.service';
import {
  AuthPrincipal,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../auth/auth';
import { UpdateCandidateProfileDto } from '../dto/dto';

const CandidateId = () =>
  Param(
    'candidateId',
    new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
  );

/** Ứng viên chỉ được truy cập dữ liệu của chính mình. */
function assertSelf(user: AuthPrincipal, candidateId: number): void {
  if (candidateId !== user.id) throw new ForbiddenException();
}

@Controller('candidates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.Candidate)
export class CandidatesController {
  constructor(
    private readonly applicationQueryService: ApplicationQueryService,
    private readonly candidateProfileService: CandidateProfileService,
  ) {}

  @Get(':candidateId/profile')
  getProfile(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
  ) {
    assertSelf(user, candidateId);
    return this.candidateProfileService.getById(candidateId);
  }

  @Put(':candidateId/profile')
  updateProfile(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
    @Body() body: UpdateCandidateProfileDto,
  ) {
    assertSelf(user, candidateId);
    return this.candidateProfileService.update(candidateId, body);
  }

  @Get(':candidateId/applications')
  getApplications(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
  ) {
    assertSelf(user, candidateId);
    return this.applicationQueryService.getByCandidateId(candidateId);
  }
}
