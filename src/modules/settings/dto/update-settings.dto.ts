import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description:
      'Organization manager only. When true, supplier submissions are auto-approved.',
  })
  @IsOptional()
  @IsBoolean()
  autoApproveProductRequests?: boolean;
}
