import { AuthProvider, MembershipStatus, MembershipType, UserLifecycleStatus } from '@prisma/client';

import {
  buildAdminUsersWhere,
  effectivePremiumWhere,
  hasActiveStorePremium,
  hasValidPremiumOverride,
  isEffectivePremium,
  resolvePremiumSource,
} from './effective-premium';

describe('effective premium', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');

  it('identifies free users', () => {
    expect(
      isEffectivePremium(
        { membershipType: MembershipType.FREE, membershipStatus: MembershipStatus.NONE },
        now,
      ),
    ).toBe(false);
  });

  it('identifies store premium', () => {
    expect(
      isEffectivePremium(
        { membershipType: MembershipType.PREMIUM, membershipStatus: MembershipStatus.ACTIVE },
        now,
      ),
    ).toBe(true);
    expect(
      hasActiveStorePremium({
        membershipType: MembershipType.PREMIUM,
        membershipStatus: MembershipStatus.CANCELED,
      }),
    ).toBe(false);
  });

  it('honors admin override', () => {
    expect(
      isEffectivePremium(
        {
          membershipType: MembershipType.FREE,
          membershipStatus: MembershipStatus.NONE,
          premiumOverride: true,
          premiumOverrideExpiresAt: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it('rejects expired override', () => {
    expect(
      hasValidPremiumOverride(
        {
          premiumOverride: true,
          premiumOverrideExpiresAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isEffectivePremium(
        {
          membershipType: MembershipType.FREE,
          membershipStatus: MembershipStatus.NONE,
          premiumOverride: true,
          premiumOverrideExpiresAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('prefers admin source when override is active even with store membership', () => {
    expect(
      resolvePremiumSource(
        {
          membershipType: MembershipType.PREMIUM,
          membershipStatus: MembershipStatus.ACTIVE,
          premiumOverride: true,
          latestSubscriptionProvider: 'APPLE_APP_STORE',
        },
        now,
      ),
    ).toBe('ADMIN');
  });

  it('counts trialing and past-due store membership as premium', () => {
    for (const status of [MembershipStatus.TRIALING, MembershipStatus.PAST_DUE]) {
      expect(
        isEffectivePremium(
          { membershipType: MembershipType.PREMIUM, membershipStatus: status },
          now,
        ),
      ).toBe(true);
    }
  });

  it('does not count cancelled or expired store membership', () => {
    for (const status of [MembershipStatus.CANCELED, MembershipStatus.EXPIRED, MembershipStatus.NONE]) {
      expect(
        isEffectivePremium(
          { membershipType: MembershipType.PREMIUM, membershipStatus: status },
          now,
        ),
      ).toBe(false);
      expect(
        hasActiveStorePremium({
          membershipType: MembershipType.PREMIUM,
          membershipStatus: status,
        }),
      ).toBe(false);
    }
  });

  it('keeps a valid admin override premium when the store subscription is cancelled', () => {
    expect(
      isEffectivePremium(
        {
          membershipType: MembershipType.PREMIUM,
          membershipStatus: MembershipStatus.CANCELED,
          premiumOverride: true,
          premiumOverrideExpiresAt: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      resolvePremiumSource(
        {
          membershipType: MembershipType.PREMIUM,
          membershipStatus: MembershipStatus.CANCELED,
          premiumOverride: true,
          latestSubscriptionProvider: 'GOOGLE_PLAY',
        },
        now,
      ),
    ).toBe('ADMIN');
    expect(
      hasActiveStorePremium({
        membershipType: MembershipType.PREMIUM,
        membershipStatus: MembershipStatus.CANCELED,
      }),
    ).toBe(false);
  });

  it('honors an override that has not reached its expiration', () => {
    expect(
      isEffectivePremium(
        {
          membershipType: MembershipType.FREE,
          membershipStatus: MembershipStatus.NONE,
          premiumOverride: true,
          premiumOverrideExpiresAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('rejects an override that expires at the current instant', () => {
    expect(
      isEffectivePremium(
        {
          membershipType: MembershipType.FREE,
          membershipStatus: MembershipStatus.NONE,
          premiumOverride: true,
          premiumOverrideExpiresAt: now,
        },
        now,
      ),
    ).toBe(false);
  });

  it('builds a premium where-clause for active store membership or an unexpired override', () => {
    expect(effectivePremiumWhere(now)).toEqual({
      OR: [
        {
          membershipType: MembershipType.PREMIUM,
          membershipStatus: {
            in: [MembershipStatus.ACTIVE, MembershipStatus.TRIALING, MembershipStatus.PAST_DUE],
          },
        },
        {
          premiumOverride: true,
          OR: [{ premiumOverrideExpiresAt: null }, { premiumOverrideExpiresAt: { gt: now } }],
        },
      ],
    });
  });

  it('filters the users list by effective premium without dropping search, auth provider, or deleted-user exclusion', () => {
    const notDeleted = { lifecycleStatus: { not: UserLifecycleStatus.DELETED } };
    const premium = buildAdminUsersWhere(
      notDeleted,
      {
        effectivePremium: true,
        authProvider: AuthProvider.APPLE,
        search: 'golfing',
        isGHINVerified: true,
      },
      now,
    );
    expect(premium.lifecycleStatus).toEqual({ not: UserLifecycleStatus.DELETED });
    expect(premium.authProvider).toBe(AuthProvider.APPLE);
    expect(premium.OR).toEqual([
      { email: { contains: 'golfing', mode: 'insensitive' } },
      { username: { contains: 'golfing', mode: 'insensitive' } },
    ]);
    expect(premium.profile).toEqual({ is: { isGHINVerified: true } });
    expect(premium.AND).toEqual([effectivePremiumWhere(now)]);
    expect(premium).not.toHaveProperty('membershipType');

    const free = buildAdminUsersWhere(notDeleted, { effectivePremium: false }, now);
    expect(free.AND).toEqual([{ NOT: effectivePremiumWhere(now) }]);
  });
});
