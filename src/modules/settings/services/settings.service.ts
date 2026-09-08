import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from 'src/infrastructure/auth/types/jwt-payload';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import { UpdateSettingsDto } from '../dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(currentUser: JwtPayload) {
    const settings = await this.ensureSettings(currentUser.sub);

    return {
      message: 'Settings retrieved successfully',
      data: {
        autoApproveProductRequests: settings.autoApproveProductRequests,
      },
    };
  }

  async updateMine(currentUser: JwtPayload, dto: UpdateSettingsDto) {
    if (dto.autoApproveProductRequests !== undefined) {
      if (currentUser.role !== Role.DISTRIBUTOR) {
        throw new ForbiddenException(
          'Only distributors can configure auto-approve',
        );
      }
    }

    const settings = await this.prisma.userSettings.upsert({
      where: { userId: currentUser.sub },
      update: {
        ...(dto.autoApproveProductRequests !== undefined
          ? { autoApproveProductRequests: dto.autoApproveProductRequests }
          : {}),
      },
      create: {
        userId: currentUser.sub,
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

  private async ensureSettings(userId: string) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        autoApproveProductRequests: false,
      },
    });
  }
}
