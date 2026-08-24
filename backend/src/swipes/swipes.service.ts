import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { NotificationType, SwipeAction } from '@prisma/client';

import { isEffectivePremium, PREMIUM_USER_SELECT } from '../common/premium/effective-premium';
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
  private readonly logger = new Logger(SwipesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async resolveDailyLimit(): Promise<number> {
    try {
      const row = await this.prisma.appSettings.findUnique({ where: { key: 'free_swipe_daily_limit' } });
      const raw = row?.valueJson;
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    } catch {
      /* fall through */
    }
    return FREE_DAILY_SWIPE_LIMIT;
  }

  async getDailySwipeStatus(userId: string): Promise<{
    isPremium: boolean;
    dailyLimit: number | null;
    used: number;
    remaining: number | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PREMIUM_USER_SELECT,
    });
    const premium = isEffectivePremium(user ?? {});
    const start = startOfUtcDay();
    const used = await this.prisma.swipe.count({
      where: { fromUserId: userId, createdAt: { gte: start } },
    });
    if (premium) {
      return { isPremium: true, dailyLimit: null, used, remaining: null };
    }
    const dailyLimit = await this.resolveDailyLimit();
    const remaining = Math.max(0, dailyLimit - used);
    return {
      isPremium: false,
      dailyLimit,
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

    const user = await this.prisma.user.findUnique({
      where: { id: fromUserId },
      select: PREMIUM_USER_SELECT,
    });
    const premium = isEffectivePremium(user ?? {});
    const dailyLimit = premium ? null : await this.resolveDailyLimit();
    const start = startOfUtcDay();
    let quotaBefore: number | null = null;

    if (!existing && !premium) {
      const countToday = await this.prisma.swipe.count({
        where: { fromUserId, createdAt: { gte: start } },
      });
      quotaBefore = countToday;
      if (countToday >= (dailyLimit ?? FREE_DAILY_SWIPE_LIMIT)) {
        this.logger.log(
          `connect_request userId=${fromUserId} targetUserId=${toUserId} premium=false quotaBefore=${countToday} result=LIKE_LIMIT_REACHED`,
        );
        throw new HttpException(
          {
            code: 'LIKE_LIMIT_REACHED',
            // Backward-compatible alias used by older clients
            legacyCode: 'DAILY_SWIPE_LIMIT',
            limit: dailyLimit ?? FREE_DAILY_SWIPE_LIMIT,
            used: countToday,
            remainingLikes: 0,
            premiumRequired: true,
            success: false,
          },
          HttpStatus.FORBIDDEN,
        );
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

    const usedAfter = await this.prisma.swipe.count({
      where: { fromUserId, createdAt: { gte: start } },
    });
    const remainingLikes = premium ? null : Math.max(0, (dailyLimit ?? FREE_DAILY_SWIPE_LIMIT) - usedAfter);
    const connectionStatus =
      action === SwipeAction.LIKE ? (matched ? 'matched' : existing ? 'updated' : 'requested') : 'passed';

    this.logger.log(
      `connect_request userId=${fromUserId} targetUserId=${toUserId} premium=${premium} quotaBefore=${quotaBefore ?? 'n/a'} result=${connectionStatus} duplicate=${Boolean(existing)}`,
    );

    return {
      success: true,
      swipe,
      matched,
      connectionStatus,
      remainingLikes,
      isPremium: premium,
    };
  }
}
