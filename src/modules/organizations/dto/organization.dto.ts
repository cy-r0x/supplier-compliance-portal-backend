import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationMemberRole } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Retail Group' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    type: [String],
    description: 'At least one USER id to assign as MANAGER',
    example: ['uuid-manager-1'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  managerUserIds!: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional USER ids to assign as MEMBER',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberUserIds?: string[];
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Retail Group' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}

export class AddOrganizationMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: OrganizationMemberRole })
  @IsEnum(OrganizationMemberRole)
  role!: OrganizationMemberRole;
}

export class UpdateOrganizationMemberDto {
  @ApiProperty({ enum: OrganizationMemberRole })
  @IsEnum(OrganizationMemberRole)
  role!: OrganizationMemberRole;
}

export class UpdateOrganizationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  autoApproveProductRequests?: boolean;
}
