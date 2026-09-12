import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationMemberRole,
  Role,
} from '@prisma/client';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { OrgAccessService } from '../../../infrastructure/org-access/org-access.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  AddOrganizationMemberDto,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  UpdateOrganizationMemberDto,
  UpdateOrganizationSettingsDto,
} from '../dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  async list(currentUser: JwtPayload) {
    if (currentUser.role === Role.SUPER_ADMIN) {
      const orgs = await this.prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          settings: true,
          _count: { select: { members: true, productRequests: true } },
          members: {
            where: { role: OrganizationMemberRole.MANAGER },
            select: {
              id: true,
              role: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      return {
        message: 'Organizations retrieved successfully',
        data: orgs.map((org) => this.toListItem(org)),
      };
    }

    const membership = await this.orgAccess.requireMembership(currentUser);
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: membership.organizationId },
      include: {
        settings: true,
        _count: { select: { members: true, productRequests: true } },
        members: {
          where: { role: OrganizationMemberRole.MANAGER },
          select: {
            id: true,
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return {
      message: 'Organizations retrieved successfully',
      data: [this.toListItem(org)],
    };
  }

  async findOne(id: string, currentUser: JwtPayload) {
    await this.orgAccess.assertCanAccessOrganization(currentUser, id);

    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        settings: true,
        members: {
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: {
              select: { id: true, name: true, email: true, photo: true },
            },
          },
        },
        _count: { select: { productRequests: true } },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return {
      message: 'Organization retrieved successfully',
      data: {
        id: org.id,
        name: org.name,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
        productRequestCount: org._count.productRequests,
        settings: {
          autoApproveProductRequests:
            org.settings?.autoApproveProductRequests ?? false,
        },
        members: org.members.map((m) => ({
          id: m.id,
          role: m.role,
          createdAt: m.createdAt,
          user: m.user,
        })),
      },
    };
  }

  async create(dto: CreateOrganizationDto, currentUser: JwtPayload) {
    if (currentUser.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can create organizations');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Organization name is required');
    }

    const managerIds = [...new Set(dto.managerUserIds)];
    const memberIds = [...new Set(dto.memberUserIds ?? [])].filter(
      (id) => !managerIds.includes(id),
    );

    await this.assertUsersAreBasicAndAssignable([...managerIds, ...memberIds]);

    const existingName = await this.prisma.organization.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingName) {
      throw new ConflictException('An organization with this name already exists');
    }

    const org = await this.prisma.organization.create({
      data: {
        name,
        settings: { create: {} },
        members: {
          create: [
            ...managerIds.map((userId) => ({
              userId,
              role: OrganizationMemberRole.MANAGER,
            })),
            ...memberIds.map((userId) => ({
              userId,
              role: OrganizationMemberRole.MEMBER,
            })),
          ],
        },
      },
      include: {
        settings: true,
        members: {
          select: {
            id: true,
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: { select: { members: true, productRequests: true } },
      },
    });

    return {
      message: 'Organization created successfully',
      data: this.toListItem(org),
    };
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
    currentUser: JwtPayload,
  ) {
    await this.orgAccess.assertCanAccessOrganization(currentUser, id, {
      requireManager: currentUser.role !== Role.SUPER_ADMIN,
    });

    if (currentUser.role !== Role.SUPER_ADMIN) {
      const membership = await this.orgAccess.requireManager(currentUser);
      if (membership.organizationId !== id) {
        throw new ForbiddenException('You do not have access to this organization');
      }
    }

    const name = dto.name?.trim();
    if (name) {
      const conflict = await this.prisma.organization.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          id: { not: id },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException(
          'An organization with this name already exists',
        );
      }
    }

    const org = await this.prisma.organization.update({
      where: { id },
      data: name ? { name } : {},
      include: {
        settings: true,
        members: {
          where: { role: OrganizationMemberRole.MANAGER },
          select: {
            id: true,
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: { select: { members: true, productRequests: true } },
      },
    });

    return {
      message: 'Organization updated successfully',
      data: this.toListItem(org),
    };
  }

  async addMember(
    organizationId: string,
    dto: AddOrganizationMemberDto,
    currentUser: JwtPayload,
  ) {
    await this.assertCanManageMembers(currentUser, organizationId);
    await this.assertUsersAreBasicAndAssignable([dto.userId]);

    const member = await this.prisma.organizationMember.create({
      data: {
        organizationId,
        userId: dto.userId,
        role: dto.role,
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true, photo: true },
        },
      },
    });

    return {
      message: 'Member added successfully',
      data: member,
    };
  }

  async updateMember(
    organizationId: string,
    memberId: string,
    dto: UpdateOrganizationMemberDto,
    currentUser: JwtPayload,
  ) {
    await this.assertCanManageMembers(currentUser, organizationId);

    const existing = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Membership not found');
    }

    if (
      existing.role === OrganizationMemberRole.MANAGER &&
      dto.role === OrganizationMemberRole.MEMBER
    ) {
      await this.assertNotLastManager(organizationId, memberId);
    }

    const member = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true, photo: true },
        },
      },
    });

    return {
      message: 'Member updated successfully',
      data: member,
    };
  }

  async removeMember(
    organizationId: string,
    memberId: string,
    currentUser: JwtPayload,
  ) {
    await this.assertCanManageMembers(currentUser, organizationId);

    const existing = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Membership not found');
    }

    if (existing.role === OrganizationMemberRole.MANAGER) {
      await this.assertNotLastManager(organizationId, memberId);
    }

    await this.prisma.organizationMember.delete({ where: { id: memberId } });

    return {
      message: 'Member removed successfully',
      data: null,
    };
  }

  async getSettings(organizationId: string, currentUser: JwtPayload) {
    await this.orgAccess.assertCanAccessOrganization(
      currentUser,
      organizationId,
    );

    const settings = await this.ensureOrgSettings(organizationId);
    return {
      message: 'Organization settings retrieved successfully',
      data: {
        autoApproveProductRequests: settings.autoApproveProductRequests,
      },
    };
  }

  async updateSettings(
    organizationId: string,
    dto: UpdateOrganizationSettingsDto,
    currentUser: JwtPayload,
  ) {
    await this.orgAccess.assertCanAccessOrganization(currentUser, organizationId, {
      requireManager: currentUser.role !== Role.SUPER_ADMIN,
    });

    if (currentUser.role === Role.USER) {
      await this.orgAccess.requireManager(currentUser);
    }

    const settings = await this.prisma.organizationSettings.upsert({
      where: { organizationId },
      update: {
        ...(dto.autoApproveProductRequests !== undefined
          ? { autoApproveProductRequests: dto.autoApproveProductRequests }
          : {}),
      },
      create: {
        organizationId,
        autoApproveProductRequests: dto.autoApproveProductRequests ?? false,
      },
    });

    return {
      message: 'Organization settings updated successfully',
      data: {
        autoApproveProductRequests: settings.autoApproveProductRequests,
      },
    };
  }

  private async assertCanManageMembers(
    currentUser: JwtPayload,
    organizationId: string,
  ) {
    if (currentUser.role === Role.SUPER_ADMIN) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!org) throw new NotFoundException('Organization not found');
      return;
    }

    const membership = await this.orgAccess.requireManager(currentUser);
    if (membership.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this organization');
    }
  }

  private async assertNotLastManager(
    organizationId: string,
    excludeMemberId: string,
  ) {
    const remaining = await this.prisma.organizationMember.count({
      where: {
        organizationId,
        role: OrganizationMemberRole.MANAGER,
        id: { not: excludeMemberId },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        'Cannot remove or demote the last manager of an organization',
      );
    }
  }

  private async assertUsersAreBasicAndAssignable(userIds: string[]) {
    if (userIds.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        role: true,
        name: true,
        organizationMembership: {
          select: {
            organization: { select: { name: true } },
          },
        },
      },
    });

    if (users.length !== userIds.length) {
      throw new BadRequestException('One or more users were not found');
    }

    for (const user of users) {
      if (user.role !== Role.USER) {
        throw new BadRequestException(
          `User ${user.name} must have role USER to join an organization`,
        );
      }
      if (user.organizationMembership) {
        throw new ConflictException(
          `User ${user.name} already belongs to organization "${user.organizationMembership.organization.name}"`,
        );
      }
    }
  }

  private async ensureOrgSettings(organizationId: string) {
    return this.prisma.organizationSettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });
  }

  private toListItem(org: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    settings: { autoApproveProductRequests: boolean } | null;
    members: Array<{
      id: string;
      role: OrganizationMemberRole;
      user: { id: string; name: string; email: string };
    }>;
    _count: { members: number; productRequests: number };
  }) {
    return {
      id: org.id,
      name: org.name,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      memberCount: org._count.members,
      productRequestCount: org._count.productRequests,
      settings: {
        autoApproveProductRequests:
          org.settings?.autoApproveProductRequests ?? false,
      },
      managers: org.members.map((m) => ({
        membershipId: m.id,
        role: m.role,
        user: m.user,
      })),
    };
  }
}
