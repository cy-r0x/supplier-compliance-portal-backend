import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  Roles,
} from '../../../infrastructure/auth/decorators/auth.decorator';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { UpdateSettingsDto } from '../dto/update-settings.dto';
import { SettingsService } from '../services/settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.USER)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('ai-models')
  @ApiOperation({
    summary: 'List allowlisted document-AI models',
    description:
      'Curated Gemini and OpenAI models available for organization document suggestion settings.',
  })
  listAiModels() {
    return this.settingsService.listAiModels();
  }

  @Get()
  @ApiOperation({ summary: 'Get current organization settings (manager)' })
  getMine(@CurrentUser() currentUser: JwtPayload) {
    return this.settingsService.getMine(currentUser);
  }

  @Patch()
  @ApiOperation({ summary: 'Update current organization settings (manager)' })
  updateMine(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateMine(currentUser, dto);
  }
}
