import { Injectable } from "@nestjs/common";

// @TODO: Implement file upload to object storage
@Injectable()
export class ObjectStorageService {
  constructor() { }

  async uploadFile(file: Express.Multer.File) {
    const { buffer, originalname } = file;
    const fileName = `${originalname}-${Date.now()}`;
    return fileName;
  }
}