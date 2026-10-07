import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  StatusResponse,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
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
import { appleRootCertificateDers } from './apple-storekit-jws.verifier';

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
export const APPLE_TRANSACTION_ID_NOT_FOUND = APIError.TRANSACTION_ID_NOT_FOUND;

const APPLE_SUBSCRIPTION_PRODUCT_IDS = ['connectghin_monthly', 'connectghin_yearly'] as const;

type AppleClients = {
  production: AppStoreServerAPIClient;
  sandbox: AppStoreServerAPIClient;
  bundleId: string;
};

type AppleVerifySource = 'signedTransaction' | 'fallback';

type AppleVerifyRoute = {
  source: AppleVerifySource;
  /** Set only after SignedDataVerifier succeeds. */
  verifiedEnvironment: Environment | 'none';
};

@Injectable()
export class IapVerificationService {
  private readonly logger = new Logger(IapVerificationService.name);
  private appleClients: AppleClients | null = null;
  private appleProductionVerifier: SignedDataVerifier | null = null;
  private appleSandboxVerifier: SignedDataVerifier | null = null;
  private appleRoots: Buffer[] | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * Purchase and Restore Purchases both call this.
   * A StoreKit signed transaction selects Sandbox or Production before any App Store Server API call.
   * Entitlement is granted only after SignedDataVerifier succeeds.
   */
  async verifyApple(transactionId: string, signedTransactionInfo?: string): Promise<VerifiedEntitlement> {
    const suppliedId = normalizeAppleTransactionId(transactionId);
    const signedTransaction = compactAppleJws(signedTransactionInfo);
    if (signedTransaction) {
      const claimed = claimedAppleEnvironment(signedTransaction);
      if (claimed) {
        return this.verifyAppleFromSignedTransaction(claimed, signedTransaction);
      }
      this.appleLog('log', { source: 'fallback', verifiedEnvironment: 'none' }, 'none', 'unknown', 'fallback');
    }

    if (!suppliedId) {
      this.appleLog('warn', { source: 'fallback', verifiedEnvironment: 'none' }, 'none', 'unknown', 'failure');
      throw new BadRequestException('Apple verification failed: missing transactionId');
    }
    return this.verifyAppleFallback(suppliedId);
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

  private appleLog(
    level: 'log' | 'warn',
    route: AppleVerifyRoute,
    apiEnvironment: Environment | 'none',
    productId: string,
    result: string,
    http?: number | string,
    errorCode?: number | string,
  ): void {
    const httpPart = http == null ? '' : ` http=${http}`;
    const errorPart = errorCode == null ? '' : ` errorCode=${errorCode}`;
    const line =
      `Apple verify source=${route.source} verifiedEnvironment=${route.verifiedEnvironment}` +
      ` apiEnvironment=${apiEnvironment}${httpPart}${errorPart} productId=${productId} result=${result}`;
    if (level === 'warn') this.logger.warn(line);
    else this.logger.log(line);
  }

  private async verifyAppleFromSignedTransaction(
    claimed: Environment,
    signedTransaction: string,
  ): Promise<VerifiedEntitlement> {
    const route: AppleVerifyRoute = { source: 'signedTransaction', verifiedEnvironment: 'none' };
    const clients = this.ensureAppleClients();
    let decoded: Record<string, unknown>;
    try {
      decoded = (await this.verifierFor(claimed, route).verifyAndDecodeTransaction(signedTransaction)) as unknown as Record<
        string,
        unknown
      >;
    } catch (error) {
      this.appleLog('warn', route, 'none', 'unknown', 'failure');
      throw toAppleBillingError(error);
    }

    if (decoded.environment !== claimed) {
      this.appleLog('warn', route, 'none', 'unknown', 'failure');
      throw new BadRequestException('Apple verification failed: invalid environment');
    }
    route.verifiedEnvironment = claimed;

    let trusted: VerifiedEntitlement;
    try {
      trusted = entitlementFromDecodedAppleTransaction(decoded, clients.bundleId);
      this.assertAllowedProduct('APPLE_APP_STORE', trusted.productId);
    } catch (error) {
      const productId = asString(decoded.productId) ?? 'unknown';
      this.appleLog('warn', route, 'none', productId, appleTransactionResult(decoded) === 'active' ? 'failure' : appleTransactionResult(decoded));
      throw toAppleBillingError(error);
    }

    const verifiedId = verifiedAppleTransactionId(decoded);
    if (!verifiedId) {
      this.appleLog('warn', route, 'none', trusted.productId, 'failure');
      throw new BadRequestException('Apple verification failed: missing transactionId');
    }

    this.appleLog('log', route, claimed, trusted.productId, 'verified');
    const client = claimed === Environment.SANDBOX ? clients.sandbox : clients.production;
    try {
      return await this.verifyAppleInEnvironment(client, claimed, verifiedId, clients.bundleId, route);
    } catch (error) {
      throw toAppleBillingError(error);
    }
  }

  private async verifyAppleFallback(transactionId: string): Promise<VerifiedEntitlement> {
    const clients = this.ensureAppleClients();
    const route: AppleVerifyRoute = { source: 'fallback', verifiedEnvironment: 'none' };
    try {
      return await this.verifyAppleInEnvironment(
        clients.production,
        Environment.PRODUCTION,
        transactionId,
        clients.bundleId,
        route,
      );
    } catch (error) {
      if (!shouldRetryAppleEnvironment(error)) throw toAppleBillingError(error);
      const errorCode =
        error instanceof APIException
          ? (appleApiErrorNumber(error.apiError) ?? 'none')
          : error instanceof VerificationException
            ? error.status
            : 'none';
      const http = error instanceof APIException ? error.httpStatusCode : 200;
      this.appleLog('log', route, Environment.PRODUCTION, 'unknown', 'retry_sandbox', http, errorCode);
    }

    try {
      return await this.verifyAppleInEnvironment(
        clients.sandbox,
        Environment.SANDBOX,
        transactionId,
        clients.bundleId,
        route,
      );
    } catch (error) {
      throw toAppleBillingError(error);
    }
  }

  private ensureAppleClients(): AppleClients {
    if (this.appleClients) return this.appleClients;
    const signingKey = normalizePem(this.config.get<string>('APPLE_IAP_PRIVATE_KEY') ?? '');
    const keyId = this.config.get<string>('APPLE_IAP_KEY_ID')?.trim() ?? '';
    const issuerId = this.config.get<string>('APPLE_IAP_ISSUER_ID')?.trim() ?? '';
    const bundleId = this.config.get<string>('APPLE_IAP_BUNDLE_ID')?.trim() ?? '';
    if (!signingKey || !keyId || !issuerId || !bundleId) {
      throw new BadRequestException('Missing Apple IAP credentials');
    }
    this.appleClients = {
      bundleId,
      production: new AppStoreServerAPIClient(signingKey, keyId, issuerId, bundleId, Environment.PRODUCTION),
      sandbox: new AppStoreServerAPIClient(signingKey, keyId, issuerId, bundleId, Environment.SANDBOX),
    };
    return this.appleClients;
  }

  private appleAppAppleId(): number | undefined {
    const raw = this.config.get<string>('APPLE_IAP_APP_APPLE_ID')?.trim() ?? '';
    if (!/^\d+$/.test(raw)) return undefined;
    const id = Number(raw);
    return Number.isSafeInteger(id) ? id : undefined;
  }

  private appleRootCertificates(): Buffer[] {
    if (!this.appleRoots) this.appleRoots = appleRootCertificateDers();
    return this.appleRoots;
  }

  private verifierFor(environment: Environment, route: AppleVerifyRoute): SignedDataVerifier {
    const bundleId = this.appleClients?.bundleId ?? '';
    if (!bundleId) throw new BadRequestException('Missing Apple IAP credentials');
    if (environment === Environment.SANDBOX) {
      if (!this.appleSandboxVerifier) {
        this.appleSandboxVerifier = new SignedDataVerifier(
          this.appleRootCertificates(),
          true,
          Environment.SANDBOX,
          bundleId,
        );
      }
      return this.appleSandboxVerifier;
    }
    if (environment !== Environment.PRODUCTION) {
      throw new BadRequestException('Apple verification failed: invalid environment');
    }
    if (this.appleProductionVerifier) return this.appleProductionVerifier;
    const appAppleId = this.appleAppAppleId();
    if (appAppleId == null) {
      this.appleLog('warn', route, Environment.PRODUCTION, 'unknown', 'missing_app_apple_id');
      throw new BadRequestException('Missing Apple IAP credentials');
    }
    this.appleProductionVerifier = new SignedDataVerifier(
      this.appleRootCertificates(),
      true,
      Environment.PRODUCTION,
      bundleId,
      appAppleId,
    );
    return this.appleProductionVerifier;
  }

  private async verifyAppleInEnvironment(
    client: AppStoreServerAPIClient,
    environment: Environment,
    transactionId: string,
    bundleId: string,
    route: AppleVerifyRoute,
  ): Promise<VerifiedEntitlement> {
    const signed = await this.lookupSignedTransaction(client, environment, transactionId, route);
    const entitlement = await this.entitlementFromSignedTransaction(signed, environment, bundleId, route);
    if (isGrantedAppleStatus(entitlement.status)) {
      this.appleLog('log', this.verifiedRoute(route, environment), environment, entitlement.productId, 'active', 200, 'none');
      return entitlement;
    }

    const renewed = await this.activeEntitlementFromSubscriptionStatus(
      client,
      environment,
      transactionId,
      bundleId,
      route,
      entitlement.externalSubscriptionId,
    );
    if (renewed) return renewed;

    this.appleLog(
      'log',
      this.verifiedRoute(route, environment),
      environment,
      entitlement.productId,
      'expired',
      200,
      'none',
    );
    throw new BadRequestException('Apple verification failed: subscription is not active');
  }

  private verifiedRoute(route: AppleVerifyRoute, environment: Environment): AppleVerifyRoute {
    if (route.verifiedEnvironment !== 'none') return route;
    return { source: route.source, verifiedEnvironment: environment };
  }

  private async lookupSignedTransaction(
    client: AppStoreServerAPIClient,
    environment: Environment,
    transactionId: string,
    route: AppleVerifyRoute,
  ): Promise<string> {
    try {
      const response = await client.getTransactionInfo(transactionId);
      const signed = response.signedTransactionInfo?.trim() ?? '';
      if (!signed) {
        this.appleLog('warn', this.verifiedRoute(route, environment), environment, 'unknown', 'failure', 200, 'none');
        throw new BadRequestException('Apple verification failed');
      }
      this.appleLog('log', this.verifiedRoute(route, environment), environment, 'unknown', 'response', 200, 'none');
      return signed;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof APIException) {
        this.appleLog(
          'warn',
          route,
          environment,
          'unknown',
          'failure',
          error.httpStatusCode,
          appleApiErrorNumber(error.apiError) ?? 'none',
        );
      } else {
        this.appleLog('warn', route, environment, 'unknown', 'failure');
      }
      throw error;
    }
  }

  private async entitlementFromSignedTransaction(
    signedTransaction: string,
    environment: Environment,
    bundleId: string,
    route: AppleVerifyRoute,
  ): Promise<VerifiedEntitlement> {
    let decoded: Record<string, unknown>;
    try {
      decoded = (await this.verifierFor(environment, route).verifyAndDecodeTransaction(signedTransaction)) as unknown as Record<
        string,
        unknown
      >;
    } catch (error) {
      if (error instanceof VerificationException && error.status === VerificationStatus.INVALID_APP_IDENTIFIER) {
        this.appleLog('warn', this.verifiedRoute(route, environment), environment, 'unknown', 'failure', 200, error.status);
        throw new BadRequestException('Apple verification failed: bundleId mismatch');
      }
      throw error;
    }
    if (decoded.environment !== environment) {
      throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
    }
    if (decoded.environment !== Environment.PRODUCTION && decoded.environment !== Environment.SANDBOX) {
      throw new BadRequestException('Apple verification failed: invalid environment');
    }
    const entitlement = entitlementFromDecodedAppleTransaction(decoded, bundleId);
    this.assertAllowedProduct('APPLE_APP_STORE', entitlement.productId);
    if (!isGrantedAppleStatus(entitlement.status)) {
      this.appleLog(
        'log',
        this.verifiedRoute(route, environment),
        environment,
        entitlement.productId,
        appleTransactionResult(decoded),
        200,
        'none',
      );
    }
    return entitlement;
  }

  private async activeEntitlementFromSubscriptionStatus(
    client: AppStoreServerAPIClient,
    environment: Environment,
    transactionId: string,
    bundleId: string,
    route: AppleVerifyRoute,
    originalTransactionId?: string,
  ): Promise<VerifiedEntitlement | null> {
    let response: StatusResponse;
    try {
      response = await client.getAllSubscriptionStatuses(transactionId);
      this.appleLog('log', this.verifiedRoute(route, environment), environment, 'unknown', 'response', 200, 'none');
    } catch (error) {
      if (error instanceof APIException) {
        this.appleLog(
          'warn',
          route,
          environment,
          'unknown',
          'failure',
          error.httpStatusCode,
          appleApiErrorNumber(error.apiError) ?? 'none',
        );
        return null;
      }
      throw error;
    }
    if (response.bundleId && response.bundleId !== bundleId) {
      throw new BadRequestException('Apple verification failed: bundleId mismatch');
    }
    if (response.environment && response.environment !== environment) {
      throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
    }
    for (const group of response.data ?? []) {
      for (const item of group.lastTransactions ?? []) {
        if (originalTransactionId && item.originalTransactionId && item.originalTransactionId !== originalTransactionId) {
          continue;
        }
        const signed = item.signedTransactionInfo?.trim();
        if (!signed) continue;
        try {
          const entitlement = await this.entitlementFromSignedTransaction(signed, environment, bundleId, route);
          if (!isGrantedAppleStatus(entitlement.status)) continue;
          this.appleLog(
            'log',
            this.verifiedRoute(route, environment),
            environment,
            entitlement.productId,
            'active',
            200,
            'none',
          );
          return entitlement;
        } catch (error) {
          if (error instanceof BadRequestException) throw error;
          this.appleLog('warn', this.verifiedRoute(route, environment), environment, 'unknown', 'failure', 200, 'none');
        }
      }
    }
    return null;
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

export function appleApiErrorNumber(code: number | APIError | null | undefined): number | null {
  return typeof code === 'number' && Number.isFinite(code) ? code : null;
}

/** Production miss that means the transaction may exist in Sandbox (including TestFlight). */
export function shouldRetryAppleEnvironment(error: unknown): boolean {
  if (error instanceof VerificationException) {
    return error.status === VerificationStatus.INVALID_ENVIRONMENT;
  }
  if (!(error instanceof APIException)) return false;
  if (error.httpStatusCode >= 200 && error.httpStatusCode < 300) return false;
  const code = appleApiErrorNumber(error.apiError);
  if (
    code === APIError.TRANSACTION_ID_NOT_FOUND ||
    code === APIError.ORIGINAL_TRANSACTION_ID_NOT_FOUND ||
    code === APIError.ORIGINAL_TRANSACTION_ID_NOT_FOUND_RETRYABLE
  ) {
    return true;
  }
  return error.httpStatusCode === 404;
}

function toAppleBillingError(error: unknown): BadRequestException {
  if (error instanceof BadRequestException) return error;
  if (error instanceof APIException) {
    const code = appleApiErrorNumber(error.apiError) ?? error.httpStatusCode;
    return new BadRequestException(`Apple verification failed (${code})`);
  }
  if (error instanceof VerificationException) {
    if (error.status === VerificationStatus.INVALID_APP_IDENTIFIER) {
      return new BadRequestException('Apple verification failed: bundleId mismatch');
    }
    if (error.status === VerificationStatus.INVALID_ENVIRONMENT) {
      return new BadRequestException('Apple verification failed: invalid environment');
    }
    return new BadRequestException('Apple verification failed');
  }
  return new BadRequestException('Apple verification failed');
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

function compactAppleJws(value: string | undefined): string | null {
  const jws = value?.trim() ?? '';
  const parts = jws.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  return jws;
}

/** Untrusted environment claim used only to choose a verifier. Never grants entitlement. */
export function claimedAppleEnvironment(signedTransaction: string): Environment | null {
  const decoded = decodeUnsignedJwtPayload(signedTransaction);
  if (decoded?.environment === Environment.SANDBOX) return Environment.SANDBOX;
  if (decoded?.environment === Environment.PRODUCTION) return Environment.PRODUCTION;
  return null;
}

function verifiedAppleTransactionId(decoded: Record<string, unknown>): string | null {
  const transactionId = asString(decoded.transactionId);
  if (transactionId && /^\d+$/.test(transactionId)) return transactionId;
  const originalTransactionId = asString(decoded.originalTransactionId);
  if (originalTransactionId && /^\d+$/.test(originalTransactionId)) return originalTransactionId;
  return null;
}

function appleTransactionResult(decoded: Record<string, unknown>, now = Date.now()): 'active' | 'expired' | 'revoked' {
  if (asNumber(decoded.revocationDate) != null) return 'revoked';
  const expiresMs = asNumber(decoded.expiresDate);
  if (expiresMs != null && expiresMs > now) return 'active';
  return 'expired';
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
