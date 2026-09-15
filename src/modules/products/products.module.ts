import { Module } from '@nestjs/common';
import { DocumentAiModule } from '../../infrastructure/document-ai/document-ai.module';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { OrgAccessModule } from '../../infrastructure/org-access/org-access.module';
import { TemplatesModule } from '../templates/templates.module';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';

@Module({
  imports: [
    ObjectStorageModule,
    OrgAccessModule,
    TemplatesModule,
    DocumentAiModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
