import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateRequirementTemplateDto } from './create-requirement-template.dto';

export enum RelatedProductsAction {
  NOTIFY_AND_RESET = 'NOTIFY_AND_RESET',
  KEEP_AS_IS = 'KEEP_AS_IS',
}

export class UpdateRequirementTemplateDto extends CreateRequirementTemplateDto {
  @ApiPropertyOptional({
    enum: RelatedProductsAction,
    description:
      'Required when the template has related non-rejected products. NOTIFY_AND_RESET moves SUBMITTED/APPROVED products back to PENDING and notifies suppliers; KEEP_AS_IS only updates the template.',
  })
  @IsOptional()
  @IsEnum(RelatedProductsAction)
  relatedProductsAction?: RelatedProductsAction;
}
