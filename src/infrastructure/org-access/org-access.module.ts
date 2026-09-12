import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrgAccessService } from './org-access.service';

@Module({
  imports: [PrismaModule],
  providers: [OrgAccessService],
  exports: [OrgAccessService],
})
export class OrgAccessModule {}
