import { Injectable } from '@nestjs/common';

// @TODO: Replace stub with real object-storage upload
@Injectable()
export class ObjectStorageService {
  constructor() {}

  /**
   * Uploads a file and returns its public URL.
   */
  async uploadFile(file: Express.Multer.File): Promise<string> {
    const key = `${Date.now()}-${file.originalname}`;
    void file.buffer;
    return `https://storage.local/${encodeURIComponent(key)}`;
  }
}
