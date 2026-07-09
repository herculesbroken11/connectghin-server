import { Injectable } from '@nestjs/common';
import { MembershipStatus, MembershipType, SubscriptionStatus } from '@prisma/client';

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
          membershipType: true,
          membershipStatus: true,
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

    const isPremium =
      user?.membershipType === MembershipType.PREMIUM &&
      (user.membershipStatus === MembershipStatus.ACTIVE ||
        user.membershipStatus === MembershipStatus.TRIALING ||
        user.membershipStatus === MembershipStatus.PAST_DUE);

    return {
      isPremium,
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
