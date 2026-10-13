import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { JobDetailService } from '../../application/jobs/job-detail.service';
import { JobSearchService } from '../../application/jobs/job-search.service';
import { SearchJobsQueryDto } from '../dto/dto';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly searchService: JobSearchService,
    private readonly detailService: JobDetailService,
  ) {}

  @Get()
  search(@Query() query: SearchJobsQueryDto) {
    return this.searchService.search(query);
  }

  @Get(':id')
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
