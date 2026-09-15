import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { PlatformController } from './controllers/platform.controller';
import { PlatformService } from './services/platform.service';

@Module({
  imports: [ObjectStorageModule],
  controllers: [PlatformController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
