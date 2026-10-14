import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobDetailService } from '../../application/jobs/job-detail.service';
import { JobSearchService } from '../../application/jobs/job-search.service';
import { ApiProblems } from '../dto/api-responses';
import {
  JobCategoryResponseDto,
  JobDetailResponseDto,
  PagedJobsResponseDto,
  SearchJobsQueryDto,
} from '../dto/jobs.dto';

@ApiTags('Việc làm')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly searchService: JobSearchService,
    private readonly detailService: JobDetailService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Tìm kiếm tin đang tuyển',
    description:
      'Chỉ trả tin ở trạng thái Published và chưa hết hạn; hỗ trợ lọc, sắp xếp và phân trang.',
  })
  @ApiOkResponse({ type: PagedJobsResponseDto })
  @ApiProblems(HttpStatus.BAD_REQUEST)
  search(@Query() query: SearchJobsQueryDto) {
    return this.searchService.search(query);
  }

  @Get('categories')
  @ApiOperation({
    summary: 'Các lĩnh vực đang tuyển kèm số tin',
    description: 'Nhiều tin nhất trước; dùng cho bộ lọc và trang chủ.',
  })
  @ApiOkResponse({ type: [JobCategoryResponseDto] })
  categories() {
    return this.searchService.categories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem đầy đủ nội dung một tin tuyển dụng' })
  @ApiOkResponse({ type: JobDetailResponseDto })
  @ApiProblems(HttpStatus.NOT_FOUND)
  getById(
    @Param(
      'id',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    id: number,
  ) {
    return this.detailService.getById(id);
  }
}
