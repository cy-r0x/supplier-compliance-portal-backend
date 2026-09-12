import {
  Body,
  Controller,
  Delete,
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
import {
  AddOrganizationMemberDto,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  UpdateOrganizationMemberDto,
  UpdateOrganizationSettingsDto,
} from '../dto/organization.dto';
import { OrganizationsService } from '../services/organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'List organizations (admin: all, user: own)' })
  list(@CurrentUser() currentUser: JwtPayload) {
    return this.organizationsService.list(currentUser);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get organization detail with members' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.organizationsService.findOne(id, currentUser);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create organization with at least one manager',
  })
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.organizationsService.create(dto, currentUser);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Update organization name' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.organizationsService.update(id, dto, currentUser);
  }

  @Post(':id/members')
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Add manager or member (fails if user already in an org)' })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOrganizationMemberDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.organizationsService.addMember(id, dto, currentUser);
  }

  @Patch(':id/members/:memberId')
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Update member role' })
  updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateOrganizationMemberDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.organizationsService.updateMember(
      id,
      memberId,
      dto,
      currentUser,
    );
  }

  @Delete(':id/members/:memberId')
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Remove member (cannot remove last manager)' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.organizationsService.removeMember(id, memberId, currentUser);
  }

  @Get(':id/settings')
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get organization settings' })
  getSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.organizationsService.getSettings(id, currentUser);
  }

  @Patch(':id/settings')
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Update organization settings (managers)' })
  updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationSettingsDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.organizationsService.updateSettings(id, dto, currentUser);
  }
}
