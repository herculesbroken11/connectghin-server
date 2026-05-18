import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<unknown> {
    return this.prisma.userSettings.findUnique({ where: { userId } });
  }

  update(userId: string, data: Record<string, boolean>): Promise<unknown> {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
