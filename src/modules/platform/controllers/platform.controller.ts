import {
  Body,
  Controller,
  Get,
  Patch,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../infrastructure/auth/decorators/auth.decorator';
import { PlatformService } from '../services/platform.service';

@ApiTags('platform')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get platform settings including seal images' })
  getSettings() {
    return this.platformService.getSettings();
  }

  @Patch('settings/seals')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'sealApproved', maxCount: 1 },
        { name: 'sealSubmitted', maxCount: 1 },
        { name: 'sealRejected', maxCount: 1 },
      ],
      { limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload or clear Swiss seal images (approved / submitted / rejected)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sealApproved: { type: 'string', format: 'binary' },
        sealSubmitted: { type: 'string', format: 'binary' },
        sealRejected: { type: 'string', format: 'binary' },
        clearApproved: { type: 'string', example: 'true' },
        clearSubmitted: { type: 'string', example: 'true' },
        clearRejected: { type: 'string', example: 'true' },
      },
    },
  })
  updateSeals(
    @UploadedFiles()
    files: {
      sealApproved?: Express.Multer.File[];
      sealSubmitted?: Express.Multer.File[];
      sealRejected?: Express.Multer.File[];
    },
    @Body()
    body: {
      clearApproved?: string;
      clearSubmitted?: string;
      clearRejected?: string;
    },
  ) {
    return this.platformService.updateSeals({
      sealApproved: files?.sealApproved?.[0],
      sealSubmitted: files?.sealSubmitted?.[0],
      sealRejected: files?.sealRejected?.[0],
      clearApproved: body.clearApproved === 'true' || body.clearApproved === '1',
      clearSubmitted:
        body.clearSubmitted === 'true' || body.clearSubmitted === '1',
      clearRejected: body.clearRejected === 'true' || body.clearRejected === '1',
    });
  }
}
