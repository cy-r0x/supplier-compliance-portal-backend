import { Module } from '@nestjs/common';
import { OrgAccessModule } from '../../infrastructure/org-access/org-access.module';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';

@Module({
  imports: [ObjectStorageModule, OrgAccessModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
