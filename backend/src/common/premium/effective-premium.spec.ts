import {
  hasActiveStorePremium,
  hasValidPremiumOverride,
  isEffectivePremium,
  resolvePremiumSource,
} from './effective-premium';
import { MembershipStatus, MembershipType } from '@prisma/client';

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
});
