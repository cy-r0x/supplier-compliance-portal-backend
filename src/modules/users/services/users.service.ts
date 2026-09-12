import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { getPagination, parseSortQuery } from '../../../common/utils/query.util';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { OrgAccessService } from '../../../infrastructure/org-access/org-access.service';
import { ObjectStorageService } from '../../../infrastructure/object-storage/services/object-storage.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';

const BCRYPT_ROUNDS = 10;
const USER_SORT_FIELDS = ['createdAt', 'name', 'email'] as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  async findAll(currentUser: JwtPayload, query: ListUsersQueryDto) {
    const { page, limit, skip } = getPagination(query);
    const orderBy = parseSortQuery(query.sort, USER_SORT_FIELDS);
    const where = await this.buildListWhere(currentUser, query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          photo: true,
          createdAt: true,
          organizationMembership: {
            select: {
              id: true,
              role: true,
              organization: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      message: 'Users retrieved successfully',
      data: items.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        photo: user.photo,
        createdAt: user.createdAt,
        organization: user.organizationMembership
          ? {
              membershipId: user.organizationMembership.id,
              role: user.organizationMembership.role,
              id: user.organizationMembership.organization.id,
              name: user.organizationMembership.organization.name,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  private async buildListWhere(
    currentUser: JwtPayload,
    query: ListUsersQueryDto,
  ): Promise<Prisma.UserWhereInput> {
    if (currentUser.role === Role.SUPPLIER) {
      throw new ForbiddenException('Suppliers cannot list users');
    }

    const searchFilter = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Org managers: suppliers (product setup) + unassigned USERs (team invite)
    if (currentUser.role === Role.USER) {
      await this.orgAccess.requireManager(currentUser);

      if (!query.role || query.role === Role.SUPPLIER) {
        return {
          role: Role.SUPPLIER,
          ...searchFilter,
        };
      }

      if (query.role === Role.USER) {
        return {
          role: Role.USER,
          organizationMembership: { is: null },
          ...searchFilter,
        };
      }

      throw new ForbiddenException(
        'Managers can only list suppliers or unassigned users',
      );
    }

    // SUPER_ADMIN
    const roles = query.role ? [query.role] : [Role.USER, Role.SUPPLIER];
    return {
      role: { in: roles },
      ...searchFilter,
    };
  }

  async getMe(currentUser: JwtPayload) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: currentUser.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        photo: true,
        createdAt: true,
        organizationMembership: {
          select: {
            id: true,
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      message: 'Profile retrieved successfully',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        photo: user.photo,
        createdAt: user.createdAt,
        organization: user.organizationMembership
          ? {
              membershipId: user.organizationMembership.id,
              role: user.organizationMembership.role,
              id: user.organizationMembership.organization.id,
              name: user.organizationMembership.organization.name,
            }
          : null,
      },
    };
  }

  async create(
    dto: CreateUserDto,
    currentUser: JwtPayload,
    photo?: Express.Multer.File,
  ) {
    this.assertCanCreateRole(dto.role, currentUser.role);

    if (currentUser.role === Role.USER) {
      await this.orgAccess.requireManager(currentUser);
    }

    let photoUrl: string | null = null;
    if (photo) {
      photoUrl = await this.objectStorageService.uploadFile(photo);
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: passwordHash,
        role: dto.role,
        photo: photoUrl ?? null,
        createdById: currentUser.sub,
        settings: { create: {} },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        photo: true,
      },
    });

    return {
      message: dto.role === Role.USER ? 'User created' : 'Supplier created',
      data: user,
    };
  }

  async updateMyPhoto(currentUser: JwtPayload, photo: Express.Multer.File) {
    if (!photo) {
      throw new BadRequestException('Photo file is required');
    }

    if (!photo.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    const photoUrl = await this.objectStorageService.uploadFile(photo);

    const user = await this.prisma.user.update({
      where: { id: currentUser.sub },
      data: { photo: photoUrl },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        photo: true,
      },
    });

    return {
      message: 'Profile photo updated successfully',
      data: user,
    };
  }

  private assertCanCreateRole(targetRole: Role, actorRole: Role): void {
    if (actorRole === Role.SUPER_ADMIN) {
      if (targetRole !== Role.USER && targetRole !== Role.SUPPLIER) {
        throw new ForbiddenException('SUPER_ADMIN can create USER or SUPPLIER');
      }
      return;
    }

    // Managers may create USER (invite) via users API when attaching — keep supplier create for managers
    if (actorRole === Role.USER && targetRole === Role.SUPPLIER) {
      return;
    }

    if (actorRole === Role.USER && targetRole === Role.USER) {
      return;
    }

    throw new ForbiddenException('You cannot create this user role');
  }
}
