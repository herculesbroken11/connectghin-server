import { ConflictException } from '@nestjs/common';
import { BillingCycle, Prisma, SubscriptionStatus } from '@prisma/client';

import { SubscriptionsService } from './subscriptions.service';

const USER_ID = 'user-qa';
const OTHER_USER_ID = 'user-other';
const ORIGINAL_TX = '2000001245857646';
const NEW_TX = '2000001999000001';

type Entitlement = {
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
};

function apple(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    provider: 'APPLE_APP_STORE',
    productId: 'connectghin_yearly',
    externalSubscriptionId: ORIGINAL_TX,
    billingCycle: BillingCycle.YEARLY,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: '2026-10-15T17:41:43.000Z',
    currentPeriodEnd: '2027-10-15T17:41:43.000Z',
    ...overrides,
  };
}

function monthlyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-monthly',
    userId: USER_ID,
    provider: 'APPLE_APP_STORE',
    status: SubscriptionStatus.CANCELED,
    planCode: 'connectghin_monthly',
    storeProductId: 'connectghin_monthly',
    storeExternalId: ORIGINAL_TX,
    billingCycle: BillingCycle.MONTHLY,
    pendingStoreProductId: null,
    pendingBillingCycle: null,
    pendingEffectiveAt: null,
    ...overrides,
  };
}

describe('Apple entitlement persistence', () => {
  const subscription = {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const paymentEvent = {
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  const user = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { subscription, paymentEvent, user };
  const service = new SubscriptionsService(prisma as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    user.findUnique.mockResolvedValue({ id: USER_ID });
    paymentEvent.findFirst.mockResolvedValue(null);
    paymentEvent.create.mockResolvedValue({ id: 'event-1' });
    subscription.update.mockResolvedValue({ id: 'sub-monthly' });
    subscription.create.mockResolvedValue({ id: 'sub-new' });
    user.update.mockResolvedValue({ id: USER_ID });
  });

  it('updates a canceled Monthly row when Yearly is active on the same original transaction', async () => {
    subscription.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.storeExternalId === ORIGINAL_TX) return monthlyRow();
      return {
        ...monthlyRow(),
        status: SubscriptionStatus.ACTIVE,
        planCode: 'connectghin_yearly',
        storeProductId: 'connectghin_yearly',
        billingCycle: BillingCycle.YEARLY,
      };
    });

    await service.syncEntitlement(USER_ID, apple());

    expect(subscription.create).not.toHaveBeenCalled();
    expect(subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-monthly' },
        data: expect.objectContaining({
          planCode: 'connectghin_yearly',
          storeProductId: 'connectghin_yearly',
          billingCycle: BillingCycle.YEARLY,
          status: SubscriptionStatus.ACTIVE,
          storeExternalId: ORIGINAL_TX,
          pendingStoreProductId: null,
          pendingBillingCycle: null,
          pendingEffectiveAt: null,
        }),
      }),
    );
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membershipType: 'PREMIUM',
          membershipStatus: 'ACTIVE',
        }),
      }),
    );
  });

  it('keeps Monthly current and stores Yearly as a pending plan change', async () => {
    subscription.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.storeExternalId === ORIGINAL_TX) {
        return monthlyRow({ status: SubscriptionStatus.ACTIVE });
      }
      return monthlyRow({ status: SubscriptionStatus.ACTIVE });
    });

    await service.syncEntitlement(
      USER_ID,
      apple({
        productId: 'connectghin_monthly',
        billingCycle: BillingCycle.MONTHLY,
        pendingProductId: 'connectghin_yearly',
        pendingBillingCycle: BillingCycle.YEARLY,
        pendingEffectiveAt: '2026-10-13T17:41:43.000Z',
      }),
    );

    expect(subscription.create).not.toHaveBeenCalled();
    expect(subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeProductId: 'connectghin_monthly',
          billingCycle: BillingCycle.MONTHLY,
          status: SubscriptionStatus.ACTIVE,
          pendingStoreProductId: 'connectghin_yearly',
          pendingBillingCycle: BillingCycle.YEARLY,
          pendingEffectiveAt: new Date('2026-10-13T17:41:43.000Z'),
        }),
      }),
    );
  });

  it('promotes Yearly to the current product and clears pending fields after renewal', async () => {
    subscription.findFirst.mockResolvedValue(
      monthlyRow({
        status: SubscriptionStatus.ACTIVE,
        pendingStoreProductId: 'connectghin_yearly',
        pendingBillingCycle: BillingCycle.YEARLY,
      }),
    );

    await service.syncEntitlement(USER_ID, apple());

    expect(subscription.create).not.toHaveBeenCalled();
    expect(subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeProductId: 'connectghin_yearly',
          billingCycle: BillingCycle.YEARLY,
          status: SubscriptionStatus.ACTIVE,
          pendingStoreProductId: null,
          pendingBillingCycle: null,
          pendingEffectiveAt: null,
        }),
      }),
    );
  });

  it('does not write again when the same verified entitlement was already applied', async () => {
    paymentEvent.findFirst.mockResolvedValue({ id: 'event-existing' });

    await expect(service.syncEntitlement(USER_ID, apple())).resolves.toEqual({
      ok: true,
      idempotent: true,
    });
    expect(subscription.findFirst).not.toHaveBeenCalled();
    expect(subscription.update).not.toHaveBeenCalled();
    expect(subscription.create).not.toHaveBeenCalled();
  });

  it('creates Premium for a Free user when Yearly has a new original transaction id', async () => {
    subscription.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.storeExternalId === NEW_TX) return null;
      return {
        id: 'sub-new',
        userId: USER_ID,
        status: SubscriptionStatus.ACTIVE,
        planCode: 'connectghin_yearly',
        storeProductId: 'connectghin_yearly',
        billingCycle: BillingCycle.YEARLY,
      };
    });

    await service.syncEntitlement(USER_ID, apple({ externalSubscriptionId: NEW_TX }));

    expect(subscription.update).not.toHaveBeenCalled();
    expect(subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          storeExternalId: NEW_TX,
          storeProductId: 'connectghin_yearly',
          status: SubscriptionStatus.ACTIVE,
        }),
      }),
    );
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membershipType: 'PREMIUM',
          membershipStatus: 'ACTIVE',
        }),
      }),
    );
  });

  it('still matches Google Play subscriptions by user and plan, not Apple transaction id', async () => {
    subscription.findFirst.mockResolvedValue(null);

    await service.syncEntitlement(USER_ID, {
      provider: 'GOOGLE_PLAY',
      productId: 'connectghin_yearly',
      externalSubscriptionId: 'google-purchase-token',
      billingCycle: BillingCycle.YEARLY,
      status: SubscriptionStatus.ACTIVE,
    });

    expect(subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: USER_ID,
          provider: 'GOOGLE_PLAY',
          planCode: 'connectghin_yearly',
        },
      }),
    );
    expect(subscription.create).toHaveBeenCalled();
    const created = subscription.create.mock.calls[0][0].data;
    expect(created.pendingStoreProductId).toBeUndefined();
  });

  it('does not move an Apple subscription onto a different ConnectGHIN user', async () => {
    subscription.findFirst.mockResolvedValue(monthlyRow({ userId: OTHER_USER_ID }));

    await expect(service.syncEntitlement(USER_ID, apple())).rejects.toBeInstanceOf(ConflictException);
    expect(subscription.update).not.toHaveBeenCalled();
    expect(subscription.create).not.toHaveBeenCalled();
  });

  it('logs a Prisma unique failure without the transaction id', async () => {
    subscription.findFirst.mockResolvedValue(null);
    subscription.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { modelName: 'Subscription', target: ['storeExternalId'] },
      }),
    );
    const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    await expect(service.syncEntitlement(USER_ID, apple())).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    const line = String(errorSpy.mock.calls[0]?.[0]);
    expect(line).toContain('code=P2002');
    expect(line).toContain('model=Subscription');
    expect(line).toContain('target=storeExternalId');
    expect(line).toContain('productId=connectghin_yearly');
    expect(line).toContain('provider=APPLE_APP_STORE');
    expect(line).not.toContain(ORIGINAL_TX);
  });
});
