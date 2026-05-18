import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserLifecycleStatus, UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../prisma/prisma.service';

export type JwtPayload = {
  sub: string;
  role: UserRole;
  refreshTokenVersion: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        refreshTokenVersion: true,
        isSuspended: true,
        isActive: true,
        lifecycleStatus: true,
      },
    });
    if (
      !user ||
      !user.isActive ||
      user.isSuspended ||
      user.lifecycleStatus === UserLifecycleStatus.DELETED
    ) {
      throw new UnauthorizedException('Invalid or inactive user');
    }
    if (user.refreshTokenVersion !== payload.refreshTokenVersion) {
      throw new UnauthorizedException('Session invalidated');
    }
    return { sub: user.id, role: user.role, refreshTokenVersion: user.refreshTokenVersion };
  }
}
