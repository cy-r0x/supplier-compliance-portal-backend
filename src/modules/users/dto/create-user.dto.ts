import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const CREATEABLE_USER_ROLES = [Role.DISTRIBUTOR, Role.SUPPLIER] as const;
export type CreateableUserRole = (typeof CREATEABLE_USER_ROLES)[number];

export class CreateUserDto {
  @ApiProperty({ example: 'Acme Distribution' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'dist@acme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'TempPass123!',
    minLength: 8,
    description: 'Temporary password for the new user',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    enum: CREATEABLE_USER_ROLES,
    example: Role.DISTRIBUTOR,
    description: 'SUPER_ADMIN cannot be created via this endpoint',
  })
  @IsIn(CREATEABLE_USER_ROLES, {
    message: `role must be one of: ${CREATEABLE_USER_ROLES.join(', ')}`,
  })
  role!: CreateableUserRole;


  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Optional profile photo (ignored for now)',
  })
  @IsOptional()
  photo?: Express.Multer.File;
}
