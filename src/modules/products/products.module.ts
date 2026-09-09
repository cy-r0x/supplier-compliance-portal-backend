import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';

@Module({
  imports: [ObjectStorageModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
