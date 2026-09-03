import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../infrastructure/auth/decorators/auth.decorator';

@ApiTags('health')
@Controller()
export class HealthController {
  @Public()
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
