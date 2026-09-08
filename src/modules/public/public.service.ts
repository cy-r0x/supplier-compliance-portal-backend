import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentVisibility, ProductStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicData(publicSlugOrId: string) {
    const product = await this.prisma.productRequest.findFirst({
      where: {
        isDeleted: false,
        status: ProductStatus.APPROVED,
        OR: [{ publicSlug: publicSlugOrId }, { id: publicSlugOrId }],
      },
      select: {
        name: true,
        photo: true,
        reviewedAt: true,
        supplier: { select: { name: true } },
        documentRequirements: {
          where: { visibility: DocumentVisibility.PUBLIC },
          select: {
            type: true,
            customKey: true,
            label: true,
            document: { select: { fileUrl: true, fileName: true } },
          },
        },
        fieldRequirements: {
          where: { visibility: DocumentVisibility.PUBLIC },
          select: {
            fieldType: true,
            customKey: true,
            label: true,
            fieldValue: { select: { value: true } },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Public product not found');
    }

    const documents = product.documentRequirements
      .filter((row) => row.document?.fileUrl)
      .map((row) => ({
        type: row.type,
        customKey: row.customKey,
        label: row.label,
        fileUrl: row.document!.fileUrl,
        fileName: row.document!.fileName,
      }));

    const textFields = product.fieldRequirements
      .filter((row) => row.fieldValue?.value?.trim())
      .map((row) => ({
        fieldType: row.fieldType,
        customKey: row.customKey,
        label: row.label,
        value: row.fieldValue!.value,
      }));

    return {
      message: 'Public product retrieved successfully',
      data: {
        name: product.name,
        photo: product.photo,
        supplierName: product.supplier.name,
        approvedAt: product.reviewedAt,
        documents,
        textFields,
      },
    };
  }
}
