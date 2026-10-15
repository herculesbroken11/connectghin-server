import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BillingCycle,
  MembershipStatus,
  MembershipType,
  Prisma,
  SubscriptionProvider,
  SubscriptionStatus,
} from '@prisma/client';

import { IapVerificationService } from './iap-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { redactPurchaseToken } from '../billing/google-play.constants';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

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
      pendingProductId?: string;
      pendingBillingCycle?: BillingCycle;
      pendingEffectiveAt?: string;
      orderId?: string;
      purchaseTokenHash?: string;
      rawResponse?: Record<string, unknown>;
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

    const row = await this.findSubscriptionForEntitlement(userId, input);
    if (row && input.provider === 'APPLE_APP_STORE' && row.userId !== userId) {
      this.logger.warn(
        `IAP persist blocked provider=${input.provider} productId=${input.productId} reason=external_id_owned_by_another_user`,
      );
      throw new ConflictException('This App Store subscription is already linked to another account.');
    }

    const currentPeriodStart = input.currentPeriodStart ? new Date(input.currentPeriodStart) : null;
    const currentPeriodEnd = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null;
    const expiryDate = currentPeriodEnd;

    const data = {
      provider: input.provider as SubscriptionProvider,
      planCode: input.productId,
      billingCycle: input.billingCycle,
      status: input.status,
      storeProductId: input.productId,
      storeExternalId: input.externalSubscriptionId ?? null,
      purchaseTokenHash: input.purchaseTokenHash ?? null,
      orderId: input.orderId ?? null,
      currentPeriodStart,
      currentPeriodEnd,
      expiryDate,
      rawResponse: input.rawResponse ? (input.rawResponse as Prisma.InputJsonValue) : undefined,
      canceledAt: input.status === SubscriptionStatus.CANCELED ? new Date() : null,
      cancelAtPeriodEnd: input.status === SubscriptionStatus.CANCELED,
      ...(input.provider === 'APPLE_APP_STORE'
        ? {
            pendingStoreProductId: input.pendingProductId ?? null,
            pendingBillingCycle: input.pendingBillingCycle ?? null,
            pendingEffectiveAt: input.pendingEffectiveAt ? new Date(input.pendingEffectiveAt) : null,
          }
        : {}),
    };

    let saved: { id: string };
    try {
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
    } catch (error) {
      this.logPrismaFailure(error, input);
      throw error;
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

  async verifyAndSyncApple(
    userId: string,
    transactionId: string,
    signedTransactionInfo?: string,
  ): Promise<unknown> {
    const verified = await this.iapVerification.verifyApple(transactionId, signedTransactionInfo);
    return this.syncEntitlement(userId, verified);
  }

  async verifyAndSyncGoogle(
    userId: string,
    input: string | { purchaseToken: string; productId?: string; packageName?: string },
  ): Promise<unknown> {
    const payload =
      typeof input === 'string'
        ? { purchaseToken: input }
        : input;
    const verified = await this.iapVerification.verifyGoogle(payload);
    this.logger.log(
      `Google purchase verified userId=${userId} productId=${verified.productId} status=${verified.status} token=${verified.externalSubscriptionId ? redactPurchaseToken(verified.externalSubscriptionId) : 'n/a'}`,
    );
    return this.syncEntitlement(userId, verified);
  }

  async restoreGoogle(
    userId: string,
    input: { purchaseToken?: string; productId?: string; packageName?: string },
  ): Promise<unknown> {
    if (input.purchaseToken?.trim()) {
      const result = await this.verifyAndSyncGoogle(userId, {
        purchaseToken: input.purchaseToken.trim(),
        productId: input.productId?.trim(),
        packageName: input.packageName?.trim(),
      });
      return { ok: true, restored: true, ...((result as object) ?? {}) };
    }

    const latest = await this.prisma.subscription.findFirst({
      where: {
        userId,
        provider: SubscriptionProvider.GOOGLE_PLAY,
        storeExternalId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      select: { storeExternalId: true, storeProductId: true },
    });

    if (!latest?.storeExternalId) {
      return { ok: true, restored: false, message: 'No Google Play purchase token to restore' };
    }

    const result = await this.verifyAndSyncGoogle(userId, {
      purchaseToken: latest.storeExternalId,
      productId: latest.storeProductId ?? undefined,
      packageName: input.packageName?.trim(),
    });
    return { ok: true, restored: true, ...((result as object) ?? {}) };
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

  private findSubscriptionForEntitlement(
    userId: string,
    input: {
      provider: 'APPLE_APP_STORE' | 'GOOGLE_PLAY';
      productId: string;
      externalSubscriptionId?: string;
    },
  ) {
    if (input.provider === 'APPLE_APP_STORE' && input.externalSubscriptionId) {
      return this.prisma.subscription.findFirst({
        where: {
          provider: SubscriptionProvider.APPLE_APP_STORE,
          storeExternalId: input.externalSubscriptionId,
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        provider: input.provider as SubscriptionProvider,
        planCode: input.productId,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private logPrismaFailure(
    error: unknown,
    input: { provider: 'APPLE_APP_STORE' | 'GOOGLE_PLAY'; productId: string },
  ): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return;
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.join(',') : target != null ? String(target) : '';
    const model = typeof error.meta?.modelName === 'string' ? error.meta.modelName : 'Subscription';
    this.logger.error(
      `IAP persist failed code=${error.code} model=${model} target=${fields} provider=${input.provider} productId=${input.productId}`,
    );
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
      case SubscriptionStatus.EXPIRED:
      case SubscriptionStatus.REVOKED:
        membershipStatus = MembershipStatus.NONE;
        break;
      case SubscriptionStatus.PENDING:
        membershipStatus = MembershipStatus.TRIALING;
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
  pendingProductId?: string;
  pendingEffectiveAt?: string;
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
    input.pendingProductId ?? '-',
    input.pendingEffectiveAt ?? '-',
  ].join(':');
}
