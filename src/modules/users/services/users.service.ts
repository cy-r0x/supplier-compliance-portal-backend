import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { getPagination, parseSortQuery } from 'src/common/utils/query.util';
import type { JwtPayload } from 'src/infrastructure/auth/types/jwt-payload';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { ObjectStorageService } from 'src/infrastructure/object-storage/services/object-storage.service';

const BCRYPT_ROUNDS = 10;
const USER_SORT_FIELDS = ['createdAt', 'name', 'email'] as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly objectStorageService: ObjectStorageService) { }

  async findAll(currentUser: JwtPayload, query: ListUsersQueryDto) {
    const { page, limit, skip } = getPagination(query);
    const orderBy = parseSortQuery(query.sort, USER_SORT_FIELDS);

    const where = this.buildListWhere(currentUser, query);

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
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      message: 'Users retrieved successfully',
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  private buildListWhere(
    currentUser: JwtPayload,
    query: ListUsersQueryDto,
  ): Prisma.UserWhereInput {
    if (currentUser.role === Role.SUPPLIER) {
      throw new ForbiddenException('Suppliers cannot list users');
    }

    if (currentUser.role === Role.DISTRIBUTOR) {
      if (query.role && query.role !== Role.SUPPLIER) {
        throw new ForbiddenException('Distributors can only list suppliers');
      }
      return {
        role: Role.SUPPLIER,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
    }

    const roles = query.role
      ? [query.role]
      : [Role.DISTRIBUTOR, Role.SUPPLIER];

    return {
      role: { in: roles },
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
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
      },
    });

    return {
      message: 'Profile retrieved successfully',
      data: user,
    };
  }

  async create(dto: CreateUserDto, currentUser: JwtPayload, photo?: Express.Multer.File) {
    this.assertCanCreateRole(dto.role, currentUser.role);

    let photoUrl: string | null = null;
    if (photo) {
      const uploadedPhoto = await this.objectStorageService.uploadFile(photo);
      photoUrl = uploadedPhoto;
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
        settings: {
          create: {
            autoApproveProductRequests: false,
          },
        },
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
      message:
        dto.role === Role.DISTRIBUTOR
          ? 'Distributor created'
          : 'Supplier created',
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
    if (targetRole === Role.DISTRIBUTOR) {
      if (actorRole !== Role.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only SUPER_ADMIN can create distributor users',
        );
      }
      return;
    }

    if (actorRole !== Role.SUPER_ADMIN && actorRole !== Role.DISTRIBUTOR) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN or DISTRIBUTOR can create this user',
      );
    }
  }
}
