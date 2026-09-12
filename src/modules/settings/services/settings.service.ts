import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { OrgAccessService } from '../../../infrastructure/org-access/org-access.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { UpdateSettingsDto } from '../dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  async getMine(currentUser: JwtPayload) {
    const membership = await this.orgAccess.requireManager(currentUser);
    const settings = await this.ensureSettings(membership.organizationId);

    return {
      message: 'Settings retrieved successfully',
      data: {
        autoApproveProductRequests: settings.autoApproveProductRequests,
      },
    };
  }

  async updateMine(currentUser: JwtPayload, dto: UpdateSettingsDto) {
    const membership = await this.orgAccess.requireManager(currentUser);

    const settings = await this.prisma.organizationSettings.upsert({
      where: { organizationId: membership.organizationId },
      update: {
        ...(dto.autoApproveProductRequests !== undefined
          ? { autoApproveProductRequests: dto.autoApproveProductRequests }
          : {}),
      },
      create: {
        organizationId: membership.organizationId,
        autoApproveProductRequests: dto.autoApproveProductRequests ?? false,
      },
      select: {
        autoApproveProductRequests: true,
      },
    });

    return {
      message: 'Settings updated successfully',
      data: {
        autoApproveProductRequests: settings.autoApproveProductRequests,
      },
    };
  }

  private async ensureSettings(organizationId: string) {
    return this.prisma.organizationSettings.upsert({
      where: { organizationId },
      update: {},
      create: {
        organizationId,
        autoApproveProductRequests: false,
      },
    });
  }
}
