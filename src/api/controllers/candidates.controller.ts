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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
import { ApiProblems } from '../dto/api-responses';
import { ApplicationDetailResponseDto } from '../dto/applications.dto';
import {
  CandidateProfileResponseDto,
  UpdateCandidateProfileDto,
} from '../dto/candidates.dto';

const CandidateId = () =>
  Param(
    'candidateId',
    new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
  );

/** Ứng viên chỉ được truy cập dữ liệu của chính mình. */
function assertSelf(user: AuthPrincipal, candidateId: number): void {
  if (candidateId !== user.id) throw new ForbiddenException();
}

@ApiTags('Ứng viên')
@ApiBearerAuth()
@Controller('candidates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.Candidate)
export class CandidatesController {
  constructor(
    private readonly applicationQueryService: ApplicationQueryService,
    private readonly candidateProfileService: CandidateProfileService,
  ) {}

  @Get(':candidateId/profile')
  @ApiOperation({ summary: 'Xem hồ sơ của chính mình' })
  @ApiOkResponse({ type: CandidateProfileResponseDto })
  @ApiProblems(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  getProfile(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
  ) {
    assertSelf(user, candidateId);
    return this.candidateProfileService.getById(candidateId);
  }

  @Put(':candidateId/profile')
  @ApiOperation({
    summary: 'Cập nhật hồ sơ, khoảng lương mong muốn và kỹ năng',
  })
  @ApiOkResponse({ type: CandidateProfileResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  updateProfile(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
    @Body() body: UpdateCandidateProfileDto,
  ) {
    assertSelf(user, candidateId);
    return this.candidateProfileService.update(candidateId, body);
  }

  @Get(':candidateId/applications')
  @ApiOperation({ summary: 'Lịch sử ứng tuyển của chính mình, mới nhất trước' })
  @ApiOkResponse({ type: [ApplicationDetailResponseDto] })
  @ApiProblems(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  getApplications(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
  ) {
    assertSelf(user, candidateId);
    return this.applicationQueryService.getByCandidateId(candidateId);
  }
}
