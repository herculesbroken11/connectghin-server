import { Injectable } from '@nestjs/common';
import { DevicePlatform, NotificationType, Prisma } from '@prisma/client';

import { PushService } from '../push/push.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  list(userId: string): Promise<unknown> {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async markRead(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { ok: true };
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { ok: true };
  }

  registerDeviceToken(userId: string, token: string, platform: DevicePlatform): Promise<unknown> {
    return this.prisma.deviceToken.upsert({
      where: { userId_token: { userId, token } },
      update: { platform },
      create: { userId, token, platform },
    });
  }

  async unregisterDeviceToken(userId: string, token: string): Promise<{ ok: true }> {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { ok: true };
  }

  /** Persists in-app notification and sends FCM to mobile tokens when Firebase is configured. */
  async createInAppAndPush(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    dataJson: Prisma.InputJsonValue | null,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        dataJson: dataJson ?? undefined,
      },
    });
    const pushData = {
      type,
      ...flattenDataJsonForFcm(dataJson),
    };
    await this.pushService.sendToUser(userId, title, body, pushData);
  }
}

function flattenDataJsonForFcm(dataJson: Prisma.InputJsonValue | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (dataJson === null || dataJson === undefined) {
    return out;
  }
  if (typeof dataJson !== 'object' || Array.isArray(dataJson)) {
    return out;
  }
  for (const [key, value] of Object.entries(dataJson as Record<string, unknown>)) {
    if (value !== undefined && value !== null) {
      out[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }
  return out;
}
