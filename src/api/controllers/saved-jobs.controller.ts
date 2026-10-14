import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
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
import { SavedJobService } from '../../application/candidates/saved-job.service';
import { AccountRole } from '../../application/auth';
import {
  AuthPrincipal,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../auth/auth';
import { ApiProblems } from '../dto/api-responses';
import {
  SavedJobParamsDto,
  SavedJobIdsQueryDto,
  SavedJobsPageResponseDto,
  SavedJobsQueryDto,
} from '../dto/saved-jobs.dto';

@ApiTags('Việc làm đã lưu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.Candidate)
@Controller('saved-jobs')
export class SavedJobsController {
  constructor(private readonly saved: SavedJobService) {}

  @Get()
  @ApiOperation({ summary: 'Việc làm đã lưu của chính mình, mới nhất trước' })
  @ApiOkResponse({ type: SavedJobsPageResponseDto })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  list(@CurrentUser() user: AuthPrincipal, @Query() query: SavedJobsQueryDto) {
    return this.saved.list(user.id, query.page, query.pageSize);
  }

  @Get('ids')
  @ApiOperation({ summary: 'Kiểm tra hàng loạt tin nào đã được mình lưu' })
  @ApiOkResponse({ type: Number, isArray: true })
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  ids(@CurrentUser() user: AuthPrincipal, @Query() query: SavedJobIdsQueryDto) {
    return this.saved.savedIds(user.id, query.jobIds);
  }

  @Put(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Lưu tin đang tuyển; gọi lặp không tạo bản sao',
    description:
      'Tin đã đóng hoặc hết hạn không lưu mới được (400); bản nháp, tin bị gỡ và tin của công ty bị khóa coi như không tồn tại (404).',
  })
  @ApiNoContentResponse()
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  save(@CurrentUser() user: AuthPrincipal, @Param() params: SavedJobParamsDto) {
    return this.saved.save(user.id, params.jobId);
  }

  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Bỏ lưu tin của chính mình, kể cả tin không còn công khai',
  })
  @ApiNoContentResponse()
  @ApiProblems(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  remove(
    @CurrentUser() user: AuthPrincipal,
    @Param() params: SavedJobParamsDto,
  ) {
    return this.saved.remove(user.id, params.jobId);
  }
}
