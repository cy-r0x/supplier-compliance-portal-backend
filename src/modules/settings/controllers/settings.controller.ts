import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../infrastructure/auth/decorators/auth.decorator';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { UpdateSettingsDto } from '../dto/update-settings.dto';
import { SettingsService } from '../services/settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user settings' })
  getMine(@CurrentUser() currentUser: JwtPayload) {
    return this.settingsService.getMine(currentUser);
  }

  @Patch()
  @ApiOperation({ summary: 'Update current user settings' })
  updateMine(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateMine(currentUser, dto);
  }
}
