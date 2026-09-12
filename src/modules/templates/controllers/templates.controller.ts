import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  Roles,
} from '../../../infrastructure/auth/decorators/auth.decorator';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { CreateRequirementTemplateDto } from '../dto/create-requirement-template.dto';
import { UpdateRequirementTemplateDto } from '../dto/update-requirement-template.dto';
import { TemplatesService } from '../services/templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@Roles(Role.DISTRIBUTOR)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List requirement templates for the current distributor' })
  list(@CurrentUser() currentUser: JwtPayload) {
    return this.templatesService.list(currentUser);
  }

  @Get(':id/impact')
  @ApiOperation({
    summary:
      'List non-rejected product requests linked to this template (for edit confirmation)',
  })
  getImpact(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.templatesService.getImpact(id, currentUser);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a requirement template by id' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.templatesService.findOne(id, currentUser);
  }

  @Post()
  @ApiOperation({ summary: 'Create a requirement template' })
  create(
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: CreateRequirementTemplateDto,
  ) {
    return this.templatesService.create(dto, currentUser);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a requirement template. When products use it, relatedProductsAction is required.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
    @Body() dto: UpdateRequirementTemplateDto,
  ) {
    return this.templatesService.update(id, dto, currentUser);
  }
}
