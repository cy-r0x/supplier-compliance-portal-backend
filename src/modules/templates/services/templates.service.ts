import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  FieldType,
  NotificationType,
  OrganizationMemberRole,
  ProductStatus,
  Role,
} from '@prisma/client';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { OrgAccessService } from '../../../infrastructure/org-access/org-access.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateRequirementTemplateDto,
  TemplateDocumentItemDto,
  TemplateFieldItemDto,
} from '../dto/create-requirement-template.dto';
import {
  RelatedProductsAction,
  UpdateRequirementTemplateDto,
} from '../dto/update-requirement-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  async list(currentUser: JwtPayload) {
    const scope = await this.orgAccess.resolveOrgScopeForRead(currentUser);

    const templates = await this.prisma.requirementTemplate.findMany({
      where: scope === 'ALL' ? {} : scope === 'NONE' ? { id: '' } : scope,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            productRequests: {
              where: { isDeleted: false },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Templates retrieved successfully',
      data: templates.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        productRequestCount: row._count.productRequests,
      })),
    };
  }

  async findOne(id: string, currentUser: JwtPayload) {
    const organizationId = await this.organizationIdForRead(currentUser);
    const template = await this.getOwnedTemplate(id, organizationId);

    return {
      message: 'Template retrieved successfully',
      data: this.toDetail(template),
    };
  }

  async getImpact(id: string, currentUser: JwtPayload) {
    const organizationId = await this.organizationIdForRead(currentUser);
    await this.getOwnedTemplate(id, organizationId);

    const products = await this.prisma.productRequest.findMany({
      where: {
        templateId: id,
        isDeleted: false,
        status: { not: ProductStatus.REJECTED },
      },
      select: {
        id: true,
        name: true,
        status: true,
        supplierId: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const resettableCount = products.filter(
      (row) =>
        row.status === ProductStatus.SUBMITTED ||
        row.status === ProductStatus.APPROVED,
    ).length;

    return {
      message: 'Template impact retrieved successfully',
      data: {
        relatedProductCount: products.length,
        resettableCount,
        products: products.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          supplierId: row.supplierId,
          supplierName: row.supplier.name,
        })),
      },
    };
  }

  async create(dto: CreateRequirementTemplateDto, currentUser: JwtPayload) {
    const membership = await this.orgAccess.requireManager(currentUser);
    this.assertTemplateKeys(dto.documents, dto.fields);

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Template name is required');
    }

    const existing = await this.prisma.requirementTemplate.findFirst({
      where: {
        organizationId: membership.organizationId,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'A template with this name already exists for your organization',
      );
    }

    const template = await this.prisma.requirementTemplate.create({
      data: {
        name,
        organizationId: membership.organizationId,
        documents: {
          create: dto.documents.map((row) => this.toDocumentCreate(row)),
        },
        fields: {
          create: dto.fields.map((row) => this.toFieldCreate(row)),
        },
      },
      include: {
        documents: true,
        fields: true,
      },
    });

    return {
      message: 'Template created successfully',
      data: this.toDetail(template),
    };
  }

  async update(
    id: string,
    dto: UpdateRequirementTemplateDto,
    currentUser: JwtPayload,
  ) {
    const membership = await this.orgAccess.requireManager(currentUser);
    this.assertTemplateKeys(dto.documents, dto.fields);

    const existing = await this.getOwnedTemplate(id, membership.organizationId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Template name is required');
    }

    const nameConflict = await this.prisma.requirementTemplate.findFirst({
      where: {
        organizationId: membership.organizationId,
        name: { equals: name, mode: 'insensitive' },
        id: { not: id },
      },
      select: { id: true },
    });

    if (nameConflict) {
      throw new ConflictException(
        'A template with this name already exists for your organization',
      );
    }

    const relatedProducts = await this.prisma.productRequest.findMany({
      where: {
        templateId: id,
        isDeleted: false,
        status: { not: ProductStatus.REJECTED },
      },
      select: {
        id: true,
        name: true,
        status: true,
        supplierId: true,
      },
    });
    const managerIds = (
      await this.prisma.organizationMember.findMany({
        where: {
          organizationId: membership.organizationId,
          role: OrganizationMemberRole.MANAGER,
        },
        select: { userId: true },
      })
    ).map((member) => member.userId);

    const desiredDocs = dto.documents.map((row) => this.toDocumentCreate(row));
    const desiredFields = dto.fields.map((row) => this.toFieldCreate(row));
    const requirementsChanged = this.requirementsMatrixChanged(
      existing.documents,
      existing.fields,
      desiredDocs,
      desiredFields,
    );

    if (
      requirementsChanged &&
      relatedProducts.length > 0 &&
      dto.relatedProductsAction !== RelatedProductsAction.NOTIFY_AND_RESET &&
      dto.relatedProductsAction !== RelatedProductsAction.KEEP_AS_IS
    ) {
      throw new BadRequestException(
        'relatedProductsAction is required when requirement settings change on a template used by products. Use NOTIFY_AND_RESET or KEEP_AS_IS.',
      );
    }

    const template = await this.prisma.$transaction(
      async (tx) => {
        await tx.requirementTemplate.update({
          where: { id },
          data: { name },
        });

        const existingDocsByKey = new Map(
          existing.documents.map((row) => [
            `${row.type}::${row.customKey}`,
            row,
          ]),
        );
        const nextDocKeys = new Set(
          desiredDocs.map((row) => `${row.type}::${row.customKey}`),
        );

        for (const row of desiredDocs) {
          const key = `${row.type}::${row.customKey}`;
          const previous = existingDocsByKey.get(key);
          if (previous) {
            await tx.requirementTemplateDocument.update({
              where: { id: previous.id },
              data: {
                label: row.label,
                level: row.level,
                visibility: row.visibility,
              },
            });
          } else {
            await tx.requirementTemplateDocument.create({
              data: { templateId: id, ...row },
            });
          }
        }

        const docsToRemove = existing.documents.filter(
          (row) => !nextDocKeys.has(`${row.type}::${row.customKey}`),
        );
        if (docsToRemove.length > 0) {
          const ids = docsToRemove.map((row) => row.id);
          await tx.productDocumentAnswer.deleteMany({
            where: { templateDocumentId: { in: ids } },
          });
          await tx.requirementTemplateDocument.deleteMany({
            where: { id: { in: ids } },
          });
        }

        const existingFieldsByKey = new Map(
          existing.fields.map((row) => [
            `${row.fieldType}::${row.customKey}`,
            row,
          ]),
        );
        const nextFieldKeys = new Set(
          desiredFields.map((row) => `${row.fieldType}::${row.customKey}`),
        );

        for (const row of desiredFields) {
          const key = `${row.fieldType}::${row.customKey}`;
          const previous = existingFieldsByKey.get(key);
          if (previous) {
            await tx.requirementTemplateField.update({
              where: { id: previous.id },
              data: {
                label: row.label,
                level: row.level,
                visibility: row.visibility,
              },
            });
          } else {
            await tx.requirementTemplateField.create({
              data: { templateId: id, ...row },
            });
          }
        }

        const fieldsToRemove = existing.fields.filter(
          (row) => !nextFieldKeys.has(`${row.fieldType}::${row.customKey}`),
        );
        if (fieldsToRemove.length > 0) {
          const ids = fieldsToRemove.map((row) => row.id);
          await tx.productFieldAnswer.deleteMany({
            where: { templateFieldId: { in: ids } },
          });
          await tx.requirementTemplateField.deleteMany({
            where: { id: { in: ids } },
          });
        }

        if (
          requirementsChanged &&
          dto.relatedProductsAction ===
            RelatedProductsAction.NOTIFY_AND_RESET &&
          relatedProducts.length > 0
        ) {
          const resetIds = relatedProducts
            .filter(
              (row) =>
                row.status === ProductStatus.SUBMITTED ||
                row.status === ProductStatus.APPROVED,
            )
            .map((row) => row.id);

          if (resetIds.length > 0) {
            await tx.productRequest.updateMany({
              where: { id: { in: resetIds } },
              data: {
                status: ProductStatus.PENDING,
                submittedAt: null,
                reviewedAt: null,
                rejectionReason: null,
              },
            });
          }

          await tx.notification.createMany({
            data: relatedProducts.flatMap((product) => [
              {
                type: NotificationType.REQUEST_REQUIREMENTS_UPDATED,
                title: 'Compliance requirements updated',
                message: `${currentUser.name} updated requirements for ${product.name}. Please review and resubmit if needed.`,
                creatorId: currentUser.sub,
                receiverId: product.supplierId,
                productRequestId: product.id,
              },
              ...managerIds.map((receiverId) => ({
                type: NotificationType.REQUEST_REQUIREMENTS_UPDATED,
                title: 'Compliance requirements updated',
                message: `Requirements for ${product.name} were updated and the request may require resubmission.`,
                creatorId: currentUser.sub,
                receiverId,
                productRequestId: product.id,
              })),
            ]),
          });
        }

        return tx.requirementTemplate.findFirstOrThrow({
          where: { id },
          include: {
            documents: { orderBy: { type: 'asc' } },
            fields: { orderBy: { fieldType: 'asc' } },
          },
        });
      },
      { timeout: 20_000 },
    );

    return {
      message: 'Template updated successfully',
      data: {
        ...this.toDetail(template),
        relatedProductsAffected: relatedProducts.length,
        relatedProductsAction: dto.relatedProductsAction ?? null,
      },
    };
  }

  async getOwnedTemplateOrThrow(id: string, organizationId: string) {
    return this.getOwnedTemplate(id, organizationId);
  }

  private async getOwnedTemplate(id: string, organizationId: string | null) {
    const template = await this.prisma.requirementTemplate.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
      include: {
        documents: { orderBy: { type: 'asc' } },
        fields: { orderBy: { fieldType: 'asc' } },
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  private toDetail(
    template: Awaited<ReturnType<TemplatesService['getOwnedTemplate']>>,
  ) {
    return {
      id: template.id,
      name: template.name,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      documents: template.documents.map((row) => ({
        id: row.id,
        type: row.type,
        customKey: row.customKey,
        label: row.label,
        level: row.level,
        visibility: row.visibility,
      })),
      fields: template.fields.map((row) => ({
        id: row.id,
        fieldType: row.fieldType,
        customKey: row.customKey,
        label: row.label,
        level: row.level,
        visibility: row.visibility,
      })),
    };
  }

  private toDocumentCreate(row: TemplateDocumentItemDto) {
    const isOther = row.type === DocumentType.OTHER;
    return {
      type: row.type,
      customKey: isOther ? row.customKey!.trim() : '',
      label: isOther ? row.label!.trim() : (row.label?.trim() ?? null),
      level: row.level,
      visibility: row.visibility,
    };
  }

  private toFieldCreate(row: TemplateFieldItemDto) {
    const isOther = row.fieldType === FieldType.OTHER;
    return {
      fieldType: row.fieldType,
      customKey: isOther ? row.customKey!.trim() : '',
      label: isOther ? row.label!.trim() : (row.label?.trim() ?? null),
      level: row.level,
      visibility: row.visibility,
    };
  }

  private assertTemplateKeys(
    documents: TemplateDocumentItemDto[],
    fields: TemplateFieldItemDto[],
  ) {
    const docKeys = new Set<string>();
    for (const row of documents) {
      if (row.type === DocumentType.OTHER) {
        if (!row.customKey?.trim() || !row.label?.trim()) {
          throw new BadRequestException(
            'OTHER document items require customKey and label',
          );
        }
      }
      const key = `${row.type}::${row.type === DocumentType.OTHER ? row.customKey!.trim() : ''}`;
      if (docKeys.has(key)) {
        throw new BadRequestException(`Duplicate document type: ${key}`);
      }
      docKeys.add(key);
    }

    const fieldKeys = new Set<string>();
    for (const row of fields) {
      if (row.fieldType === FieldType.OTHER) {
        if (!row.customKey?.trim() || !row.label?.trim()) {
          throw new BadRequestException(
            'OTHER field items require customKey and label',
          );
        }
      }
      const key = `${row.fieldType}::${row.fieldType === FieldType.OTHER ? row.customKey!.trim() : ''}`;
      if (fieldKeys.has(key)) {
        throw new BadRequestException(`Duplicate field type: ${key}`);
      }
      fieldKeys.add(key);
    }
  }

  private requirementsMatrixChanged(
    existingDocuments: Array<{
      type: DocumentType;
      customKey: string;
      label: string | null;
      level: string;
      visibility: string;
    }>,
    existingFields: Array<{
      fieldType: FieldType;
      customKey: string;
      label: string | null;
      level: string;
      visibility: string;
    }>,
    desiredDocs: Array<{
      type: DocumentType;
      customKey: string;
      label: string | null;
      level: string;
      visibility: string;
    }>,
    desiredFields: Array<{
      fieldType: FieldType;
      customKey: string;
      label: string | null;
      level: string;
      visibility: string;
    }>,
  ): boolean {
    const serializeDocs = (
      rows: Array<{
        type: DocumentType;
        customKey: string;
        label: string | null;
        level: string;
        visibility: string;
      }>,
    ) =>
      JSON.stringify(
        [...rows]
          .map((row) => ({
            type: row.type,
            customKey: row.customKey,
            label: row.label,
            level: row.level,
            visibility: row.visibility,
          }))
          .sort((a, b) =>
            `${a.type}::${a.customKey}`.localeCompare(
              `${b.type}::${b.customKey}`,
            ),
          ),
      );

    const serializeFields = (
      rows: Array<{
        fieldType: FieldType;
        customKey: string;
        label: string | null;
        level: string;
        visibility: string;
      }>,
    ) =>
      JSON.stringify(
        [...rows]
          .map((row) => ({
            fieldType: row.fieldType,
            customKey: row.customKey,
            label: row.label,
            level: row.level,
            visibility: row.visibility,
          }))
          .sort((a, b) =>
            `${a.fieldType}::${a.customKey}`.localeCompare(
              `${b.fieldType}::${b.customKey}`,
            ),
          ),
      );

    return (
      serializeDocs(existingDocuments) !== serializeDocs(desiredDocs) ||
      serializeFields(existingFields) !== serializeFields(desiredFields)
    );
  }

  private async organizationIdForRead(currentUser: JwtPayload) {
    if (currentUser.role === Role.SUPER_ADMIN) return null;
    const membership = await this.orgAccess.requireMembership(currentUser);
    return membership.organizationId;
  }
}
