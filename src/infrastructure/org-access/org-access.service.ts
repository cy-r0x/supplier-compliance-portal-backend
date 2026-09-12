import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationMemberRole, Role } from '@prisma/client';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';

export type OrgMembership = {
  organizationId: string;
  organizationName: string;
  role: OrganizationMemberRole;
  memberId: string;
};

@Injectable()
export class OrgAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getMembership(userId: string): Promise<OrgMembership | null> {
    const row = await this.prisma.organizationMember.findUnique({
      where: { userId },
      select: {
        id: true,
        role: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
    });

    if (!row) return null;

    return {
      memberId: row.id,
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      role: row.role,
    };
  }

  async requireMembership(currentUser: JwtPayload): Promise<OrgMembership> {
    if (currentUser.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'SUPER_ADMIN must act via admin organization endpoints',
      );
    }

    if (currentUser.role !== Role.USER) {
      throw new ForbiddenException('Only organization users can access this');
    }

    const membership = await this.getMembership(currentUser.sub);
    if (!membership) {
      throw new ForbiddenException('You do not belong to any organization');
    }
    return membership;
  }

  async requireManager(currentUser: JwtPayload): Promise<OrgMembership> {
    if (currentUser.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'SUPER_ADMIN must act via admin organization endpoints',
      );
    }

    const membership = await this.requireMembership(currentUser);
    if (membership.role !== OrganizationMemberRole.MANAGER) {
      throw new ForbiddenException(
        'Only organization managers can perform this action',
      );
    }
    return membership;
  }

  /**
   * Resolve organization scope for product/template reads.
   * SUPER_ADMIN: null (all). USER with membership: their org. Else forbidden.
   */
  async resolveOrgScopeForRead(
    currentUser: JwtPayload,
  ): Promise<{ organizationId: string } | 'ALL' | 'NONE'> {
    if (currentUser.role === Role.SUPER_ADMIN) {
      return 'ALL';
    }
    if (currentUser.role === Role.SUPPLIER) {
      return 'NONE';
    }
    if (currentUser.role === Role.USER) {
      const membership = await this.getMembership(currentUser.sub);
      if (!membership) return 'NONE';
      return { organizationId: membership.organizationId };
    }
    return 'NONE';
  }

  async assertCanAccessOrganization(
    currentUser: JwtPayload,
    organizationId: string,
    opts: { requireManager?: boolean } = {},
  ): Promise<OrgMembership | null> {
    if (currentUser.role === Role.SUPER_ADMIN) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true },
      });
      if (!org) {
        throw new NotFoundException('Organization not found');
      }
      return null;
    }

    const membership = await this.requireMembership(currentUser);
    if (membership.organizationId !== organizationId) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }
    if (
      opts.requireManager &&
      membership.role !== OrganizationMemberRole.MANAGER
    ) {
      throw new ForbiddenException(
        'Only organization managers can perform this action',
      );
    }
    return membership;
  }

  async assertCanAccessProductOrg(
    currentUser: JwtPayload,
    organizationId: string,
    opts: { requireManager?: boolean } = {},
  ): Promise<void> {
    if (currentUser.role === Role.SUPER_ADMIN) return;
    if (currentUser.role === Role.SUPPLIER) {
      // Supplier access checked separately via supplierId
      return;
    }
    await this.assertCanAccessOrganization(currentUser, organizationId, opts);
  }
}
