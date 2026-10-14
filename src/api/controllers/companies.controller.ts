import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompanyService } from '../../application/companies/company.service';
import { ApiProblems } from '../dto/api-responses';
import { CompanyProfileResponseDto } from '../dto/companies.dto';

@ApiTags('Công ty')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companyService: CompanyService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Hồ sơ công khai của công ty',
    description:
      'Danh sách tin của công ty lấy bằng GET /jobs?companyId=. Công ty bị khóa trả 404.',
  })
  @ApiOkResponse({ type: CompanyProfileResponseDto })
  @ApiProblems(HttpStatus.NOT_FOUND)
  getById(
    @Param(
      'id',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    id: number,
  ) {
    return this.companyService.getPublicProfile(id);
  }
}
