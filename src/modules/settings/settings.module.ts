import { Module } from '@nestjs/common';
import { OrgAccessModule } from '../../infrastructure/org-access/org-access.module';
import { SettingsController } from './controllers/settings.controller';
import { SettingsService } from './services/settings.service';

@Module({
  imports: [OrgAccessModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
