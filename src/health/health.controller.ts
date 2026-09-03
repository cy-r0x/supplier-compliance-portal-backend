import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check' })
  health() {
    return {
      message: 'Server is running',
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
