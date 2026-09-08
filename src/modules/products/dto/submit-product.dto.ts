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
}
