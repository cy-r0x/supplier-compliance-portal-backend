import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentVisibility, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PlatformService } from '../platform/services/platform.service';

const PUBLIC_STATUSES: ProductStatus[] = [
  ProductStatus.SUBMITTED,
  ProductStatus.APPROVED,
  ProductStatus.REJECTED,
];

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformService: PlatformService,
  ) {}

  async getPublicData(publicSlugOrId: string) {
    const product = await this.prisma.productRequest.findFirst({
      where: {
        isDeleted: false,
        status: { in: PUBLIC_STATUSES },
        OR: [{ publicSlug: publicSlugOrId }, { id: publicSlugOrId }],
      },
      select: {
        name: true,
        sku: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        supplier: { select: { name: true } },
        organization: { select: { name: true } },
        template: {
          select: {
            documents: {
              select: {
                id: true,
                type: true,
                customKey: true,
                label: true,
              },
            },
            fields: {
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
          where: { visibility: DocumentVisibility.PUBLIC },
          select: {
            id: true,
            templateDocumentId: true,
            fileUrl: true,
            fileName: true,
          },
        },
        fieldAnswers: {
          where: { visibility: DocumentVisibility.PUBLIC },
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

    const answersByDocId = new Map<
      string,
      Array<{ fileUrl: string; fileName: string | null }>
    >();
    for (const row of product.documentAnswers) {
      const list = answersByDocId.get(row.templateDocumentId) ?? [];
      list.push({ fileUrl: row.fileUrl, fileName: row.fileName });
      answersByDocId.set(row.templateDocumentId, list);
    }
    const answersByFieldId = new Map(
      product.fieldAnswers.map((row) => [row.templateFieldId, row]),
    );

    const documents = product.template.documents.flatMap((row) => {
      const answers = answersByDocId.get(row.id) ?? [];
      return answers
        .filter((answer) => Boolean(answer.fileUrl))
        .map((answer) => ({
          type: row.type,
          customKey: row.customKey,
          label: row.label,
          fileUrl: answer.fileUrl,
          fileName: answer.fileName,
        }));
    });

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

    const sealImageUrl = await this.platformService.resolveSealImageUrl(
      product.status,
    );

    return {
      message: 'Public product retrieved successfully',
      data: {
        name: product.name,
        sku: product.sku,
        status: product.status,
        supplierName: product.supplier.name,
        organizationName: product.organization.name,
        sealImageUrl,
        submittedAt: product.submittedAt,
        reviewedAt: product.reviewedAt,
        rejectionReason: product.rejectionReason,
        documents,
        textFields,
      },
    };
  }
}
