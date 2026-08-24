import { Injectable } from '@nestjs/common';
import { MembershipStatus, MembershipType, SubscriptionStatus } from '@prisma/client';

import {
  isEffectivePremium,
  PREMIUM_USER_SELECT,
  resolvePremiumSource,
} from '../common/premium/effective-premium';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async me(userId: string): Promise<unknown> {
    const [user, subscription] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          ...PREMIUM_USER_SELECT,
        },
      }),
      this.prisma.subscription.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          provider: true,
          storeProductId: true,
          planCode: true,
          billingCycle: true,
          status: true,
          orderId: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          expiryDate: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const isPremium = isEffectivePremium(user ?? {});
    const premiumSource = resolvePremiumSource({
      ...(user ?? {}),
      latestSubscriptionProvider: subscription?.provider ?? null,
    });

    return {
      isPremium,
      premiumSource,
      premiumOverride: user?.premiumOverride === true,
      premiumOverrideExpiresAt: user?.premiumOverrideExpiresAt ?? null,
      membershipType: user?.membershipType ?? MembershipType.FREE,
      membershipStatus: user?.membershipStatus ?? MembershipStatus.NONE,
      subscription,
    };
  }

  verifyGoogle(
    userId: string,
    input: { purchaseToken: string; productId: string; packageName?: string },
  ): Promise<unknown> {
    return this.subscriptionsService.verifyAndSyncGoogle(userId, input);
  }

  restoreGoogle(
    userId: string,
    input: { purchaseToken?: string; productId?: string; packageName?: string },
  ): Promise<unknown> {
    return this.subscriptionsService.restoreGoogle(userId, input);
  }
}

export function isPremiumSubscriptionStatus(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.TRIALING ||
    status === SubscriptionStatus.PAST_DUE
  );
}
