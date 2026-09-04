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
  Prisma,
  ProductStatus,
  Role,
} from '@prisma/client';
import type { JwtPayload } from 'src/infrastructure/auth/types/jwt-payload';
import { ObjectStorageService } from 'src/infrastructure/object-storage/services/object-storage.service';
import { PrismaService } from 'src/infrastructure/prisma/prisma.service';
import {
  CreateProductRequestDto,
  DocumentRequirementDto,
  FieldRequirementDto,
} from '../dto/create-product-request.dto';
import { parseDocumentPrefillFieldName } from '../utils/document-prefill-field.util';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorageService: ObjectStorageService,
  ) {}

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
