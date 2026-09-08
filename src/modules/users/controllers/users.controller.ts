import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  CurrentUser,
  Roles,
} from 'src/infrastructure/auth/decorators/auth.decorator';
import type { JwtPayload } from 'src/infrastructure/auth/types/jwt-payload';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UsersService } from '../services/users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.DISTRIBUTOR)
  @ApiOperation({
    summary: 'List users',
    description:
      'SUPER_ADMIN: all distributors/suppliers (optional role filter). DISTRIBUTOR: suppliers only.',
  })
  findAll(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.usersService.findAll(currentUser, query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() currentUser: JwtPayload) {
    return this.usersService.getMe(currentUser);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.DISTRIBUTOR)
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create user',
    description:
      'SUPER_ADMIN can create DISTRIBUTOR or SUPPLIER. DISTRIBUTOR can create SUPPLIER only. Profile photo is accepted via Multer but ignored for now.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'password', 'role'],
      properties: {
        name: { type: 'string', example: 'Acme Distribution' },
        email: { type: 'string', format: 'email', example: 'dist@acme.com' },
        password: {
          type: 'string',
          minLength: 8,
          example: 'TempPass123!',
        },
        role: {
          type: 'string',
          enum: [Role.DISTRIBUTOR, Role.SUPPLIER],
        },
        photo: {
          type: 'string',
          format: 'binary',
          description: 'Optional profile photo (ignored for now)',
        },
      },
    },
  })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentUser: JwtPayload,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return await this.usersService.create(createUserDto, currentUser, photo);
  }

  @Patch('me/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update current user profile photo',
    description: 'Any authenticated user can upload a new profile photo.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: {
        photo: {
          type: 'string',
          format: 'binary',
          description: 'Profile photo image file',
        },
      },
    },
  })
  async updateMyPhoto(
    @CurrentUser() currentUser: JwtPayload,
    @UploadedFile() photo: Express.Multer.File,
  ) {
    return await this.usersService.updateMyPhoto(currentUser, photo);
  }
}
