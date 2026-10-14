import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from '../dto/common.dto';

@ApiTags('Hệ thống')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái dịch vụ' })
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    return { status: 'healthy' };
  }
}
