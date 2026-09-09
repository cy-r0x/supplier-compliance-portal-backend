import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
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
          distributor: {
            select: { id: true, name: true, email: true },
          },
          supplier: {
            select: { id: true, name: true, email: true },
          },
          documentRequirements: {
            where: { level: RequirementLevel.REQUIRED },
            select: {
              id: true,
              document: { select: { id: true } },
            },
          },
          fieldRequirements: {
            where: { level: RequirementLevel.REQUIRED },
            select: {
              id: true,
              fieldValue: { select: { id: true, value: true } },
            },
          },
        },
      }),
      this.prisma.productRequest.count({ where }),
    ]);

    const items = rows.map((row) => {
      const {
        documentRequirements,
        fieldRequirements,
        ...product
      } = row;
      const progress = this.computeRequiredProgress(
        documentRequirements,
        fieldRequirements,
      );

      return {
        ...product,
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
    this.assertRequirementKeys(dto.documentRequirements, dto.fieldRequirements);

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

    const prefillByRequirementKey = new Map<
      string,
      Express.Multer.File
    >();

    for (const file of docPrefillFiles) {
      const parsed = parseDocumentPrefillFieldName(file.fieldname);
      if (!parsed) {
        throw new BadRequestException(
          `Invalid document prefill field name: ${file.fieldname}. Use docPrefill__{TYPE} or docPrefill__OTHER__{customKey}`,
        );
      }

      const matchesRequirement = dto.documentRequirements.some((row) => {
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

    let photoUrl: string | null = null;
    if (photo) {
      photoUrl = await this.objectStorageService.uploadFile(photo);
    }

    const uploadedPrefills = new Map<
      string,
      { fileUrl: string; fileName: string }
    >();
    for (const [key, file] of prefillByRequirementKey) {
      const fileUrl = await this.objectStorageService.uploadFile(file);
      uploadedPrefills.set(key, {
        fileUrl,
        fileName: file.originalname,
      });
    }

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
          documentRequirements: {
            create: dto.documentRequirements.map((row) =>
              this.toDocumentRequirementCreate(row),
            ),
          },
          fieldRequirements: {
            create: dto.fieldRequirements.map((row) =>
              this.toFieldRequirementCreate(row),
            ),
          },
        },
        include: {
          documentRequirements: true,
          fieldRequirements: true,
        },
      });

      for (const requirement of productRequest.documentRequirements) {
        const key = `${requirement.type}::${requirement.customKey}`;
        const prefill = uploadedPrefills.get(key);
        if (!prefill) {
          continue;
        }
        await tx.productDocument.create({
          data: {
            requirementId: requirement.id,
            fileUrl: prefill.fileUrl,
            fileName: prefill.fileName,
          },
        });
      }

      for (const row of dto.fieldRequirements) {
        if (!row.prefill) {
          continue;
        }
        const customKey =
          row.fieldType === FieldType.OTHER ? row.customKey!.trim() : '';
        const requirement = productRequest.fieldRequirements.find(
          (r) => r.fieldType === row.fieldType && r.customKey === customKey,
        );
        if (!requirement) {
          continue;
        }
        await tx.productFieldValue.create({
          data: {
            requirementId: requirement.id,
            value: row.prefill.value,
          },
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
    let photoUrl = product.photo;
    if (photo) {
      photoUrl = await this.objectStorageService.uploadFile(photo);
    }

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

    const hasRequirementUpdate =
      dto.documentRequirements !== undefined &&
      dto.fieldRequirements !== undefined;

    if (hasRequirementUpdate) {
      this.assertRequirementKeys(
        dto.documentRequirements!,
        dto.fieldRequirements!,
      );
    }

    const uploadedPrefills = hasRequirementUpdate
      ? await this.uploadDocumentPrefills(
          dto.documentRequirements!,
          files.filter((file) => file.fieldname.startsWith('docPrefill__')),
        )
      : new Map<string, { fileUrl: string; fileName: string }>();

    const existingRequirementLevels = hasRequirementUpdate
      ? await this.prisma.productRequest.findUnique({
          where: { id },
          select: {
            documentRequirements: {
              select: { type: true, customKey: true, level: true },
            },
            fieldRequirements: {
              select: { fieldType: true, customKey: true, level: true },
            },
          },
        })
      : null;

    const requirementLevelsChanged =
      hasRequirementUpdate &&
      existingRequirementLevels &&
      this.requirementLevelsChanged(
        existingRequirementLevels,
        dto.documentRequirements!,
        dto.fieldRequirements!,
      );

    await this.prisma.$transaction(async (tx) => {
      await tx.productRequest.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sku !== undefined ? { sku } : {}),
          ...(dto.price !== undefined
            ? { price: new Prisma.Decimal(dto.price) }
            : {}),
          ...(photo ? { photo: photoUrl } : {}),
          ...(hasRequirementUpdate ? { requirementsUpdatedAt: new Date() } : {}),
        },
      });

      if (hasRequirementUpdate) {
        await this.syncRequirementsOnUpdate(
          tx,
          id,
          dto.documentRequirements!,
          dto.fieldRequirements!,
          uploadedPrefills,
        );
      }

      if (requirementLevelsChanged) {
        await tx.notification.create({
          data: {
            type: NotificationType.REQUEST_REQUIREMENTS_UPDATED,
            title: 'Compliance requirements updated',
            message: `${currentUser.name} updated required fields for ${product.name}`,
            creatorId: currentUser.sub,
            receiverId: product.supplierId,
            productRequestId: id,
          },
        });
      }
    });

    return { message: 'Product updated successfully', data: null };
  }

  private async uploadDocumentPrefills(
    documentRequirements: DocumentRequirementDto[],
    docPrefillFiles: Express.Multer.File[],
  ) {
    const prefillByRequirementKey = new Map<
      string,
      Express.Multer.File
    >();

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

    const uploadedPrefills = new Map<
      string,
      { fileUrl: string; fileName: string }
    >();
    for (const [key, file] of prefillByRequirementKey) {
      const fileUrl = await this.objectStorageService.uploadFile(file);
      uploadedPrefills.set(key, {
        fileUrl,
        fileName: file.originalname,
      });
    }

    return uploadedPrefills;
  }

  private requirementLevelsChanged(
    existing: {
      documentRequirements: Array<{
        type: DocumentType;
        customKey: string;
        level: RequirementLevel;
      }>;
      fieldRequirements: Array<{
        fieldType: FieldType;
        customKey: string;
        level: RequirementLevel;
      }>;
    },
    documentRequirements: DocumentRequirementDto[],
    fieldRequirements: FieldRequirementDto[],
  ): boolean {
    for (const row of documentRequirements) {
      const data = this.toDocumentRequirementCreate(row);
      const previous = existing.documentRequirements.find(
        (item) =>
          item.type === data.type && item.customKey === data.customKey,
      );
      if (previous && previous.level !== data.level) {
        return true;
      }
    }

    for (const row of fieldRequirements) {
      const data = this.toFieldRequirementCreate(row);
      const previous = existing.fieldRequirements.find(
        (item) =>
          item.fieldType === data.fieldType &&
          item.customKey === data.customKey,
      );
      if (previous && previous.level !== data.level) {
        return true;
      }
    }

    return false;
  }

  private async syncRequirementsOnUpdate(
    tx: Prisma.TransactionClient,
    productRequestId: string,
    documentRequirements: DocumentRequirementDto[],
    fieldRequirements: FieldRequirementDto[],
    uploadedPrefills: Map<string, { fileUrl: string; fileName: string }>,
  ) {
    for (const row of documentRequirements) {
      const data = this.toDocumentRequirementCreate(row);
      const requirement = await tx.productDocumentRequirement.upsert({
        where: {
          productRequestId_type_customKey: {
            productRequestId,
            type: data.type,
            customKey: data.customKey,
          },
        },
        update: {
          level: data.level,
          visibility: data.visibility,
          label: data.label,
        },
        create: {
          productRequestId,
          ...data,
        },
        include: { document: true },
      });

      const key = `${data.type}::${data.customKey}`;
      const prefill = uploadedPrefills.get(key);
      if (!prefill) {
        continue;
      }

      if (requirement.document) {
        await tx.productDocument.update({
          where: { id: requirement.document.id },
          data: {
            fileUrl: prefill.fileUrl,
            fileName: prefill.fileName,
          },
        });
      } else {
        await tx.productDocument.create({
          data: {
            requirementId: requirement.id,
            fileUrl: prefill.fileUrl,
            fileName: prefill.fileName,
          },
        });
      }
    }

    for (const row of fieldRequirements) {
      const data = this.toFieldRequirementCreate(row);
      const requirement = await tx.productFieldRequirement.upsert({
        where: {
          productRequestId_fieldType_customKey: {
            productRequestId,
            fieldType: data.fieldType,
            customKey: data.customKey,
          },
        },
        update: {
          level: data.level,
          visibility: data.visibility,
          label: data.label,
        },
        create: {
          productRequestId,
          ...data,
        },
        include: { fieldValue: true },
      });

      if (!row.prefill) {
        continue;
      }

      if (requirement.fieldValue) {
        await tx.productFieldValue.update({
          where: { id: requirement.fieldValue.id },
          data: { value: row.prefill.value },
        });
      } else {
        await tx.productFieldValue.create({
          data: {
            requirementId: requirement.id,
            value: row.prefill.value,
          },
        });
      }
    }
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
        documentRequirements: { include: { document: true } },
        fieldRequirements: { include: { fieldValue: true } },
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

    const fieldValues = this.parseFieldValues(dto.fieldValues);
    const docFiles = files.filter((file) => file.fieldname.startsWith('doc__'));

    for (const requirement of product.documentRequirements) {
      const file = docFiles.find(
        (f) => f.fieldname === `doc__${requirement.id}`,
      );
      if (file) {
        const fileUrl = await this.objectStorageService.uploadFile(file);
        if (requirement.document) {
          await this.prisma.productDocument.update({
            where: { id: requirement.document.id },
            data: { fileUrl, fileName: file.originalname },
          });
        } else {
          await this.prisma.productDocument.create({
            data: {
              requirementId: requirement.id,
              fileUrl,
              fileName: file.originalname,
            },
          });
        }
      }
    }

    for (const entry of fieldValues) {
      const requirement = product.fieldRequirements.find(
        (row) => row.id === entry.requirementId,
      );
      if (!requirement) {
        throw new BadRequestException(
          `Unknown field requirement: ${entry.requirementId}`,
        );
      }
      const value = entry.value?.trim() ?? '';
      if (requirement.fieldValue) {
        await this.prisma.productFieldValue.update({
          where: { id: requirement.fieldValue.id },
          data: { value },
        });
      } else if (value) {
        await this.prisma.productFieldValue.create({
          data: { requirementId: requirement.id, value },
        });
      }
    }

    const refreshed = await this.prisma.productRequest.findFirst({
      where: { id },
      include: {
        documentRequirements: { include: { document: true } },
        fieldRequirements: { include: { fieldValue: true } },
        distributor: {
          select: {
            id: true,
            settings: { select: { autoApproveProductRequests: true } },
          },
        },
      },
    });

    if (!refreshed) {
      throw new NotFoundException('Product request not found');
    }

    this.assertSubmissionComplete(refreshed);

    const autoApprove =
      refreshed.distributor.settings?.autoApproveProductRequests ?? false;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.productRequest.update({
        where: { id },
        data: {
          status: autoApprove ? ProductStatus.APPROVED : ProductStatus.SUBMITTED,
          submittedAt: now,
          ...(autoApprove ? { reviewedAt: now, rejectionReason: null } : {}),
        },
      });

      await tx.notification.create({
        data: {
          type: NotificationType.REQUEST_SUBMITTED,
          title: 'Request submitted for review',
          message: `${currentUser.name} submitted compliance for ${refreshed.name}`,
          creatorId: currentUser.sub,
          receiverId: refreshed.distributorId,
          productRequestId: refreshed.id,
        },
      });

      if (autoApprove) {
        await tx.notification.create({
          data: {
            type: NotificationType.REQUEST_APPROVED,
            title: 'Request approved',
            message: `Compliance for ${refreshed.name} was auto-approved`,
            creatorId: currentUser.sub,
            receiverId: refreshed.supplierId,
            productRequestId: refreshed.id,
          },
        });
      }
    });

    return {
      message: autoApprove
        ? 'Request submitted and approved'
        : 'Request submitted successfully',
      data: null,
    };
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
        distributor: { select: { id: true, name: true, email: true } },
        supplier: { select: { id: true, name: true, email: true } },
        documentRequirements: {
          select: {
            id: true,
            type: true,
            customKey: true,
            label: true,
            level: true,
            visibility: true,
            document: { select: { fileUrl: true, fileName: true } },
          },
        },
        fieldRequirements: {
          select: {
            id: true,
            fieldType: true,
            customKey: true,
            label: true,
            level: true,
            visibility: true,
            fieldValue: { select: { value: true } },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product request not found');
    }

    return product;
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

  private toDocumentRequirementCreate(row: DocumentRequirementDto) {
    const isOther = row.type === DocumentType.OTHER;
    return {
      type: row.type,
      customKey: isOther ? row.customKey!.trim() : '',
      label: isOther ? row.label!.trim() : (row.label?.trim() ?? null),
      level: row.level,
      visibility: row.visibility,
    };
  }

  private toFieldRequirementCreate(row: FieldRequirementDto) {
    const isOther = row.fieldType === FieldType.OTHER;
    return {
      fieldType: row.fieldType,
      customKey: isOther ? row.customKey!.trim() : '',
      label: isOther ? row.label!.trim() : (row.label?.trim() ?? null),
      level: row.level,
      visibility: row.visibility,
    };
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
