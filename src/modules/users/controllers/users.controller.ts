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
} from '../../../infrastructure/auth/decorators/auth.decorator';
import type { JwtPayload } from '../../../infrastructure/auth/types/jwt-payload';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UsersService } from '../services/users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({
    summary: 'List users',
    description:
      'SUPER_ADMIN: USER and SUPPLIER (optional role filter). USER manager: suppliers only.',
  })
  findAll(
    @CurrentUser() currentUser: JwtPayload,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.usersService.findAll(currentUser, query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile including organization' })
  getMe(@CurrentUser() currentUser: JwtPayload) {
    return this.usersService.getMe(currentUser);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.USER)
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create user',
    description:
      'SUPER_ADMIN can create USER or SUPPLIER. Org managers can create USER only.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'password', 'role'],
      properties: {
        name: { type: 'string', example: 'Jane Manager' },
        email: { type: 'string', format: 'email', example: 'jane@acme.com' },
        password: {
          type: 'string',
          minLength: 8,
          example: 'TempPass123!',
        },
        role: {
          type: 'string',
          enum: [Role.USER, Role.SUPPLIER],
        },
        photo: {
          type: 'string',
          format: 'binary',
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
  @ApiOperation({ summary: 'Update current user profile photo' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: {
        photo: { type: 'string', format: 'binary' },
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
