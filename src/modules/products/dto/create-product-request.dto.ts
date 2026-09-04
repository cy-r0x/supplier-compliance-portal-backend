import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentType,
  DocumentVisibility,
  FieldType,
  RequirementLevel,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

function parseJsonArray({ value }: { value: unknown }) {
  if (value == null || value === '') {
    return [];
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

export class FieldPrefillDto {
  @ApiProperty({ example: 'Keep away from children under 3.' })
  @IsString()
  @MinLength(1)
  value!: string;
}

export class DocumentRequirementDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.TEST_REPORT })
  @IsEnum(DocumentType)
  type!: DocumentType;

  @ApiPropertyOptional({
    example: '',
    description: 'Required when type is OTHER; empty string for built-ins',
  })
  @IsOptional()
  @IsString()
  customKey?: string;

  @ApiPropertyOptional({
    example: 'Custom lab report',
    description: 'Required when type is OTHER',
  })
  @ValidateIf((o: DocumentRequirementDto) => o.type === DocumentType.OTHER)
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiProperty({ enum: RequirementLevel, example: RequirementLevel.REQUIRED })
  @IsEnum(RequirementLevel)
  level!: RequirementLevel;

  @ApiProperty({
    enum: DocumentVisibility,
    example: DocumentVisibility.PRIVATE,
  })
  @IsEnum(DocumentVisibility)
  visibility!: DocumentVisibility;
}

export class FieldRequirementDto {
  @ApiProperty({ enum: FieldType, example: FieldType.SAFETY_NOTICE_TEXT })
  @IsEnum(FieldType)
  fieldType!: FieldType;

  @ApiPropertyOptional({
    example: '',
    description: 'Required when fieldType is OTHER; empty string for built-ins',
  })
  @IsOptional()
  @IsString()
  customKey?: string;

  @ApiPropertyOptional({
    example: 'Custom note',
    description: 'Required when fieldType is OTHER',
  })
  @ValidateIf((o: FieldRequirementDto) => o.fieldType === FieldType.OTHER)
  @IsString()
  @MinLength(1)
  label?: string;

  @ApiProperty({ enum: RequirementLevel, example: RequirementLevel.REQUIRED })
  @IsEnum(RequirementLevel)
  level!: RequirementLevel;

  @ApiProperty({
    enum: DocumentVisibility,
    example: DocumentVisibility.PUBLIC,
  })
  @IsEnum(DocumentVisibility)
  visibility!: DocumentVisibility;

  @ApiPropertyOptional({ type: FieldPrefillDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldPrefillDto)
  prefill?: FieldPrefillDto;
}

export class CreateProductRequestDto {
  @ApiProperty({ example: 'Widget Pro' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'WP-001' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 19.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  price?: number;

  @ApiProperty({
    example: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    description: 'User id with role SUPPLIER',
  })
  @IsUUID()
  supplierId!: string;

  @ApiProperty({
    type: [DocumentRequirementDto],
    description:
      'Ask matrix for documents. When using multipart, send as a JSON string. Prefill files separately as docPrefill__{TYPE} or docPrefill__OTHER__{customKey}.',
  })
  @Transform(parseJsonArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentRequirementDto)
  documentRequirements!: DocumentRequirementDto[];

  @ApiProperty({
    type: [FieldRequirementDto],
    description:
      'Ask matrix for fields. When using multipart, send as a JSON string.',
  })
  @Transform(parseJsonArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldRequirementDto)
  fieldRequirements!: FieldRequirementDto[];

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Optional product photo (field name: photo)',
  })
  @IsOptional()
  photo?: Express.Multer.File;
}
