import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SubmitProductDto {
  @ApiPropertyOptional({
    description: 'JSON array of { requirementId, value } for text fields',
    example: '[{"requirementId":"uuid","value":"<p>text</p>"}]',
  })
  @IsOptional()
  @IsString()
  fieldValues?: string;

  @ApiPropertyOptional({
    description:
      'JSON array of existing document answer IDs to delete before adding new uploads',
    example: '["uuid-1","uuid-2"]',
  })
  @IsOptional()
  @IsString()
  removedDocumentAnswerIds?: string;
}
