import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { MembershipType, NotificationType, SwipeAction } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Free-tier cap on *new* profiles swiped per UTC day (PASS or LIKE). Changing an existing swipe does not consume another slot. */
export const FREE_DAILY_SWIPE_LIMIT = 10;

function startOfUtcDay(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

@Injectable()
export class SwipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getDailySwipeStatus(userId: string): Promise<{
    isPremium: boolean;
    dailyLimit: number | null;
    used: number;
    remaining: number | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { membershipType: true },
    });
    const premium = user?.membershipType === MembershipType.PREMIUM;
    const start = startOfUtcDay();
    const used = await this.prisma.swipe.count({
      where: { fromUserId: userId, createdAt: { gte: start } },
    });
    if (premium) {
      return { isPremium: true, dailyLimit: null, used, remaining: null };
    }
    const remaining = Math.max(0, FREE_DAILY_SWIPE_LIMIT - used);
    return {
      isPremium: false,
      dailyLimit: FREE_DAILY_SWIPE_LIMIT,
      used,
      remaining,
    };
  }

  async swipe(fromUserId: string, toUserId: string, action: SwipeAction): Promise<unknown> {
    if (fromUserId === toUserId) {
      throw new BadRequestException('Cannot swipe yourself');
    }

    const existing = await this.prisma.swipe.findUnique({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
    });
    if (!existing) {
      const user = await this.prisma.user.findUnique({
        where: { id: fromUserId },
        select: { membershipType: true },
      });
      if (user?.membershipType !== MembershipType.PREMIUM) {
        const start = startOfUtcDay();
        const countToday = await this.prisma.swipe.count({
          where: { fromUserId, createdAt: { gte: start } },
        });
        if (countToday >= FREE_DAILY_SWIPE_LIMIT) {
          throw new HttpException(
            {
              code: 'DAILY_SWIPE_LIMIT',
              limit: FREE_DAILY_SWIPE_LIMIT,
              used: countToday,
            },
            HttpStatus.FORBIDDEN,
          );
        }
      }
    }

    const swipe = await this.prisma.swipe.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      update: { action },
      create: { fromUserId, toUserId, action },
    });

    let matched = false;
    if (action === SwipeAction.LIKE) {
      const reciprocal = await this.prisma.swipe.findUnique({
        where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: fromUserId } },
      });
      if (reciprocal?.action === SwipeAction.LIKE) {
        const [userOneId, userTwoId] = [fromUserId, toUserId].sort();
        const priorMatch = await this.prisma.match.findUnique({
          where: { userOneId_userTwoId: { userOneId, userTwoId } },
          select: { isActive: true },
        });
        await this.prisma.match.upsert({
          where: { userOneId_userTwoId: { userOneId, userTwoId } },
          update: { isActive: true, unmatchedAt: null },
          create: { userOneId, userTwoId },
        });
        matched = true;
        const shouldNotify = !priorMatch || !priorMatch.isActive;
        if (shouldNotify) {
          const users = await this.prisma.user.findMany({
            where: { id: { in: [fromUserId, toUserId] } },
            select: { id: true, username: true },
          });
          const names = Object.fromEntries(users.map((u) => [u.id, u.username]));
          void this.notificationsService.createInAppAndPush(
            fromUserId,
            NotificationType.NEW_MATCH,
            'New match',
            `You matched with ${names[toUserId] ?? 'a golfer'}`,
            { matchedUserId: toUserId },
          );
          void this.notificationsService.createInAppAndPush(
            toUserId,
            NotificationType.NEW_MATCH,
            'New match',
            `You matched with ${names[fromUserId] ?? 'a golfer'}`,
            { matchedUserId: fromUserId },
          );
        }
      }
    }
    return { swipe, matched };
  }
}
