import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentVisibility, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const PUBLIC_STATUSES: ProductStatus[] = [
  ProductStatus.SUBMITTED,
  ProductStatus.APPROVED,
  ProductStatus.REJECTED,
];

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicData(publicSlugOrId: string) {
    const product = await this.prisma.productRequest.findFirst({
      where: {
        isDeleted: false,
        status: { in: PUBLIC_STATUSES },
        OR: [{ publicSlug: publicSlugOrId }, { id: publicSlugOrId }],
      },
      select: {
        name: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        supplier: { select: { name: true } },
        template: {
          select: {
            documents: {
              where: { visibility: DocumentVisibility.PUBLIC },
              select: {
                id: true,
                type: true,
                customKey: true,
                label: true,
              },
            },
            fields: {
              where: { visibility: DocumentVisibility.PUBLIC },
              select: {
                id: true,
                fieldType: true,
                customKey: true,
                label: true,
              },
            },
          },
        },
        documentAnswers: {
          select: {
            templateDocumentId: true,
            fileUrl: true,
            fileName: true,
          },
        },
        fieldAnswers: {
          select: {
            templateFieldId: true,
            value: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Public product not found');
    }

    if (!product.template) {
      throw new NotFoundException('Public product not found');
    }

    const answersByDocId = new Map(
      product.documentAnswers.map((row) => [row.templateDocumentId, row]),
    );
    const answersByFieldId = new Map(
      product.fieldAnswers.map((row) => [row.templateFieldId, row]),
    );

    const documents = product.template.documents
      .map((row) => {
        const answer = answersByDocId.get(row.id);
        if (!answer?.fileUrl) return null;
        return {
          type: row.type,
          customKey: row.customKey,
          label: row.label,
          fileUrl: answer.fileUrl,
          fileName: answer.fileName,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    const textFields = product.template.fields
      .map((row) => {
        const answer = answersByFieldId.get(row.id);
        if (!answer?.value?.trim()) return null;
        return {
          fieldType: row.fieldType,
          customKey: row.customKey,
          label: row.label,
          value: answer.value,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    return {
      message: 'Public product retrieved successfully',
      data: {
        name: product.name,
        status: product.status,
        supplierName: product.supplier.name,
        submittedAt: product.submittedAt,
        reviewedAt: product.reviewedAt,
        rejectionReason: product.rejectionReason,
        documents,
        textFields,
      },
    };
  }
}
