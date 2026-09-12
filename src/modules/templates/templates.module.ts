import { Module } from '@nestjs/common';
import { OrgAccessModule } from '../../infrastructure/org-access/org-access.module';
import { TemplatesController } from './controllers/templates.controller';
import { TemplatesService } from './services/templates.service';

@Module({
  imports: [OrgAccessModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
