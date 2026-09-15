import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentAiProvider, OrganizationMemberRole } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Retail Group' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    type: [String],
    description: 'At least one USER id to assign as MANAGER',
    example: ['uuid-manager-1'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  managerUserIds!: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional USER ids to assign as MEMBER',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberUserIds?: string[];
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Retail Group' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

export class AddOrganizationMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: OrganizationMemberRole })
  @IsEnum(OrganizationMemberRole)
  role!: OrganizationMemberRole;
}

export class UpdateOrganizationMemberDto {
  @ApiProperty({ enum: OrganizationMemberRole })
  @IsEnum(OrganizationMemberRole)
  role!: OrganizationMemberRole;
}

export class UpdateOrganizationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoApproveProductRequests?: boolean;

  @ApiPropertyOptional({ enum: DocumentAiProvider })
  @IsOptional()
  @IsEnum(DocumentAiProvider)
  documentAiProvider?: DocumentAiProvider;

  @ApiPropertyOptional({ nullable: true })
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
