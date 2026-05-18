import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  me(userId: string): Promise<unknown> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, privacySettings: true, userSettings: true },
    });
  }

  updateMe(userId: string, data: { username?: string }): Promise<unknown> {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async usernameAvailable(currentUserId: string, raw: string): Promise<{ available: boolean }> {
    const username = raw.trim();
    if (username.length < 3 || username.length > 30) {
      return { available: false };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { available: false };
    }
    const existing = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!existing) {
      return { available: true };
    }
    if (existing.id === currentUserId) {
      return { available: true };
    }
    return { available: false };
  }
}
