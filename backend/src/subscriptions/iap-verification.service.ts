import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { createPrivateKey, createSign } from 'crypto';

type VerifiedEntitlement = {
  provider: 'APPLE_APP_STORE' | 'GOOGLE_PLAY';
  productId: string;
  externalSubscriptionId?: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
};

@Injectable()
export class IapVerificationService {
  constructor(private readonly config: ConfigService) {}

  async verifyApple(transactionId: string): Promise<VerifiedEntitlement> {
    const token = this.buildAppleJwt();
    const prod = await this.fetchAppleSubscription(
      `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`,
      token,
    ).catch(async () =>
      this.fetchAppleSubscription(
        `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`,
        token,
      ),
    );

    const entries = asArray((prod as Record<string, unknown>).data);
    const entry = (entries[0] ?? {}) as Record<string, unknown>;
    const lastTransactions = asArray(entry.lastTransactions);
    const tx = (lastTransactions[0] ?? {}) as Record<string, unknown>;
    const decoded = asString(tx.signedTransactionInfo)
      ? decodeUnsignedJwtPayload(asString(tx.signedTransactionInfo) as string)
      : null;
    const productId = asString(decoded?.productId) ?? asString(tx.productId);
    const originalTransactionId =
      asString(decoded?.originalTransactionId) ?? asString(tx.originalTransactionId) ?? transactionId;
    const purchaseMs = asNumber(decoded?.purchaseDate);
    const expiresMs = asNumber(decoded?.expiresDate);
    const statusCode = asNumber(tx.status) ?? asNumber(entry.status) ?? 2;

    if (!productId) {
      throw new UnauthorizedException('Apple verification failed: missing productId');
    }
    this.assertAllowedProduct('APPLE_APP_STORE', productId);

    return {
      provider: 'APPLE_APP_STORE',
      productId,
      externalSubscriptionId: originalTransactionId,
      billingCycle: inferBillingCycle(productId),
      status: mapAppleStatus(statusCode),
      currentPeriodStart: purchaseMs ? new Date(purchaseMs).toISOString() : undefined,
      currentPeriodEnd: expiresMs ? new Date(expiresMs).toISOString() : undefined,
    };
  }

  async verifyGoogle(purchaseToken: string): Promise<VerifiedEntitlement> {
    const packageName = this.config.get<string>('GOOGLE_PLAY_PACKAGE_NAME')?.trim();
    if (!packageName) {
      throw new UnauthorizedException('Missing GOOGLE_PLAY_PACKAGE_NAME');
    }
    const accessToken = await this.getGoogleAccessToken();
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      throw new UnauthorizedException(`Google verification failed (${res.status})`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const lineItems = asArray(data.lineItems);
    const item = (lineItems[0] ?? {}) as Record<string, unknown>;
    const productId = asString(item.productId);
    const startMs = asRfc3339Ms(asString(item.startTime));
    const endMs = asRfc3339Ms(asString(item.expiryTime));
    const state = asString(data.subscriptionState) ?? 'SUBSCRIPTION_STATE_EXPIRED';

    if (!productId) {
      throw new UnauthorizedException('Google verification failed: missing productId');
    }
    this.assertAllowedProduct('GOOGLE_PLAY', productId);

    return {
      provider: 'GOOGLE_PLAY',
      productId,
      externalSubscriptionId: purchaseToken,
      billingCycle: inferBillingCycle(productId),
      status: mapGoogleState(state),
      currentPeriodStart: startMs ? new Date(startMs).toISOString() : undefined,
      currentPeriodEnd: endMs ? new Date(endMs).toISOString() : undefined,
    };
  }

  private async fetchAppleSubscription(url: string, token: string): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      throw new UnauthorizedException(`Apple verification failed (${res.status})`);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  private buildAppleJwt(): string {
    const issuerId = this.config.get<string>('APPLE_IAP_ISSUER_ID')?.trim();
    const keyId = this.config.get<string>('APPLE_IAP_KEY_ID')?.trim();
    const bundleId = this.config.get<string>('APPLE_IAP_BUNDLE_ID')?.trim();
    const privateKeyRaw = this.config.get<string>('APPLE_IAP_PRIVATE_KEY') ?? '';
    if (!issuerId || !keyId || !bundleId || !privateKeyRaw.trim()) {
      throw new UnauthorizedException('Missing Apple IAP credentials');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlJson({ alg: 'ES256', kid: keyId, typ: 'JWT' });
    const payload = base64UrlJson({
      iss: issuerId,
      iat: now,
      exp: now + 300,
      aud: 'appstoreconnect-v1',
      bid: bundleId,
    });
    const unsignedToken = `${header}.${payload}`;
    const privateKey = createPrivateKey(normalizePem(privateKeyRaw));
    const signer = createSign('sha256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(privateKey);
    return `${unsignedToken}.${toBase64Url(signature)}`;
  }

  private async getGoogleAccessToken(): Promise<string> {
    const clientEmail = this.config.get<string>('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL')?.trim();
    const privateKeyRaw = this.config.get<string>('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY') ?? '';
    if (!clientEmail || !privateKeyRaw.trim()) {
      throw new UnauthorizedException('Missing Google Play service account credentials');
    }
    const privateKey = createPrivateKey(normalizePem(privateKeyRaw));
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
    const payload = base64UrlJson({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    });
    const unsignedToken = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(privateKey);
    const assertion = `${unsignedToken}.${toBase64Url(signature)}`;
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException(`Google token request failed (${tokenRes.status})`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new UnauthorizedException('Google token response missing access_token');
    }
    return tokenJson.access_token;
  }

  private assertAllowedProduct(provider: 'APPLE_APP_STORE' | 'GOOGLE_PLAY', productId: string): void {
    const key =
      provider === 'APPLE_APP_STORE'
        ? 'APPLE_IAP_ALLOWED_PRODUCT_IDS'
        : 'GOOGLE_PLAY_ALLOWED_PRODUCT_IDS';
    const raw = this.config.get<string>(key)?.trim();
    if (!raw) return;
    const allowed = new Set(
      raw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    );
    if (!allowed.has(productId)) {
      throw new UnauthorizedException(`Product ${productId} is not allowed for ${provider}`);
    }
  }
}

function mapAppleStatus(statusCode: number): SubscriptionStatus {
  if (statusCode === 1) return SubscriptionStatus.ACTIVE;
  if (statusCode === 4 || statusCode === 3) return SubscriptionStatus.PAST_DUE;
  if (statusCode === 2 || statusCode === 5) return SubscriptionStatus.CANCELED;
  return SubscriptionStatus.CANCELED;
}

function mapGoogleState(state: string): SubscriptionStatus {
  switch (state) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return SubscriptionStatus.ACTIVE;
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return SubscriptionStatus.PAST_DUE;
    case 'SUBSCRIPTION_STATE_CANCELED':
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return SubscriptionStatus.CANCELED;
    default:
      return SubscriptionStatus.CANCELED;
  }
}

function inferBillingCycle(productId: string): BillingCycle {
  const lower = productId.toLowerCase();
  if (lower.includes('year') || lower.includes('annual')) return BillingCycle.YEARLY;
  return BillingCycle.MONTHLY;
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}

function base64UrlJson(value: unknown): string {
  return toBase64Url(Buffer.from(JSON.stringify(value), 'utf8'));
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeUnsignedJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRfc3339Ms(v: string | null): number | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

