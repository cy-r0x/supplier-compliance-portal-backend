import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Base list query. Extend in modules for extra filters.
 *
 * `sort` format: `field:asc` | `field:desc` (default `createdAt:desc`).
 */
export class QueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'createdAt:desc',
    default: 'createdAt:desc',
    description: 'Sort as field:direction, e.g. createdAt:desc',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*:(asc|desc)$/, {
    message: 'sort must be in the form field:asc or field:desc',
  })
  sort?: string = 'createdAt:desc';
}
