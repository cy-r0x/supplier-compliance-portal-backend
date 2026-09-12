import { Module } from '@nestjs/common';
import { OrgAccessModule } from '../../infrastructure/org-access/org-access.module';
import { OrganizationsController } from './controllers/organizations.controller';
import { OrganizationsService } from './services/organizations.service';

@Module({
  imports: [OrgAccessModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
