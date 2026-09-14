import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SubmitProductDto {
  @ApiPropertyOptional({
    description:
      'JSON array of { requirementId, value, visibility } for text fields. visibility defaults to PRIVATE when omitted.',
    example:
      '[{"requirementId":"uuid","value":"<p>text</p>","visibility":"PUBLIC"}]',
  })
  @IsOptional()
  @IsString()
  fieldValues?: string;

  @ApiPropertyOptional({
    description:
      'JSON array of { requirementId, visibility } aligned with uploaded doc__* files (same order as multer files for this submit). visibility defaults to PRIVATE when omitted.',
    example: '[{"requirementId":"uuid","visibility":"PRIVATE"}]',
  })
  @IsOptional()
  @IsString()
  documentVisibilities?: string;

  @ApiPropertyOptional({
    description:
      'JSON array of { answerId, visibility } to update visibility on existing document answers without re-uploading.',
    example: '[{"answerId":"uuid","visibility":"PUBLIC"}]',
  })
  @IsOptional()
  @IsString()
  documentAnswerVisibilities?: string;

  @ApiPropertyOptional({
    description:
      'JSON array of existing document answer IDs to delete before adding new uploads',
    example: '["uuid-1","uuid-2"]',
  })
  @IsOptional()
  @IsString()
  removedDocumentAnswerIds?: string;
}
