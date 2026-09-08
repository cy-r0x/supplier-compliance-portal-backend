import { Module } from '@nestjs/common';
import { SettingsController } from './controllers/settings.controller';
import { SettingsService } from './services/settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
