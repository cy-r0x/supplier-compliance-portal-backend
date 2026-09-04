import { Module } from "@nestjs/common";
import { ObjectStorageService } from "./services/object-storage.service";

@Module({
  imports: [],
  controllers: [],
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule { }