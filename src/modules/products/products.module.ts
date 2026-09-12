import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { OrgAccessModule } from '../../infrastructure/org-access/org-access.module';
import { TemplatesModule } from '../templates/templates.module';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';

@Module({
  imports: [ObjectStorageModule, OrgAccessModule, TemplatesModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
