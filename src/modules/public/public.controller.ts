import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/infrastructure/auth/decorators/auth.decorator';
import { PublicService } from './public.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':publicSlug')
  @Public()
  @ApiOperation({
    summary: 'Get approved public product page data by public slug or product id',
  })
  getData(@Param('publicSlug') publicSlugOrId: string) {
    return this.publicService.getPublicData(publicSlugOrId);
  }
}
