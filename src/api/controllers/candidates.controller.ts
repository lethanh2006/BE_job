import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ApplicationQueryService } from '../../application/applications/application-query.service';
import { AccountRole } from '../../application/auth';
import { CandidateMatchService } from '../../application/matching/candidate-match.service';
import {
  CandidateCvService,
  CV_MAX_BYTES,
} from '../../application/candidates/candidate-cv.service';
import { CandidateProfileService } from '../../application/candidates/candidate-profile.service';
import {
  AuthPrincipal,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../auth/auth';
import { ApiProblems } from '../dto/api-responses';
import { decodeUploadedFileName, toDownload } from '../files/file-http';
import { ApplicationDetailResponseDto } from '../dto/applications.dto';
import {
  CvInfoResponseDto,
  OwnCandidateProfileResponseDto,
  JobMatchesQueryDto,
  JobMatchResponseDto,
  RecommendedJobResponseDto,
  RecommendedJobsQueryDto,
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
    private readonly candidateMatchService: CandidateMatchService,
    private readonly cvService: CandidateCvService,
  ) {}

  @Get(':candidateId/profile')
  @ApiOperation({ summary: 'Xem hồ sơ của chính mình' })
  @ApiOkResponse({ type: OwnCandidateProfileResponseDto })
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
  @ApiOkResponse({ type: OwnCandidateProfileResponseDto })
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

  @Get(':candidateId/job-matches')
  @ApiOperation({
    summary: 'Độ phù hợp của hồ sơ với các tin tuyển dụng',
    description:
      'Chấm điểm theo kỹ năng (70%) và mức lương (30%), kèm kỹ năng khớp/thiếu. Mã không tồn tại hoặc là bản nháp bị bỏ qua.',
  })
  @ApiOkResponse({ type: [JobMatchResponseDto] })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  getJobMatches(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
    @Query() query: JobMatchesQueryDto,
  ) {
    assertSelf(user, candidateId);
    return this.candidateMatchService.getMatches(candidateId, query.jobIds);
  }

  @Get(':candidateId/recommended-jobs')
  @ApiOperation({
    summary: 'Việc làm gợi ý',
    description:
      'Chọn trong các tin đang tuyển mới nhất, bỏ tin đã ứng tuyển và tin không khớp chút nào, xếp theo độ phù hợp.',
  })
  @ApiOkResponse({ type: [RecommendedJobResponseDto] })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  getRecommendedJobs(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
    @Query() query: RecommendedJobsQueryDto,
  ) {
    assertSelf(user, candidateId);
    return this.candidateMatchService.recommend(candidateId, query.limit ?? 6);
  }

  @Post(':candidateId/cv')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: CV_MAX_BYTES, files: 1 } }),
  )
  @ApiOperation({
    summary: 'Tải CV lên (thay thế CV hiện tại)',
    description:
      'Chỉ nhận PDF, DOC, DOCX tối đa 5 MB; loại tệp được xác định theo nội dung chứ không theo đuôi tệp. Đơn đã nộp giữ CV tại thời điểm nộp.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: CvInfoResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.PAYLOAD_TOO_LARGE,
  )
  uploadCv(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    assertSelf(user, candidateId);
    return this.cvService.upload(
      candidateId,
      file && {
        originalName: decodeUploadedFileName(file.originalname),
        content: file.buffer,
      },
    );
  }

  @Get(':candidateId/cv')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Tải về CV hiện tại của chính mình' })
  @ApiProduces('application/pdf', 'application/msword')
  @ApiProblems(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async downloadCv(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
  ) {
    assertSelf(user, candidateId);
    return toDownload(await this.cvService.download(candidateId));
  }

  @Delete(':candidateId/cv')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa CV hiện tại',
    description:
      'Đơn đã nộp kèm CV này vẫn giữ bản của chúng; tệp chỉ bị xóa hẳn khi không còn đơn nào tham chiếu.',
  })
  @ApiNoContentResponse()
  @ApiProblems(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async removeCv(
    @CurrentUser() user: AuthPrincipal,
    @CandidateId() candidateId: number,
  ) {
    assertSelf(user, candidateId);
    await this.cvService.remove(candidateId);
  }
}
