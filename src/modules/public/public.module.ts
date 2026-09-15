import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [PlatformModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
