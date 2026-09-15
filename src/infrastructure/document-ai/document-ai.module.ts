import { Module } from '@nestjs/common';
import { DocumentAiService } from './document-ai.service';

@Module({
  providers: [DocumentAiService],
  exports: [DocumentAiService],
})
export class DocumentAiModule {}
