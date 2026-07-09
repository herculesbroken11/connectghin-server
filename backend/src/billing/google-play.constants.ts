import { createHash } from 'crypto';

export const GOOGLE_PLAY_DEFAULT_PACKAGE = 'com.connectghin.app';

export const GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS = [
  'connectghin_monthly',
  'connectghin_yearly',
] as const;

export type GooglePlaySubscriptionProductId = (typeof GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS)[number];

export function isGooglePlaySubscriptionProductId(productId: string): productId is GooglePlaySubscriptionProductId {
  return (GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(productId);
}

export function hashPurchaseToken(purchaseToken: string): string {
  return createHash('sha256').update(purchaseToken).digest('hex');
}

export function redactPurchaseToken(purchaseToken: string): string {
  if (purchaseToken.length <= 12) return '***';
  return `${purchaseToken.slice(0, 6)}…${purchaseToken.slice(-4)}`;
}
