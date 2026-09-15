import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentAiProvider } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description:
      'Organization manager only. When true, supplier submissions are auto-approved.',
  })
  @IsOptional()
  @IsBoolean()
  autoApproveProductRequests?: boolean;

  @ApiPropertyOptional({ enum: DocumentAiProvider })
  @IsOptional()
  @IsEnum(DocumentAiProvider)
  documentAiProvider?: DocumentAiProvider;

  @ApiPropertyOptional({
    description:
      'Allowlisted model id for the selected provider. Set null when provider is NONE.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(128)
  documentAiModel?: string | null;

  @ApiPropertyOptional({
    description:
      'Gemini API key. Omit to keep; empty string or null to clear; new value to replace.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(512)
  geminiApiKey?: string | null;

  @ApiPropertyOptional({
    description:
      'OpenAI API key. Omit to keep; empty string or null to clear; new value to replace.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(512)
  openaiApiKey?: string | null;
}
