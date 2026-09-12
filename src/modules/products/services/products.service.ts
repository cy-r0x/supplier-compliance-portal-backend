import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  DocumentVisibility,
  FieldType,
  NotificationType,
  Prisma,
  ProductStatus,
  RequirementLevel,
  Role,
} from '@prisma/client';
import { getPagination, parseSortQuery } from '../../../common/utils/query.util';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { ObjectStorageService } from '../../../infrastructure/object-storage/services/object-storage.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TemplatesService } from '../../templates/services/templates.service';
import {
  CreateProductRequestDto,
  DocumentRequirementDto,
  FieldRequirementDto,
} from '../dto/create-product-request.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { RejectProductDto } from '../dto/reject-product.dto';
import { SubmitProductDto } from '../dto/submit-product.dto';
import { UpdateProductRequestDto } from '../dto/update-product-request.dto';
import { parseDocumentPrefillFieldName } from '../utils/document-prefill-field.util';

const PRODUCT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'sku',
  'status',
] as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorageService: ObjectStorageService,
    private readonly templatesService: TemplatesService,
  ) {}

  async findAll(currentUser: JwtPayload, query: ListProductsQueryDto) {
    const { page, limit, skip } = getPagination(query);
    const orderBy = parseSortQuery(query.sort, PRODUCT_SORT_FIELDS);

    const where: Prisma.ProductRequestWhereInput = {
      isDeleted: false,
      ...this.scopeWhereForRole(currentUser),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                sku: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productRequest.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          sku: true,
          photo: true,
          price: true,
          status: true,
          publicSlug: true,
          updatedAt: true,
          createdAt: true,
          templateId: true,
          distributor: {
            select: { id: true, name: true, email: true },
          },
          supplier: {
            select: { id: true, name: true, email: true },
          },
          template: {
            select: {
              documents: {
                where: { level: RequirementLevel.REQUIRED },
                select: { id: true },
              },
              fields: {
                where: { level: RequirementLevel.REQUIRED },
                select: { id: true },
              },
            },
          },
          documentAnswers: {
            select: { templateDocumentId: true },
          },
          fieldAnswers: {
            select: { templateFieldId: true, value: true },
          },
        },
      }),
      this.prisma.productRequest.count({ where }),
    ]);

    const items = rows.map((row) => {
      const {
        templateId,
        template,
        documentAnswers,
        fieldAnswers,
        ...product
      } = row;

      const progress = this.computeRequiredProgress(
        template.documents.map((doc) => ({
          document: documentAnswers.some(
            (answer) => answer.templateDocumentId === doc.id,
          )
            ? { id: doc.id }
            : null,
        })),
        template.fields.map((field) => {
          const answer = fieldAnswers.find(
            (item) => item.templateFieldId === field.id,
          );
          return {
            fieldValue: answer ? { value: answer.value } : null,
          };
        }),
      );

      return {
        ...product,
        templateId,
        progress,
      };
    });

    return {
      message: 'Products retrieved successfully',
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async create(
    dto: CreateProductRequestDto,
    currentUser: JwtPayload,
    files: Express.Multer.File[],
  ) {
    const template = await this.templatesService.getOwnedTemplateOrThrow(
      dto.templateId,
      currentUser.sub,
    );

    const documentRequirements = template.documents.map((row) =>
      this.templateDocToRequirementDto(row),
    );
    const fieldRequirements = template.fields.map((row) => {
      const base = this.templateFieldToRequirementDto(row);
      const clientPrefill = dto.fieldRequirements.find((item) => {
        const customKey =
          item.fieldType === FieldType.OTHER ? (item.customKey?.trim() ?? '') : '';
        return item.fieldType === row.fieldType && customKey === row.customKey;
      })?.prefill;
      return clientPrefill ? { ...base, prefill: clientPrefill } : base;
    });

    this.assertRequirementKeys(documentRequirements, fieldRequirements);

    const supplier = await this.prisma.user.findUnique({
      where: { id: dto.supplierId },
      select: { id: true, role: true, name: true },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (supplier.role !== Role.SUPPLIER) {
      throw new BadRequestException('supplierId must reference a SUPPLIER user');
    }

    const sku = dto.sku?.trim() || null;
    if (sku) {
      const existingSku = await this.prisma.productRequest.findFirst({
        where: {
          sku,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (existingSku) {
        throw new ConflictException(
          'A non-deleted product request with this SKU already exists',
        );
      }
    }

    const photo = files.find((file) => file.fieldname === 'photo');
    const docPrefillFiles = files.filter((file) =>
      file.fieldname.startsWith('docPrefill__'),
    );

    const [photoUrl, uploadedPrefills] = await Promise.all([
      photo
        ? this.objectStorageService.uploadFile(photo)
        : Promise.resolve(null as string | null),
      this.uploadDocumentPrefills(documentRequirements, docPrefillFiles),
    ]);

    await this.prisma.$transaction(async (tx) => {
      const productRequest = await tx.productRequest.create({
        data: {
          name: dto.name.trim(),
          sku,
          price:
            dto.price === undefined ? null : new Prisma.Decimal(dto.price),
          photo: photoUrl,
          status: ProductStatus.PENDING,
          distributorId: currentUser.sub,
          supplierId: supplier.id,
          templateId: template.id,
        },
      });

      const documentAnswersToCreate: Array<{
        productRequestId: string;
        templateDocumentId: string;
        fileUrl: string;
        fileName: string;
      }> = [];

      for (const templateDoc of template.documents) {
        const key = `${templateDoc.type}::${templateDoc.customKey}`;
        const prefill = uploadedPrefills.get(key);
        if (!prefill) {
          continue;
        }
        documentAnswersToCreate.push({
          productRequestId: productRequest.id,
          templateDocumentId: templateDoc.id,
          fileUrl: prefill.fileUrl,
          fileName: prefill.fileName,
        });
      }

      if (documentAnswersToCreate.length > 0) {
        await tx.productDocumentAnswer.createMany({
          data: documentAnswersToCreate,
        });
      }

      const productImagePrefill = uploadedPrefills.get(
        `${DocumentType.PRODUCT_IMAGE}::`,
      );
      if (productImagePrefill) {
        await tx.productRequest.update({
          where: { id: productRequest.id },
          data: { photo: productImagePrefill.fileUrl },
        });
      }

      const fieldAnswersToCreate: Array<{
        productRequestId: string;
        templateFieldId: string;
        value: string;
      }> = [];

      for (const templateField of template.fields) {
        const customKey = templateField.customKey;
        const clientPrefill = fieldRequirements.find((row) => {
          const rowKey =
            row.fieldType === FieldType.OTHER
              ? (row.customKey?.trim() ?? '')
              : '';
          return (
            row.fieldType === templateField.fieldType &&
            rowKey === customKey &&
            row.prefill?.value
          );
        })?.prefill;
        if (!clientPrefill?.value) {
          continue;
        }
        fieldAnswersToCreate.push({
          productRequestId: productRequest.id,
          templateFieldId: templateField.id,
          value: clientPrefill.value,
        });
      }

      if (fieldAnswersToCreate.length > 0) {
        await tx.productFieldAnswer.createMany({
          data: fieldAnswersToCreate,
        });
      }

      await tx.notification.create({
        data: {
          type: NotificationType.REQUEST_CREATED,
          title: 'New compliance request',
          message: `${currentUser.name} created a compliance request for ${productRequest.name}`,
          creatorId: currentUser.sub,
          receiverId: supplier.id,
          productRequestId: productRequest.id,
        },
      });
    });

    return {
      message: 'Request has been created',
      data: null,
    };
  }

  async findOne(id: string, currentUser: JwtPayload) {
    const product = await this.loadProductDetail(id);
    this.assertPartyAccess(product, currentUser);

    const progress = this.computeRequiredProgress(
      product.documentRequirements.filter(
        (row) => row.level === RequirementLevel.REQUIRED,
      ),
      product.fieldRequirements.filter(
        (row) => row.level === RequirementLevel.REQUIRED,
      ),
    );

    const { documentRequirements, fieldRequirements, ...rest } = product;

    return {
      message: 'Product retrieved successfully',
      data: {
        ...rest,
        progress,
        documentRequirements: documentRequirements.map((row) => ({
          id: row.id,
          type: row.type,
          customKey: row.customKey,
          label: row.label,
          level: row.level,
          visibility: row.visibility,
          document: row.document
            ? { fileUrl: row.document.fileUrl, fileName: row.document.fileName }
            : null,
        })),
        fieldRequirements: fieldRequirements.map((row) => ({
          id: row.id,
          fieldType: row.fieldType,
          customKey: row.customKey,
          label: row.label,
          level: row.level,
          visibility: row.visibility,
          fieldValue: row.fieldValue ? { value: row.fieldValue.value } : null,
        })),
      },
    };
  }

  async update(
    id: string,
    dto: UpdateProductRequestDto,
    currentUser: JwtPayload,
    files: Express.Multer.File[],
  ) {
    const product = await this.getOwnedProduct(id, currentUser, Role.DISTRIBUTOR);

    if (product.status !== ProductStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be updated');
    }

    const photo = files.find((file) => file.fieldname === 'photo');
    const sku = dto.sku !== undefined ? (dto.sku.trim() || null) : product.sku;
    if (sku && sku !== product.sku) {
      const existingSku = await this.prisma.productRequest.findFirst({
        where: { sku, isDeleted: false, id: { not: id } },
        select: { id: true },
      });
      if (existingSku) {
        throw new ConflictException(
          'A non-deleted product request with this SKU already exists',
        );
      }
    }

    const hasPrefillUpdate =
      dto.documentRequirements !== undefined &&
      dto.fieldRequirements !== undefined;

    const [photoUrl, uploadedPrefills, existingForPrefill] = await Promise.all([
      photo
        ? this.objectStorageService.uploadFile(photo)
        : Promise.resolve(product.photo),
      hasPrefillUpdate
        ? (async () => {
            const templateDocs =
              await this.prisma.requirementTemplateDocument.findMany({
                where: { templateId: product.templateId },
                select: {
                  type: true,
                  customKey: true,
                  label: true,
                  level: true,
                  visibility: true,
                },
              });
            return this.uploadDocumentPrefills(
              templateDocs.map((row) => this.templateDocToRequirementDto(row)),
              files.filter((file) => file.fieldname.startsWith('docPrefill__')),
            );
          })()
        : Promise.resolve(
            new Map<string, { fileUrl: string; fileName: string }>(),
          ),
      hasPrefillUpdate
        ? this.prisma.productRequest.findUnique({
            where: { id },
            select: {
              template: {
                select: {
                  documents: {
                    select: {
                      id: true,
                      type: true,
                      customKey: true,
                    },
                  },
                  fields: {
                    select: {
                      id: true,
                      fieldType: true,
                      customKey: true,
                    },
                  },
                },
              },
              documentAnswers: {
                select: {
                  id: true,
                  templateDocumentId: true,
                },
              },
              fieldAnswers: {
                select: {
                  id: true,
                  templateFieldId: true,
                  value: true,
                },
              },
            },
          })
        : Promise.resolve(null),
    ]);

    if (hasPrefillUpdate && !existingForPrefill?.template) {
      throw new NotFoundException('Product request not found');
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.productRequest.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.sku !== undefined ? { sku } : {}),
            ...(dto.price !== undefined
              ? { price: new Prisma.Decimal(dto.price) }
              : {}),
            ...(photo ? { photo: photoUrl } : {}),
          },
        });

        if (hasPrefillUpdate && existingForPrefill?.template) {
          await this.syncTemplatePrefillsOnUpdate(
            tx,
            id,
            {
              template: existingForPrefill.template,
              documentAnswers: existingForPrefill.documentAnswers,
              fieldAnswers: existingForPrefill.fieldAnswers,
            },
            uploadedPrefills,
            dto.fieldRequirements ?? [],
          );
        }

        const productImagePrefill = uploadedPrefills.get(
          `${DocumentType.PRODUCT_IMAGE}::`,
        );
        if (productImagePrefill) {
          await tx.productRequest.update({
            where: { id },
            data: { photo: productImagePrefill.fileUrl },
          });
        }
      },
      { timeout: 15_000 },
    );

    return { message: 'Product updated successfully', data: null };
  }

  private async uploadDocumentPrefills(
    documentRequirements: DocumentRequirementDto[],
    docPrefillFiles: Express.Multer.File[],
  ) {
    const prefillByRequirementKey = new Map<string, Express.Multer.File>();

    for (const file of docPrefillFiles) {
      const parsed = parseDocumentPrefillFieldName(file.fieldname);
      if (!parsed) {
        throw new BadRequestException(
          `Invalid document prefill field name: ${file.fieldname}. Use docPrefill__{TYPE} or docPrefill__OTHER__{customKey}`,
        );
      }

      const matchesRequirement = documentRequirements.some((row) => {
        const customKey =
          row.type === DocumentType.OTHER ? (row.customKey?.trim() ?? '') : '';
        return row.type === parsed.type && customKey === parsed.customKey;
      });

      if (!matchesRequirement) {
        throw new BadRequestException(
          `No document requirement matches prefill file field ${file.fieldname}`,
        );
      }

      const key = `${parsed.type}::${parsed.customKey}`;
      if (prefillByRequirementKey.has(key)) {
        throw new BadRequestException(
          `Duplicate prefill file for ${file.fieldname}`,
        );
      }
      prefillByRequirementKey.set(key, file);
    }

    const uploadedEntries = await Promise.all(
      [...prefillByRequirementKey.entries()].map(async ([key, file]) => {
        const fileUrl = await this.objectStorageService.uploadFile(file);
        return [
          key,
          { fileUrl, fileName: file.originalname },
        ] as const;
      }),
    );

    return new Map(uploadedEntries);
  }

  async remove(id: string, currentUser: JwtPayload) {
    const product = await this.getOwnedProduct(id, currentUser, Role.DISTRIBUTOR);

    await this.prisma.$transaction(async (tx) => {
      await tx.productRequest.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      await tx.notification.create({
        data: {
          type: NotificationType.REQUEST_DELETED,
          title: 'Request deleted',
          message: `${currentUser.name} deleted the compliance request for ${product.name}`,
          creatorId: currentUser.sub,
          receiverId: product.supplierId,
          productRequestId: product.id,
        },
      });
    });

    return { message: 'Product deleted successfully', data: null };
  }

  async submit(
    id: string,
    dto: SubmitProductDto,
    currentUser: JwtPayload,
    files: Express.Multer.File[],
  ) {
    const product = await this.prisma.productRequest.findFirst({
      where: { id, isDeleted: false },
      include: {
        template: {
          include: {
            documents: true,
            fields: true,
          },
        },
        documentAnswers: true,
        fieldAnswers: true,
        distributor: {
          select: {
            id: true,
            settings: { select: { autoApproveProductRequests: true } },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product request not found');
    }

    if (product.supplierId !== currentUser.sub) {
      throw new ForbiddenException('Only the assigned supplier can submit');
    }

    if (product.status !== ProductStatus.PENDING) {
      throw new BadRequestException('Only PENDING requests can be submitted');
    }

    if (!product.template) {
      throw new BadRequestException('Product request is missing a template');
    }

    await this.submitAgainstTemplate(
      {
        id: product.id,
        name: product.name,
        distributorId: product.distributorId,
        supplierId: product.supplierId,
        template: product.template,
        documentAnswers: product.documentAnswers,
        fieldAnswers: product.fieldAnswers,
        distributor: product.distributor,
      },
      dto,
      files,
      currentUser,
    );

    const autoApprove =
      product.distributor.settings?.autoApproveProductRequests ?? false;

    return {
      message: autoApprove
        ? 'Request submitted and approved'
        : 'Request submitted successfully',
      data: null,
    };
  }

  private async submitAgainstTemplate(
    product: {
      id: string;
      name: string;
      distributorId: string;
      supplierId: string;
      template: {
        documents: Array<{
          id: string;
          type: DocumentType;
          level: RequirementLevel;
        }>;
        fields: Array<{
          id: string;
          level: RequirementLevel;
        }>;
      };
      documentAnswers: Array<{
        id: string;
        templateDocumentId: string;
        fileUrl: string;
      }>;
      fieldAnswers: Array<{
        id: string;
        templateFieldId: string;
        value: string;
      }>;
      distributor: {
        settings: { autoApproveProductRequests: boolean } | null;
      };
    },
    dto: SubmitProductDto,
    files: Express.Multer.File[],
    currentUser: JwtPayload,
  ) {
    const fieldValues = this.parseFieldValues(dto.fieldValues);
    const docFiles = files.filter((file) => file.fieldname.startsWith('doc__'));
    const templateDocs = product.template.documents;
    const templateFields = product.template.fields;

    for (const entry of fieldValues) {
      const requirement = templateFields.find(
        (row) => row.id === entry.requirementId,
      );
      if (!requirement) {
        throw new BadRequestException(
          `Unknown field requirement: ${entry.requirementId}`,
        );
      }
    }

    const filesByRequirementId = new Map<string, Express.Multer.File>();
    for (const requirement of templateDocs) {
      const file = docFiles.find(
        (f) => f.fieldname === `doc__${requirement.id}`,
      );
      if (file) {
        filesByRequirementId.set(requirement.id, file);
      }
    }

    const uploadedDocs = await Promise.all(
      [...filesByRequirementId.entries()].map(async ([requirementId, file]) => {
        const fileUrl = await this.objectStorageService.uploadFile(file);
        return {
          requirementId,
          fileUrl,
          fileName: file.originalname,
        };
      }),
    );

    const uploadedByRequirementId = new Map(
      uploadedDocs.map((row) => [row.requirementId, row] as const),
    );

    const answersByTemplateDocId = new Map(
      product.documentAnswers.map((row) => [row.templateDocumentId, row]),
    );
    const answersByTemplateFieldId = new Map(
      product.fieldAnswers.map((row) => [row.templateFieldId, row]),
    );

    const documentsToCreate: Array<{
      productRequestId: string;
      templateDocumentId: string;
      fileUrl: string;
      fileName: string;
    }> = [];

    for (const requirement of templateDocs) {
      const uploaded = uploadedByRequirementId.get(requirement.id);
      if (!uploaded) {
        continue;
      }

      const existing = answersByTemplateDocId.get(requirement.id);
      if (existing) {
        await this.prisma.productDocumentAnswer.update({
          where: { id: existing.id },
          data: {
            fileUrl: uploaded.fileUrl,
            fileName: uploaded.fileName,
          },
        });
      } else {
        documentsToCreate.push({
          productRequestId: product.id,
          templateDocumentId: requirement.id,
          fileUrl: uploaded.fileUrl,
          fileName: uploaded.fileName,
        });
      }
    }

    if (documentsToCreate.length > 0) {
      await this.prisma.productDocumentAnswer.createMany({
        data: documentsToCreate,
      });
    }

    const productImageRequirement = templateDocs.find(
      (row) => row.type === DocumentType.PRODUCT_IMAGE,
    );
    const productImageUpload = productImageRequirement
      ? uploadedByRequirementId.get(productImageRequirement.id)
      : undefined;
    if (productImageUpload) {
      await this.prisma.productRequest.update({
        where: { id: product.id },
        data: { photo: productImageUpload.fileUrl },
      });
    }

    const fieldAnswersToCreate: Array<{
      productRequestId: string;
      templateFieldId: string;
      value: string;
    }> = [];

    for (const entry of fieldValues) {
      const value = entry.value?.trim() ?? '';
      const existing = answersByTemplateFieldId.get(entry.requirementId);

      if (existing) {
        if (existing.value !== value) {
          await this.prisma.productFieldAnswer.update({
            where: { id: existing.id },
            data: { value },
          });
        }
      } else if (value) {
        fieldAnswersToCreate.push({
          productRequestId: product.id,
          templateFieldId: entry.requirementId,
          value,
        });
      }
    }

    if (fieldAnswersToCreate.length > 0) {
      await this.prisma.productFieldAnswer.createMany({
        data: fieldAnswersToCreate,
      });
    }

    this.assertSubmissionComplete({
      documentRequirements: templateDocs.map((row) => {
        const uploaded = uploadedByRequirementId.get(row.id);
        const existing = answersByTemplateDocId.get(row.id);
        return {
          level: row.level,
          document: uploaded
            ? { fileUrl: uploaded.fileUrl }
            : existing
              ? { fileUrl: existing.fileUrl }
              : null,
        };
      }),
      fieldRequirements: templateFields.map((row) => {
        const submitted = fieldValues.find(
          (entry) => entry.requirementId === row.id,
        );
        const existing = answersByTemplateFieldId.get(row.id);
        const value =
          submitted !== undefined
            ? submitted.value.trim()
            : (existing?.value ?? '');
        return {
          level: row.level,
          fieldValue: value ? { value } : null,
        };
      }),
    });

    await this.finalizeSubmission(product, currentUser);
  }

  private async finalizeSubmission(
    product: {
      id: string;
      name: string;
      distributorId: string;
      supplierId: string;
      distributor: {
        settings: { autoApproveProductRequests: boolean } | null;
      };
    },
    currentUser: JwtPayload,
  ) {
    const autoApprove =
      product.distributor.settings?.autoApproveProductRequests ?? false;
    const now = new Date();

    await this.prisma.$transaction(
      async (tx) => {
        await tx.productRequest.update({
          where: { id: product.id },
          data: {
            status: autoApprove
              ? ProductStatus.APPROVED
              : ProductStatus.SUBMITTED,
            submittedAt: now,
            ...(autoApprove ? { reviewedAt: now, rejectionReason: null } : {}),
          },
        });

        await tx.notification.create({
          data: {
            type: NotificationType.REQUEST_SUBMITTED,
            title: 'Request submitted for review',
            message: `${currentUser.name} submitted compliance for ${product.name}`,
            creatorId: currentUser.sub,
            receiverId: product.distributorId,
            productRequestId: product.id,
          },
        });

        if (autoApprove) {
          await tx.notification.create({
            data: {
              type: NotificationType.REQUEST_APPROVED,
              title: 'Request approved',
              message: `Compliance for ${product.name} was auto-approved`,
              creatorId: currentUser.sub,
              receiverId: product.supplierId,
              productRequestId: product.id,
            },
          });
        }
      },
      { timeout: 15_000 },
    );
  }

  async approve(id: string, currentUser: JwtPayload) {
    const product = await this.getOwnedProduct(id, currentUser, Role.DISTRIBUTOR);

    if (product.status !== ProductStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED requests can be approved');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.productRequest.update({
        where: { id },
        data: {
          status: ProductStatus.APPROVED,
          reviewedAt: now,
          rejectionReason: null,
        },
      });

      await tx.notification.create({
        data: {
          type: NotificationType.REQUEST_APPROVED,
          title: 'Request approved',
          message: `${currentUser.name} approved compliance for ${product.name}`,
          creatorId: currentUser.sub,
          receiverId: product.supplierId,
          productRequestId: product.id,
        },
      });
    });

    return { message: 'Product approved successfully', data: null };
  }

  async reject(
    id: string,
    dto: RejectProductDto,
    currentUser: JwtPayload,
  ) {
    const product = await this.getOwnedProduct(id, currentUser, Role.DISTRIBUTOR);

    if (product.status !== ProductStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED requests can be rejected');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.productRequest.update({
        where: { id },
        data: {
          status: ProductStatus.REJECTED,
          reviewedAt: now,
          rejectionReason: dto.rejectionReason.trim(),
        },
      });

      await tx.notification.create({
        data: {
          type: NotificationType.REQUEST_REJECTED,
          title: 'Request rejected',
          message: `${currentUser.name} rejected compliance for ${product.name}`,
          creatorId: currentUser.sub,
          receiverId: product.supplierId,
          productRequestId: product.id,
        },
      });
    });

    return { message: 'Product rejected successfully', data: null };
  }

  private async loadProductDetail(id: string) {
    const product = await this.prisma.productRequest.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        name: true,
        sku: true,
        photo: true,
        price: true,
        status: true,
        publicSlug: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        distributorId: true,
        supplierId: true,
        templateId: true,
        template: {
          select: {
            id: true,
            name: true,
            documents: {
              select: {
                id: true,
                type: true,
                customKey: true,
                label: true,
                level: true,
                visibility: true,
              },
              orderBy: { type: 'asc' },
            },
            fields: {
              select: {
                id: true,
                fieldType: true,
                customKey: true,
                label: true,
                level: true,
                visibility: true,
              },
              orderBy: { fieldType: 'asc' },
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
        distributor: { select: { id: true, name: true, email: true } },
        supplier: { select: { id: true, name: true, email: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product request not found');
    }

    if (!product.template) {
      throw new NotFoundException('Product request template not found');
    }

    const answersByDocId = new Map(
      product.documentAnswers.map((row) => [row.templateDocumentId, row]),
    );
    const answersByFieldId = new Map(
      product.fieldAnswers.map((row) => [row.templateFieldId, row]),
    );

    const {
      documentAnswers: _documentAnswers,
      fieldAnswers: _fieldAnswers,
      template,
      ...rest
    } = product;

    return {
      ...rest,
      template: { id: template.id, name: template.name },
      documentRequirements: template.documents.map((row) => {
        const answer = answersByDocId.get(row.id);
        return {
          id: row.id,
          type: row.type,
          customKey: row.customKey,
          label: row.label,
          level: row.level,
          visibility: row.visibility,
          document: answer
            ? { fileUrl: answer.fileUrl, fileName: answer.fileName }
            : null,
        };
      }),
      fieldRequirements: template.fields.map((row) => {
        const answer = answersByFieldId.get(row.id);
        return {
          id: row.id,
          fieldType: row.fieldType,
          customKey: row.customKey,
          label: row.label,
          level: row.level,
          visibility: row.visibility,
          fieldValue: answer ? { value: answer.value } : null,
        };
      }),
    };
  }

  private async getOwnedProduct(
    id: string,
    currentUser: JwtPayload,
    ownerRole: 'DISTRIBUTOR',
  ) {
    const product = await this.prisma.productRequest.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        name: true,
        sku: true,
        photo: true,
        status: true,
        distributorId: true,
        supplierId: true,
        templateId: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product request not found');
    }

    if (currentUser.role === Role.SUPER_ADMIN) {
      return product;
    }

    if (
      ownerRole === 'DISTRIBUTOR' &&
      currentUser.role === Role.DISTRIBUTOR &&
      product.distributorId === currentUser.sub
    ) {
      return product;
    }

    throw new ForbiddenException('You do not have access to this product request');
  }

  private templateDocToRequirementDto(row: {
    type: DocumentType;
    customKey: string;
    label: string | null;
    level: RequirementLevel;
    visibility: DocumentVisibility;
  }): DocumentRequirementDto {
    return {
      type: row.type,
      customKey: row.customKey,
      label: row.label ?? undefined,
      level: row.level,
      visibility: row.visibility,
    };
  }

  private templateFieldToRequirementDto(row: {
    fieldType: FieldType;
    customKey: string;
    label: string | null;
    level: RequirementLevel;
    visibility: DocumentVisibility;
  }): FieldRequirementDto {
    return {
      fieldType: row.fieldType,
      customKey: row.customKey,
      label: row.label ?? undefined,
      level: row.level,
      visibility: row.visibility,
    };
  }

  private async syncTemplatePrefillsOnUpdate(
    tx: Prisma.TransactionClient,
    productRequestId: string,
    existing: {
      template: {
        documents: Array<{
          id: string;
          type: DocumentType;
          customKey: string;
        }>;
        fields: Array<{
          id: string;
          fieldType: FieldType;
          customKey: string;
        }>;
      };
      documentAnswers: Array<{
        id: string;
        templateDocumentId: string;
      }>;
      fieldAnswers: Array<{
        id: string;
        templateFieldId: string;
        value: string;
      }>;
    },
    uploadedPrefills: Map<string, { fileUrl: string; fileName: string }>,
    fieldRequirements: FieldRequirementDto[],
  ) {
    const answersByDocId = new Map(
      existing.documentAnswers.map((row) => [row.templateDocumentId, row]),
    );
    const answersByFieldId = new Map(
      existing.fieldAnswers.map((row) => [row.templateFieldId, row]),
    );

    const documentsToCreate: Array<{
      productRequestId: string;
      templateDocumentId: string;
      fileUrl: string;
      fileName: string;
    }> = [];

    for (const templateDoc of existing.template.documents) {
      const key = `${templateDoc.type}::${templateDoc.customKey}`;
      const prefill = uploadedPrefills.get(key);
      if (!prefill) continue;

      const existingAnswer = answersByDocId.get(templateDoc.id);
      if (existingAnswer) {
        await tx.productDocumentAnswer.update({
          where: { id: existingAnswer.id },
          data: {
            fileUrl: prefill.fileUrl,
            fileName: prefill.fileName,
          },
        });
      } else {
        documentsToCreate.push({
          productRequestId,
          templateDocumentId: templateDoc.id,
          fileUrl: prefill.fileUrl,
          fileName: prefill.fileName,
        });
      }
    }

    if (documentsToCreate.length > 0) {
      await tx.productDocumentAnswer.createMany({ data: documentsToCreate });
    }

    const fieldAnswersToCreate: Array<{
      productRequestId: string;
      templateFieldId: string;
      value: string;
    }> = [];

    for (const row of fieldRequirements) {
      const customKey =
        row.fieldType === FieldType.OTHER ? (row.customKey?.trim() ?? '') : '';
      const templateField = existing.template.fields.find(
        (item) =>
          item.fieldType === row.fieldType && item.customKey === customKey,
      );
      if (!templateField) continue;

      const value = row.prefill?.value;
      if (value === undefined) continue;

      const existingAnswer = answersByFieldId.get(templateField.id);
      if (existingAnswer) {
        if (existingAnswer.value !== value) {
          await tx.productFieldAnswer.update({
            where: { id: existingAnswer.id },
            data: { value },
          });
        }
      } else if (value.trim()) {
        fieldAnswersToCreate.push({
          productRequestId,
          templateFieldId: templateField.id,
          value,
        });
      }
    }

    if (fieldAnswersToCreate.length > 0) {
      await tx.productFieldAnswer.createMany({ data: fieldAnswersToCreate });
    }
  }

  private assertPartyAccess(
    product: { distributorId: string; supplierId: string },
    currentUser: JwtPayload,
  ) {
    if (currentUser.role === Role.SUPER_ADMIN) {
      return;
    }
    if (
      currentUser.role === Role.DISTRIBUTOR &&
      product.distributorId === currentUser.sub
    ) {
      return;
    }
    if (
      currentUser.role === Role.SUPPLIER &&
      product.supplierId === currentUser.sub
    ) {
      return;
    }
    throw new ForbiddenException('You do not have access to this product request');
  }

  private parseFieldValues(
    raw?: string,
  ): Array<{ requirementId: string; value: string }> {
    if (!raw?.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as Array<{
        requirementId?: string;
        value?: string;
      }>;
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid fieldValues');
      }
      return parsed
        .filter((row) => typeof row.requirementId === 'string')
        .map((row) => ({
          requirementId: row.requirementId!,
          value: typeof row.value === 'string' ? row.value : '',
        }));
    } catch {
      throw new BadRequestException('fieldValues must be a valid JSON array');
    }
  }

  private assertSubmissionComplete(product: {
    documentRequirements: Array<{
      level: RequirementLevel;
      document: { fileUrl: string } | null;
    }>;
    fieldRequirements: Array<{
      level: RequirementLevel;
      fieldValue: { value: string } | null;
    }>;
  }) {
    for (const row of product.documentRequirements) {
      if (row.level === RequirementLevel.REQUIRED && !row.document?.fileUrl) {
        throw new BadRequestException(
          'All required documents must be uploaded before submit',
        );
      }
    }

    for (const row of product.fieldRequirements) {
      if (
        row.level === RequirementLevel.REQUIRED &&
        !row.fieldValue?.value?.trim()
      ) {
        throw new BadRequestException(
          'All required fields must be filled before submit',
        );
      }
    }
  }

  private scopeWhereForRole(
    currentUser: JwtPayload,
  ): Prisma.ProductRequestWhereInput {
    if (currentUser.role === Role.DISTRIBUTOR) {
      return { distributorId: currentUser.sub };
    }
    if (currentUser.role === Role.SUPPLIER) {
      return { supplierId: currentUser.sub };
    }
    // SUPER_ADMIN sees all non-deleted (caller already sets isDeleted)
    return {};
  }

  private computeRequiredProgress(
    documentRequirements: Array<{ document: unknown | null }>,
    fieldRequirements: Array<{ fieldValue: { value?: string } | null }>,
  ): { completed: number; total: number; percent: number } {
    const docsCompleted = documentRequirements.filter(
      (row) => row.document != null,
    ).length;
    const fieldsCompleted = fieldRequirements.filter(
      (row) => Boolean(row.fieldValue?.value?.trim()),
    ).length;

    const completed = docsCompleted + fieldsCompleted;
    const total = documentRequirements.length + fieldRequirements.length;
    const percent =
      total === 0 ? 100 : Math.round((completed / total) * 100);

    return { completed, total, percent };
  }

  private assertRequirementKeys(
    documents: DocumentRequirementDto[],
    fields: FieldRequirementDto[],
  ) {
    const docKeys = new Set<string>();
    for (const row of documents) {
      if (row.type === DocumentType.OTHER) {
        if (!row.customKey?.trim() || !row.label?.trim()) {
          throw new BadRequestException(
            'OTHER document requirements require customKey and label',
          );
        }
      }
      const key = `${row.type}::${row.type === DocumentType.OTHER ? row.customKey!.trim() : ''}`;
      if (docKeys.has(key)) {
        throw new BadRequestException(
          `Duplicate document requirement: ${row.type}`,
        );
      }
      docKeys.add(key);
    }

    const fieldKeys = new Set<string>();
    for (const row of fields) {
      if (row.fieldType === FieldType.OTHER) {
        if (!row.customKey?.trim() || !row.label?.trim()) {
          throw new BadRequestException(
            'OTHER field requirements require customKey and label',
          );
        }
      }
      const key = `${row.fieldType}::${row.fieldType === FieldType.OTHER ? row.customKey!.trim() : ''}`;
      if (fieldKeys.has(key)) {
        throw new BadRequestException(
          `Duplicate field requirement: ${row.fieldType}`,
        );
      }
      fieldKeys.add(key);
    }
  }
}
