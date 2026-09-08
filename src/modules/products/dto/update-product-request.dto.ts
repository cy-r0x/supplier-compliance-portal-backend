import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

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
  @IsNumber({ maxDecimalPlaces: 2 })
  price?: number;
}
