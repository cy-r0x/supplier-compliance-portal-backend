import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectProductDto {
  @ApiProperty({ example: 'Missing required test report documentation' })
  @IsString()
  @MinLength(1)
  rejectionReason!: string;
}
