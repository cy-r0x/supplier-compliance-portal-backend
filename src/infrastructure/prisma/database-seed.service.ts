import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';

const ADMIN_EMAIL = 'admin@development.com';
const ADMIN_NAME = 'Super Admin';
const ADMIN_PASSWORD = 'admin';

@Injectable()
export class DatabaseSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const password = await bcrypt.hash(ADMIN_PASSWORD, 10);

    await this.prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      create: {
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        password,
        role: Role.SUPER_ADMIN,
      },
      update: {
        name: ADMIN_NAME,
        password,
        role: Role.SUPER_ADMIN,
      },
    });

    this.logger.log(`Seeded Super Admin (${ADMIN_EMAIL})`);
  }
}
