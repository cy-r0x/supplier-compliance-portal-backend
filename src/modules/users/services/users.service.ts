import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { JwtPayload } from 'src/infrastructure/auth/types/jwt-payload';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { ObjectStorageService } from 'src/infrastructure/object-storage/services/object-storage.service';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly objectStorageService: ObjectStorageService) { }

  findAll() {
    return {
      message: 'Users retrieved successfully',
      data: [],
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
