import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingCycle,
  MembershipStatus,
  MembershipType,
  SubscriptionProvider,
  SubscriptionStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { IapVerificationService } from './iap-verification.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iapVerification: IapVerificationService,
  ) {}

  me(userId: string): Promise<unknown> {
    return this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async syncEntitlement(
    userId: string,
    input: {
      provider: 'APPLE_APP_STORE' | 'GOOGLE_PLAY';
      productId: string;
      externalSubscriptionId?: string;
      billingCycle: BillingCycle;
      status: SubscriptionStatus;
      currentPeriodStart?: string;
      currentPeriodEnd?: string;
    },
  ): Promise<unknown> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const idempotencyKey = buildIapIdempotencyKey(input);
    const alreadyApplied = await this.prisma.paymentEvent.findFirst({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (alreadyApplied) {
      return { ok: true, idempotent: true };
    }

    const row = await this.prisma.subscription.findFirst({
      where: {
        userId,
        provider: input.provider as SubscriptionProvider,
        planCode: input.productId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const currentPeriodStart = input.currentPeriodStart ? new Date(input.currentPeriodStart) : null;
    const currentPeriodEnd = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null;

    const data = {
      provider: input.provider as SubscriptionProvider,
      planCode: input.productId,
      billingCycle: input.billingCycle,
      status: input.status,
      storeProductId: input.productId,
      storeExternalId: input.externalSubscriptionId ?? null,
      currentPeriodStart,
      currentPeriodEnd,
      canceledAt: input.status === SubscriptionStatus.CANCELED ? new Date() : null,
      cancelAtPeriodEnd: input.status === SubscriptionStatus.CANCELED,
    };

    let saved: { id: string };
    if (row) {
      saved = await this.prisma.subscription.update({
        where: { id: row.id },
        data,
        select: { id: true },
      });
    } else {
      saved = await this.prisma.subscription.create({
        data: {
          userId,
          ...data,
        },
        select: { id: true },
      });
    }

    await this.prisma.paymentEvent.create({
      data: {
        userId,
        subscriptionId: saved.id,
        idempotencyKey,
        eventType: 'iap.entitlement.sync',
        payloadJson: {
          provider: input.provider,
          productId: input.productId,
          externalSubscriptionId: input.externalSubscriptionId ?? null,
          billingCycle: input.billingCycle,
          status: input.status,
          currentPeriodStart: input.currentPeriodStart ?? null,
          currentPeriodEnd: input.currentPeriodEnd ?? null,
        } satisfies Prisma.InputJsonValue,
      },
    });

    await this.syncUserMembership(userId);
    return { ok: true };
  }

  async verifyAndSyncApple(userId: string, transactionId: string): Promise<unknown> {
    const verified = await this.iapVerification.verifyApple(transactionId);
    return this.syncEntitlement(userId, verified);
  }

  async verifyAndSyncGoogle(userId: string, purchaseToken: string): Promise<unknown> {
    const verified = await this.iapVerification.verifyGoogle(purchaseToken);
    return this.syncEntitlement(userId, verified);
  }

  async processAppleServerNotification(originalTransactionId: string): Promise<{ ok: true; processed: boolean }> {
    const row = await this.prisma.subscription.findFirst({
      where: {
        provider: SubscriptionProvider.APPLE_APP_STORE,
        storeExternalId: originalTransactionId,
      },
      select: { userId: true },
    });
    if (!row) return { ok: true, processed: false };
    await this.verifyAndSyncApple(row.userId, originalTransactionId);
    return { ok: true, processed: true };
  }

  async processGoogleServerNotification(purchaseToken: string): Promise<{ ok: true; processed: boolean }> {
    const row = await this.prisma.subscription.findFirst({
      where: {
        provider: SubscriptionProvider.GOOGLE_PLAY,
        storeExternalId: purchaseToken,
      },
      select: { userId: true },
    });
    if (!row) return { ok: true, processed: false };
    await this.verifyAndSyncGoogle(row.userId, purchaseToken);
    return { ok: true, processed: true };
  }

  /**
   * Cancel is now local-only and store-agnostic.
   * The client should direct users to App Store / Play Store subscription management.
   */
  async cancel(userId: string): Promise<{ ok: true }> {
    await this.prisma.subscription.updateMany({
      where: {
        userId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE] },
      },
      data: {
        status: SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      },
    });
    await this.syncUserMembership(userId);
    return { ok: true };
  }

  private async syncUserMembership(userId: string): Promise<void> {
    const latest = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!latest) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          membershipType: MembershipType.FREE,
          membershipStatus: MembershipStatus.NONE,
        },
      });
      return;
    }

    const status = latest.status;
    const premium =
      status === SubscriptionStatus.ACTIVE ||
      status === SubscriptionStatus.TRIALING ||
      status === SubscriptionStatus.PAST_DUE;

    let membershipStatus: MembershipStatus = MembershipStatus.NONE;
    switch (status) {
      case SubscriptionStatus.TRIALING:
        membershipStatus = MembershipStatus.TRIALING;
        break;
      case SubscriptionStatus.ACTIVE:
        membershipStatus = MembershipStatus.ACTIVE;
        break;
      case SubscriptionStatus.PAST_DUE:
        membershipStatus = MembershipStatus.PAST_DUE;
        break;
      case SubscriptionStatus.CANCELED:
        membershipStatus = MembershipStatus.CANCELED;
        break;
      default:
        membershipStatus = MembershipStatus.NONE;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        membershipType: premium ? MembershipType.PREMIUM : MembershipType.FREE,
        membershipStatus,
      },
    });
  }
}

function buildIapIdempotencyKey(input: {
  provider: 'APPLE_APP_STORE' | 'GOOGLE_PLAY';
  productId: string;
  externalSubscriptionId?: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}): string {
  return [
    'iap',
    input.provider,
    input.productId,
    input.externalSubscriptionId ?? '-',
    input.billingCycle,
    input.status,
    input.currentPeriodStart ?? '-',
    input.currentPeriodEnd ?? '-',
  ].join(':');
}
