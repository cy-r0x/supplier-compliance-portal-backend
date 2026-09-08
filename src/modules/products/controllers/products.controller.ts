import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  DocumentType,
  DocumentVisibility,
  FieldType,
  RequirementLevel,
  Role,
} from '@prisma/client';
import {
  CurrentUser,
  Roles,
} from 'src/infrastructure/auth/decorators/auth.decorator';
import type { JwtPayload } from 'src/infrastructure/auth/types/jwt-payload';
import { CreateProductRequestDto } from '../dto/create-product-request.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { RejectProductDto } from '../dto/reject-product.dto';
import { SubmitProductDto } from '../dto/submit-product.dto';
import { UpdateProductRequestDto } from '../dto/update-product-request.dto';
import { ProductsService } from '../services/products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: 'List product requests',
    description:
      'Paginated list scoped to the current user role. Filter by status and search name/SKU. Each item includes required-answer progress.',
  })
  findAll(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.productsService.findAll(currentUser, query);
  }

  @Post()
  @Roles(Role.DISTRIBUTOR)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create product request',
    description:
      'DISTRIBUTOR only. Creates PENDING request with requirements, optional file prefills (uploaded via ObjectStorage), and REQUEST_CREATED notification. Document prefill files: docPrefill__{TYPE} or docPrefill__OTHER__{customKey}. Product photo: photo.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'name',
        'supplierId',
        'documentRequirements',
        'fieldRequirements',
      ],
      properties: {
        name: { type: 'string', example: 'Widget Pro' },
        sku: { type: 'string', example: 'WP-001' },
        price: { type: 'number', example: 19.99 },
        supplierId: { type: 'string', format: 'uuid' },
        documentRequirements: {
          type: 'string',
          description: 'JSON array of document requirements',
          example: JSON.stringify([
            {
              type: DocumentType.TEST_REPORT,
              level: RequirementLevel.REQUIRED,
              visibility: DocumentVisibility.PRIVATE,
            },
            {
              type: DocumentType.PRODUCT_IMAGE,
              level: RequirementLevel.OPTIONAL,
              visibility: DocumentVisibility.PUBLIC,
            },
          ]),
        },
        fieldRequirements: {
          type: 'string',
          description: 'JSON array of field requirements (text prefills nested)',
          example: JSON.stringify([
            {
              fieldType: FieldType.SAFETY_NOTICE_TEXT,
              level: RequirementLevel.REQUIRED,
              visibility: DocumentVisibility.PUBLIC,
              prefill: { value: 'Keep away from children under 3.' },
            },
          ]),
        },
        photo: {
          type: 'string',
          format: 'binary',
          description: 'Optional product photo',
        },
        'docPrefill__PRODUCT_IMAGE': {
          type: 'string',
          format: 'binary',
          description: 'Optional prefill file for PRODUCT_IMAGE requirement',
        },
      },
    },
  })
  async create(
    @Body() dto: CreateProductRequestDto,
    @CurrentUser() currentUser: JwtPayload,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return await this.productsService.create(
      dto,
      currentUser,
      files ?? [],
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product request detail' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.productsService.findOne(id, currentUser);
  }

  @Patch(':id')
  @Roles(Role.DISTRIBUTOR)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update product request metadata while PENDING' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductRequestDto,
    @CurrentUser() currentUser: JwtPayload,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.productsService.update(id, dto, currentUser, files ?? []);
  }

  @Delete(':id')
  @Roles(Role.DISTRIBUTOR)
  @ApiOperation({ summary: 'Soft-delete product request' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.productsService.remove(id, currentUser);
  }

  @Post(':id/submit')
  @Roles(Role.SUPPLIER)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Submit compliance documents and fields',
    description: 'Files: doc__{requirementId}. Body: fieldValues JSON array.',
  })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitProductDto,
    @CurrentUser() currentUser: JwtPayload,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.productsService.submit(id, dto, currentUser, files ?? []);
  }

  @Post(':id/approve')
  @Roles(Role.DISTRIBUTOR)
  @ApiOperation({ summary: 'Approve submitted product request' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.productsService.approve(id, currentUser);
  }

  @Post(':id/reject')
  @Roles(Role.DISTRIBUTOR)
  @ApiOperation({ summary: 'Reject submitted product request' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProductDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.productsService.reject(id, dto, currentUser);
  }
}
