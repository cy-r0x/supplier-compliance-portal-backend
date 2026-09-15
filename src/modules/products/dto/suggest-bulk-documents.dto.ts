import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SuggestBulkFileDto {
  @ApiProperty({
    description: 'Client-side id to correlate suggestions with selected files',
    example: 'tmp-1',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  clientId!: string;

  @ApiProperty({ example: 'CE_Declaration.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  mimeType!: string;

  @ApiProperty({ example: 240112 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(25 * 1024 * 1024)
  sizeBytes!: number;
}

export class SuggestBulkDocumentsDto {
  @ApiProperty({ type: [SuggestBulkFileDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SuggestBulkFileDto)
  files!: SuggestBulkFileDto[];
}
