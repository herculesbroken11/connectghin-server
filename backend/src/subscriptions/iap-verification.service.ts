import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { createPrivateKey, createSign } from 'crypto';
import { readFileSync } from 'fs';

import {
  GOOGLE_PLAY_DEFAULT_PACKAGE,
  GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS,
  hashPurchaseToken,
  isGooglePlaySubscriptionProductId,
  redactPurchaseToken,
} from '../billing/google-play.constants';
import { verifyAppleStoreKitJws } from './apple-storekit-jws.verifier';

type VerifiedEntitlement = {
  provider: 'APPLE_APP_STORE' | 'GOOGLE_PLAY';
  productId: string;
  externalSubscriptionId?: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  orderId?: string;
  purchaseTokenHash?: string;
  rawResponse?: Record<string, unknown>;
};

/** App Store Server API: transaction id is not in this environment. */
export const APPLE_TRANSACTION_ID_NOT_FOUND = 4040010;

const APPLE_PRODUCTION_HOST = 'https://api.storekit.apple.com';
const APPLE_SANDBOX_HOST = 'https://api.storekit-sandbox.apple.com';
const APPLE_SUBSCRIPTION_PRODUCT_IDS = ['connectghin_monthly', 'connectghin_yearly'] as const;

type AppleApiEnvironment = 'Production' | 'Sandbox';

type AppleApiResult = {
  environment: AppleApiEnvironment;
  httpStatus: number;
  errorCode: number | null;
  body: Record<string, unknown> | null;
};

@Injectable()
export class IapVerificationService {
  private readonly logger = new Logger(IapVerificationService.name);

  constructor(private readonly config: ConfigService) {}

  async verifyApple(transactionId: string, signedTransactionInfo?: string): Promise<VerifiedEntitlement> {
    const id = normalizeAppleTransactionId(transactionId);
    const txSuffix = appleTransactionIdSuffix(id ?? '');
    if (!id) {
      this.logger.warn(`Apple verify txSuffix=${txSuffix || 'none'} result=invalid_transaction_id`);
      throw new BadRequestException('Apple verification failed: missing transactionId');
    }

    const token = this.buildAppleJwt();
    const expectedBundleId = this.config.get<string>('APPLE_IAP_BUNDLE_ID')?.trim() ?? '';
    let result = await this.fetchAppleSubscription('Production', id, token);
    if (shouldRetryAppleSandbox(result.httpStatus, result.errorCode)) {
      this.logger.log(
        `Apple verify environment=Production errorCode=${result.errorCode ?? 'none'} txSuffix=${txSuffix} result=retry_sandbox`,
      );
      result = await this.fetchAppleSubscription('Sandbox', id, token);
    }

    let rejection: BadRequestException | null = null;
    if (result.httpStatus >= 200 && result.httpStatus < 300 && result.body) {
      try {
        const entitlement = this.parseAppleSubscription(result.body, id, expectedBundleId);
        if (isGrantedAppleStatus(entitlement.status)) {
          this.logger.log(
            `Apple verify environment=${result.environment} http=${result.httpStatus} errorCode=none productId=${entitlement.productId} txSuffix=${txSuffix} result=active`,
          );
          return entitlement;
        }
        this.logger.log(
          `Apple verify environment=${result.environment} http=${result.httpStatus} errorCode=none productId=${entitlement.productId} txSuffix=${txSuffix} result=inactive`,
        );
        rejection = new BadRequestException('Apple verification failed: subscription is not active');
      } catch (error) {
        this.logger.warn(
          `Apple verify environment=${result.environment} http=${result.httpStatus} errorCode=none productId=unknown txSuffix=${txSuffix} result=rejected`,
        );
        if (!(error instanceof BadRequestException)) throw error;
        rejection = error;
      }
    } else {
      this.logger.warn(
        `Apple verify environment=${result.environment} http=${result.httpStatus} errorCode=${result.errorCode ?? 'none'} txSuffix=${txSuffix} result=failed`,
      );
    }

    const fromDevice = this.entitlementFromDeviceJws(signedTransactionInfo, expectedBundleId, txSuffix);
    if (fromDevice) return fromDevice;

    throw (
      rejection ??
      new BadRequestException(
        result.errorCode != null
          ? `Apple verification failed (${result.errorCode})`
          : 'Apple verification failed: subscription is not active',
      )
    );
  }

  async verifyGoogle(input: {
    purchaseToken: string;
    productId?: string;
    packageName?: string;
  }): Promise<VerifiedEntitlement> {
    const purchaseToken = input.purchaseToken.trim();
    const expectedProductId = input.productId?.trim();
    const packageName = this.resolvePackageName(input.packageName);

    if (!purchaseToken) {
      throw new BadRequestException('purchaseToken is required');
    }
    if (expectedProductId && !isGooglePlaySubscriptionProductId(expectedProductId)) {
      throw new BadRequestException(`Unsupported productId: ${expectedProductId}`);
    }

    this.logger.log(
      `Verifying Google Play purchase productId=${expectedProductId ?? 'auto'} package=${packageName} token=${redactPurchaseToken(purchaseToken)}`,
    );

    const accessToken = await this.getGoogleAccessToken();
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`Google verification failed status=${res.status} body=${body.slice(0, 200)}`);
      throw new UnauthorizedException(`Google verification failed (${res.status})`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const lineItems = asArray(data.lineItems);
    const item = (lineItems[0] ?? {}) as Record<string, unknown>;
    const productId = asString(item.productId);
    const startMs = asRfc3339Ms(asString(item.startTime));
    const endMs = asRfc3339Ms(asString(item.expiryTime));
    const state = asString(data.subscriptionState) ?? 'SUBSCRIPTION_STATE_EXPIRED';
    const orderId =
      asString(item.latestSuccessfulOrderId) ??
      asString(item.latestOrderId) ??
      asString(data.latestOrderId);

    if (!productId) {
      throw new UnauthorizedException('Google verification failed: missing productId');
    }
    if (expectedProductId && productId !== expectedProductId) {
      throw new UnauthorizedException('Google productId does not match purchase');
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
      orderId: orderId ?? undefined,
      purchaseTokenHash: hashPurchaseToken(purchaseToken),
      rawResponse: data,
    };
  }

  private resolvePackageName(packageName?: string): string {
    const configured = this.config.get<string>('GOOGLE_PLAY_PACKAGE_NAME')?.trim();
    const expected = configured || GOOGLE_PLAY_DEFAULT_PACKAGE;
    const provided = packageName?.trim();
    if (provided && provided !== expected) {
      throw new BadRequestException('Invalid packageName');
    }
    return expected;
  }

  private async fetchAppleSubscription(
    environment: AppleApiEnvironment,
    transactionId: string,
    token: string,
  ): Promise<AppleApiResult> {
    const host = environment === 'Production' ? APPLE_PRODUCTION_HOST : APPLE_SANDBOX_HOST;
    const txSuffix = appleTransactionIdSuffix(transactionId);
    let res: Response;
    try {
      res = await fetch(`${host}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      this.logger.warn(
        `Apple verify environment=${environment} txSuffix=${txSuffix} result=request_failed`,
      );
      throw new BadRequestException('Apple verification failed');
    }

    const text = await res.text();
    let body: Record<string, unknown> | null = null;
    if (text) {
      try {
        const parsed = JSON.parse(text) as unknown;
        body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        body = null;
      }
    }
    const errorCode = appleApiErrorCode(body);
    this.logger.log(
      `Apple verify environment=${environment} http=${res.status} errorCode=${errorCode ?? 'none'} txSuffix=${txSuffix} result=${res.ok ? 'response' : 'error'}`,
    );
    return { environment, httpStatus: res.status, errorCode, body };
  }

  private parseAppleSubscription(
    payload: Record<string, unknown>,
    transactionId: string,
    expectedBundleId: string,
  ): VerifiedEntitlement {
    const entries = asArray(payload.data);
    const entry = (entries[0] ?? {}) as Record<string, unknown>;
    const lastTransactions = asArray(entry.lastTransactions);
    const tx = (lastTransactions[0] ?? {}) as Record<string, unknown>;
    const signed = asString(tx.signedTransactionInfo);
    const decoded = signed ? decodeUnsignedJwtPayload(signed) : null;
    const productId = asString(decoded?.productId) ?? asString(tx.productId);
    const originalTransactionId =
      asString(decoded?.originalTransactionId) ?? asString(tx.originalTransactionId) ?? transactionId;
    const purchaseMs = asNumber(decoded?.purchaseDate);
    const expiresMs = asNumber(decoded?.expiresDate);
    const statusCode = asNumber(tx.status) ?? asNumber(entry.status) ?? 2;
    const bundleId = asString(decoded?.bundleId) ?? asString(payload.bundleId);

    if (!productId) {
      throw new BadRequestException('Apple verification failed: missing productId');
    }
    if (!expectedBundleId || !bundleId || bundleId !== expectedBundleId) {
      throw new BadRequestException('Apple verification failed: bundleId mismatch');
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

  private buildAppleJwt(): string {
    const issuerId = this.config.get<string>('APPLE_IAP_ISSUER_ID')?.trim();
    const keyId = this.config.get<string>('APPLE_IAP_KEY_ID')?.trim();
    const bundleId = this.config.get<string>('APPLE_IAP_BUNDLE_ID')?.trim();
    const privateKeyRaw = this.config.get<string>('APPLE_IAP_PRIVATE_KEY') ?? '';
    if (!issuerId || !keyId || !bundleId || !privateKeyRaw.trim()) {
      throw new BadRequestException('Missing Apple IAP credentials');
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
    const signature = signAppleEs256(privateKeyRaw, unsignedToken);
    return `${unsignedToken}.${toBase64Url(signature)}`;
  }

  private entitlementFromDeviceJws(
    signedTransactionInfo: string | undefined,
    expectedBundleId: string,
    txSuffix: string,
  ): VerifiedEntitlement | null {
    const jws = signedTransactionInfo?.trim() ?? '';
    if (jws.split('.').length !== 3) return null;
    let decoded: Record<string, unknown>;
    try {
      decoded = verifyAppleStoreKitJws(jws, expectedBundleId);
    } catch {
      this.logger.warn(`Apple verify source=jws txSuffix=${txSuffix} result=rejected`);
      return null;
    }
    try {
      const entitlement = entitlementFromDecodedAppleTransaction(decoded, expectedBundleId);
      this.assertAllowedProduct('APPLE_APP_STORE', entitlement.productId);
      if (!isGrantedAppleStatus(entitlement.status)) {
        this.logger.log(
          `Apple verify source=jws productId=${entitlement.productId} txSuffix=${txSuffix} result=inactive`,
        );
        return null;
      }
      const environment =
        decoded.environment === 'Sandbox' || decoded.environment === 'Production' ? decoded.environment : 'unknown';
      this.logger.log(
        `Apple verify source=jws environment=${environment} productId=${entitlement.productId} txSuffix=${txSuffix} result=active`,
      );
      return entitlement;
    } catch {
      this.logger.warn(`Apple verify source=jws txSuffix=${txSuffix} result=rejected`);
      return null;
    }
  }

  private async getGoogleAccessToken(): Promise<string> {
    const credentials = this.loadGoogleServiceAccountCredentials();
    const privateKey = createPrivateKey(normalizePem(credentials.privateKey));
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
    const payload = base64UrlJson({
      iss: credentials.clientEmail,
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

  private loadGoogleServiceAccountCredentials(): { clientEmail: string; privateKey: string } {
    const jsonInline = this.config.get<string>('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')?.trim();
    if (jsonInline) {
      const parsed = JSON.parse(jsonInline) as { client_email?: string; private_key?: string };
      const clientEmail = parsed.client_email?.trim();
      const privateKey = parsed.private_key ?? '';
      if (!clientEmail || !privateKey.trim()) {
        throw new UnauthorizedException('Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
      }
      return { clientEmail, privateKey };
    }

    const credentialsPath = this.config.get<string>('GOOGLE_PLAY_CREDENTIALS_PATH')?.trim();
    if (credentialsPath) {
      const raw = readFileSync(credentialsPath, 'utf8');
      const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
      const clientEmail = parsed.client_email?.trim();
      const privateKey = parsed.private_key ?? '';
      if (!clientEmail || !privateKey.trim()) {
        throw new UnauthorizedException('Invalid GOOGLE_PLAY_CREDENTIALS_PATH file');
      }
      return { clientEmail, privateKey };
    }

    const clientEmail = this.config.get<string>('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL')?.trim();
    const privateKeyRaw = this.config.get<string>('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY') ?? '';
    if (!clientEmail || !privateKeyRaw.trim()) {
      throw new UnauthorizedException('Missing Google Play service account credentials');
    }
    return { clientEmail, privateKey: privateKeyRaw };
  }

  private assertAllowedProduct(provider: 'APPLE_APP_STORE' | 'GOOGLE_PLAY', productId: string): void {
    if (provider === 'GOOGLE_PLAY' && isGooglePlaySubscriptionProductId(productId)) {
      return;
    }
    const key =
      provider === 'APPLE_APP_STORE'
        ? 'APPLE_IAP_ALLOWED_PRODUCT_IDS'
        : 'GOOGLE_PLAY_ALLOWED_PRODUCT_IDS';
    const raw = this.config.get<string>(key)?.trim();
    if (!raw) {
      if (provider === 'GOOGLE_PLAY') {
        throw new UnauthorizedException(`Product ${productId} is not allowed for GOOGLE_PLAY`);
      }
      if (!(APPLE_SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(productId)) {
        throw new BadRequestException(`Product ${productId} is not allowed for APPLE_APP_STORE`);
      }
      return;
    }
    const allowed = new Set(
      raw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    );
    if (!allowed.has(productId)) {
      if (provider === 'APPLE_APP_STORE') {
        throw new BadRequestException(`Product ${productId} is not allowed for ${provider}`);
      }
      throw new UnauthorizedException(`Product ${productId} is not allowed for ${provider}`);
    }
  }
}

export function appleApiErrorCode(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const code = (body as { errorCode?: unknown }).errorCode;
  const n = typeof code === 'number' ? code : typeof code === 'string' && code.trim() ? Number(code) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function shouldRetryAppleSandbox(httpStatus: number, errorCode: number | null): boolean {
  if (httpStatus >= 200 && httpStatus < 300) return false;
  if (errorCode === APPLE_TRANSACTION_ID_NOT_FOUND) return true;
  return httpStatus === 404;
}

export function signAppleEs256(privateKeyPem: string, unsignedToken: string): Buffer {
  const privateKey = createPrivateKey(normalizePem(privateKeyPem));
  const signer = createSign('sha256');
  signer.update(unsignedToken);
  signer.end();
  return signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
}

export function isGrantedAppleStatus(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.PAST_DUE;
}

export function entitlementFromDecodedAppleTransaction(
  decoded: Record<string, unknown>,
  expectedBundleId: string,
  now = Date.now(),
): VerifiedEntitlement {
  const productId = asString(decoded.productId);
  const bundleId = asString(decoded.bundleId);
  const originalTransactionId = asString(decoded.originalTransactionId) ?? asString(decoded.transactionId) ?? undefined;
  const purchaseMs = asNumber(decoded.purchaseDate);
  const expiresMs = asNumber(decoded.expiresDate);
  const revoked = asNumber(decoded.revocationDate) != null;
  if (!productId) {
    throw new BadRequestException('Apple verification failed: missing productId');
  }
  if (!expectedBundleId || !bundleId || bundleId !== expectedBundleId) {
    throw new BadRequestException('Apple verification failed: bundleId mismatch');
  }
  const active = !revoked && expiresMs != null && expiresMs > now;
  return {
    provider: 'APPLE_APP_STORE',
    productId,
    externalSubscriptionId: originalTransactionId,
    billingCycle: inferBillingCycle(productId),
    status: active ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
    currentPeriodStart: purchaseMs ? new Date(purchaseMs).toISOString() : undefined,
    currentPeriodEnd: expiresMs ? new Date(expiresMs).toISOString() : undefined,
  };
}

export function appleTransactionIdSuffix(transactionId: string): string {
  if (transactionId.length <= 4) return '****';
  return transactionId.slice(-4);
}

/** Numeric App Store transaction id. Accepts a StoreKit JWS only to read its transactionId. */
export function normalizeAppleTransactionId(raw: string): string | null {
  const trimmed = raw?.trim() ?? '';
  if (/^\d+$/.test(trimmed)) return trimmed;
  const decoded = decodeUnsignedJwtPayload(trimmed);
  const id = decoded?.transactionId ?? decoded?.originalTransactionId;
  const value = id == null ? '' : String(id).trim();
  return /^\d+$/.test(value) ? value : null;
}

function mapAppleStatus(statusCode: number): SubscriptionStatus {
  if (statusCode === 1) return SubscriptionStatus.ACTIVE;
  if (statusCode === 4 || statusCode === 3) return SubscriptionStatus.PAST_DUE;
  if (statusCode === 2 || statusCode === 5) return SubscriptionStatus.CANCELED;
  return SubscriptionStatus.CANCELED;
}

function mapGoogleState(state: string): SubscriptionStatus {
  switch (state) {
    case 'SUBSCRIPTION_STATE_PENDING':
      return SubscriptionStatus.PENDING;
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return SubscriptionStatus.ACTIVE;
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return SubscriptionStatus.PAST_DUE;
    case 'SUBSCRIPTION_STATE_CANCELED':
      return SubscriptionStatus.CANCELED;
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return SubscriptionStatus.EXPIRED;
    case 'SUBSCRIPTION_STATE_PAUSED':
      return SubscriptionStatus.CANCELED;
    default:
      if (state.toUpperCase().includes('REVOK')) return SubscriptionStatus.REVOKED;
      return SubscriptionStatus.EXPIRED;
  }
}

function inferBillingCycle(productId: string): BillingCycle {
  const lower = productId.toLowerCase();
  if (lower.includes('year') || lower.includes('annual')) return BillingCycle.YEARLY;
  if (GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS[1] === productId) return BillingCycle.YEARLY;
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
