import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TransformOptionalNumber } from '../../../common/transforms/optional-number.transform';
import {
  DocumentRequirementDto,
  FieldRequirementDto,
  parseJsonDtoArray,
} from './create-product-request.dto';

export class UpdateProductRequestDto {
  @ApiPropertyOptional({ example: 'Widget Pro' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'WP-001' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 19.99 })
  @IsOptional()
  @TransformOptionalNumber()
  @IsNumber({ maxDecimalPlaces: 2 })
  price?: number;

  @ApiPropertyOptional({
    type: [DocumentRequirementDto],
    description:
      'Prefills only (ask matrix comes from the product template). When provided with fieldRequirements while PENDING, syncs document prefill uploads into answer tables.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    parseJsonDtoArray(DocumentRequirementDto, { value }),
  )
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentRequirementDto)
  documentRequirements?: DocumentRequirementDto[];

  @ApiPropertyOptional({
    type: [FieldRequirementDto],
    description:
      'Prefills only (ask matrix comes from the product template). When provided with documentRequirements while PENDING, syncs field prefills into answer tables.',
  })
  @IsOptional()
  @Transform(({ value }) => parseJsonDtoArray(FieldRequirementDto, { value }))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldRequirementDto)
  fieldRequirements?: FieldRequirementDto[];

  @ApiPropertyOptional({
    description:
      'JSON array of existing document answer IDs to remove when updating prefills',
    example: '["uuid-1","uuid-2"]',
  })
  @IsOptional()
  @IsString()
  removedDocumentAnswerIds?: string;
}
