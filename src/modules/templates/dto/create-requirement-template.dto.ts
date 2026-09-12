import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentType,
  DocumentVisibility,
  FieldType,
  RequirementLevel,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class TemplateDocumentItemDto {
  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  type!: DocumentType;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  customKey?: string;

  @ApiPropertyOptional({ example: 'Custom lab report' })
  @ValidateIf((o: TemplateDocumentItemDto) => o.type === DocumentType.OTHER)
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiProperty({ enum: RequirementLevel })
  @IsEnum(RequirementLevel)
  level!: RequirementLevel;

  @ApiProperty({ enum: DocumentVisibility })
  @IsEnum(DocumentVisibility)
  visibility!: DocumentVisibility;
}

export class TemplateFieldItemDto {
  @ApiProperty({ enum: FieldType })
  @IsEnum(FieldType)
  fieldType!: FieldType;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  customKey?: string;

  @ApiPropertyOptional({ example: 'Custom note' })
  @ValidateIf((o: TemplateFieldItemDto) => o.fieldType === FieldType.OTHER)
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiProperty({ enum: RequirementLevel })
  @IsEnum(RequirementLevel)
  level!: RequirementLevel;

  @ApiProperty({ enum: DocumentVisibility })
  @IsEnum(DocumentVisibility)
  visibility!: DocumentVisibility;
}

export class CreateRequirementTemplateDto {
  @ApiProperty({ example: 'Default EU compliance' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ type: [TemplateDocumentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TemplateDocumentItemDto)
  documents!: TemplateDocumentItemDto[];

  @ApiProperty({ type: [TemplateFieldItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldItemDto)
  fields!: TemplateFieldItemDto[];
}
