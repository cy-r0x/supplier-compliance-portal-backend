import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { ObjectStorageService } from '../../../infrastructure/object-storage/services/object-storage.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

const PLATFORM_SETTINGS_ID = 'default';

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorageService: ObjectStorageService,
  ) {}

  async getSettings() {
    const settings = await this.ensureSettings();
    return {
      message: 'Platform settings retrieved successfully',
      data: this.toDto(settings),
    };
  }

  async updateSeals(input: {
    sealApproved?: Express.Multer.File;
    sealSubmitted?: Express.Multer.File;
    sealRejected?: Express.Multer.File;
    clearApproved?: boolean;
    clearSubmitted?: boolean;
    clearRejected?: boolean;
  }) {
    const current = await this.ensureSettings();
    const data: {
      sealApprovedUrl?: string | null;
      sealSubmittedUrl?: string | null;
      sealRejectedUrl?: string | null;
    } = {};

    if (input.clearApproved) {
      data.sealApprovedUrl = null;
    } else if (input.sealApproved) {
      this.assertImage(input.sealApproved);
      data.sealApprovedUrl = await this.objectStorageService.uploadFile(
        input.sealApproved,
      );
    }

    if (input.clearSubmitted) {
      data.sealSubmittedUrl = null;
    } else if (input.sealSubmitted) {
      this.assertImage(input.sealSubmitted);
      data.sealSubmittedUrl = await this.objectStorageService.uploadFile(
        input.sealSubmitted,
      );
    }

    if (input.clearRejected) {
      data.sealRejectedUrl = null;
    } else if (input.sealRejected) {
      this.assertImage(input.sealRejected);
      data.sealRejectedUrl = await this.objectStorageService.uploadFile(
        input.sealRejected,
      );
    }

    const settings =
      Object.keys(data).length === 0
        ? current
        : await this.prisma.platformSettings.update({
            where: { id: PLATFORM_SETTINGS_ID },
            data,
          });

    return {
      message: 'Platform seal images updated successfully',
      data: this.toDto(settings),
    };
  }

  async resolveSealImageUrl(
    status: ProductStatus,
  ): Promise<string | null> {
    const settings = await this.ensureSettings();
    switch (status) {
      case ProductStatus.APPROVED:
        return settings.sealApprovedUrl;
      case ProductStatus.SUBMITTED:
        return settings.sealSubmittedUrl;
      case ProductStatus.REJECTED:
        return settings.sealRejectedUrl;
      default:
        return null;
    }
  }

  private async ensureSettings() {
    const existing = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.platformSettings.create({
      data: { id: PLATFORM_SETTINGS_ID },
    });
  }

  private assertImage(file: Express.Multer.File) {
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Seal upload must be an image file');
    }
  }

  private toDto(settings: {
    sealApprovedUrl: string | null;
    sealSubmittedUrl: string | null;
    sealRejectedUrl: string | null;
    updatedAt: Date;
  }) {
    return {
      sealApprovedUrl: settings.sealApprovedUrl,
      sealSubmittedUrl: settings.sealSubmittedUrl,
      sealRejectedUrl: settings.sealRejectedUrl,
      updatedAt: settings.updatedAt,
    };
  }
}
