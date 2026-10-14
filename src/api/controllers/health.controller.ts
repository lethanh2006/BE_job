import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReadinessProbe } from '../../application/abstractions/health';
import { ApiProblems } from '../dto/api-responses';
import { HealthResponseDto } from '../dto/common.dto';

@ApiTags('Hệ thống')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly readiness: ReadinessProbe) {}

  @Get()
  @ApiOperation({
    summary: 'Kiểm tra tiến trình còn sống (liveness)',
    description:
      'Không chạm vào cơ sở dữ liệu nên luôn trả nhanh khi tiến trình còn chạy.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    return { status: 'healthy' };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Kiểm tra sẵn sàng phục vụ (readiness)',
    description:
      'Trả 503 khi chưa kết nối được cơ sở dữ liệu, để orchestrator ngừng chuyển request tới instance này.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiProblems(503)
  async ready(): Promise<HealthResponseDto> {
    try {
      await this.readiness.check();
    } catch (error) {
      this.logger.warn(
        `Chưa sẵn sàng: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException();
    }
    return { status: 'ready' };
  }
}
