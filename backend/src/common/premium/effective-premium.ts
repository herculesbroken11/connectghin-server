import { MembershipStatus, MembershipType } from '@prisma/client';

/** Fields needed to resolve effective Premium entitlement. */
export type PremiumUserFields = {
  membershipType?: MembershipType | null;
  membershipStatus?: MembershipStatus | null;
  premiumOverride?: boolean | null;
  premiumOverrideExpiresAt?: Date | null;
};

const STORE_ACTIVE: MembershipStatus[] = [
  MembershipStatus.ACTIVE,
  MembershipStatus.TRIALING,
  MembershipStatus.PAST_DUE,
];

/** Active App Store / Google Play (or synced) membership — does not include admin override. */
export function hasActiveStorePremium(user: PremiumUserFields): boolean {
  if (user.membershipType !== MembershipType.PREMIUM) return false;
  if (user.membershipStatus == null) return false;
  return STORE_ACTIVE.includes(user.membershipStatus);
}

/** Valid admin override that has not expired. */
export function hasValidPremiumOverride(user: PremiumUserFields, now: Date = new Date()): boolean {
  if (!user.premiumOverride) return false;
  if (user.premiumOverrideExpiresAt != null && user.premiumOverrideExpiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

/**
 * Authoritative Premium check for quotas, feed gates, and client-facing `isPremium`.
 * Store subscription and admin override are logically distinct; either grants access.
 */
export function isEffectivePremium(user: PremiumUserFields, now: Date = new Date()): boolean {
  return hasActiveStorePremium(user) || hasValidPremiumOverride(user, now);
}

export type PremiumSource = 'APP_STORE' | 'GOOGLE_PLAY' | 'ADMIN' | 'STORE' | 'NONE';

export function resolvePremiumSource(
  user: PremiumUserFields & { latestSubscriptionProvider?: string | null },
  now: Date = new Date(),
): PremiumSource {
  if (hasValidPremiumOverride(user, now)) return 'ADMIN';
  if (!hasActiveStorePremium(user)) return 'NONE';
  const p = (user.latestSubscriptionProvider ?? '').toUpperCase();
  if (p.includes('APPLE')) return 'APP_STORE';
  if (p.includes('GOOGLE')) return 'GOOGLE_PLAY';
  return 'STORE';
}

/** Select clause fragment for Prisma user queries that need premium resolution. */
export const PREMIUM_USER_SELECT = {
  membershipType: true,
  membershipStatus: true,
  premiumOverride: true,
  premiumOverrideExpiresAt: true,
} as const;
