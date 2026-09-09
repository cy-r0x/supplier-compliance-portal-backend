import { createHash } from 'crypto';
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from '../dto/login.dto';
import { JwtPayload } from '../types/jwt-payload';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) { }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);

    return {
      message: 'Logged in successfully',
      data: tokens,
    };
  }

  async refresh(rawRefreshToken: string) {
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');

    try {
      await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.issueTokens(existing.user, existing.id);

    return {
      message: 'Token refreshed successfully',
      data: tokens,
    };
  }

  async logout(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (existing && !existing.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }

    return {
      message: 'Logged out successfully',
      data: null,
    };
  }

  private async issueTokens(
    user: User,
    previousTokenId?: string,
  ): Promise<AuthTokens> {
    const accessExpiresIn = this.config.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    );
    const refreshExpiresIn = this.config.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');

    const payload: JwtPayload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      photo: user.photo,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessExpiresIn as
        | `${number}s`
        | `${number}m`
        | `${number}h`
        | `${number}d`,
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, type: 'refresh' },
      {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as
          | `${number}s`
          | `${number}m`
          | `${number}h`
          | `${number}d`,
      },
    );

    const tokenHash = this.hashToken(refreshToken);
    const created = await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + this.expiresInToMs(refreshExpiresIn)),
      },
    });

    if (previousTokenId) {
      await this.prisma.refreshToken.update({
        where: { id: previousTokenId },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: created.id,
        },
      });
    }

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.expiresInToSeconds(accessExpiresIn),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private expiresInToSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) {
      return 900;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return amount * multipliers[unit];
  }

  private expiresInToMs(value: string): number {
    return this.expiresInToSeconds(value) * 1000;
  }
}
