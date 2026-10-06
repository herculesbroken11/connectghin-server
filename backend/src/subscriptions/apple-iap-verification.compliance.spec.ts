import { generateKeyPairSync } from 'crypto';

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';

import {
  APPLE_TRANSACTION_ID_NOT_FOUND,
  IapVerificationService,
  entitlementFromDecodedAppleTransaction,
  normalizeAppleTransactionId,
  shouldRetryAppleSandbox,
  signAppleEs256,
} from './iap-verification.service';

const BUNDLE_ID = 'com.connectghin.app';
const TRANSACTION_ID = '2000000123456789';

function jws(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'ES256' })}.${part(payload)}.sig`;
}

function subscriptionBody(input: {
  environment: 'Production' | 'Sandbox';
  status: number;
  productId?: string;
  bundleId?: string;
}): Record<string, unknown> {
  const bundleId = input.bundleId ?? BUNDLE_ID;
  const productId = input.productId ?? 'connectghin_monthly';
  return {
    environment: input.environment,
    bundleId,
    data: [
      {
        lastTransactions: [
          {
            originalTransactionId: TRANSACTION_ID,
            status: input.status,
            signedTransactionInfo: jws({
              productId,
              bundleId,
              transactionId: TRANSACTION_ID,
              originalTransactionId: TRANSACTION_ID,
              purchaseDate: 1_700_000_000_000,
              expiresDate: 1_800_000_000_000,
            }),
          },
        ],
      },
    ],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('Apple subscription verification', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: IapVerificationService;

  beforeAll(() => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const values: Record<string, string> = {
      APPLE_IAP_ISSUER_ID: 'issuer',
      APPLE_IAP_KEY_ID: 'key',
      APPLE_IAP_BUNDLE_ID: BUNDLE_ID,
      APPLE_IAP_PRIVATE_KEY: pem,
      APPLE_IAP_ALLOWED_PRODUCT_IDS: 'connectghin_monthly,connectghin_yearly',
    };
    service = new IapVerificationService({
      get: (key: string) => values[key],
    } as ConfigService);
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('keeps a Production purchase on Production', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, subscriptionBody({ environment: 'Production', status: 1 })),
    );

    const verified = await service.verifyApple(TRANSACTION_ID);

    expect(verified.status).toBe(SubscriptionStatus.ACTIVE);
    expect(verified.productId).toBe('connectghin_monthly');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://api.storekit.apple.com/');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('sandbox');
  });

  it('retries Sandbox when Production returns 4040010', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(404, {
          errorCode: APPLE_TRANSACTION_ID_NOT_FOUND,
          errorMessage: 'Transaction id not found.',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, subscriptionBody({ environment: 'Sandbox', status: 1 })),
      );

    const verified = await service.verifyApple(TRANSACTION_ID);

    expect(verified.status).toBe(SubscriptionStatus.ACTIVE);
    expect(verified.provider).toBe('APPLE_APP_STORE');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://api.storekit.apple.com/');
    expect(String(fetchMock.mock.calls[1][0])).toContain('https://api.storekit-sandbox.apple.com/');
    expect(String(fetchMock.mock.calls[1][0])).toContain(TRANSACTION_ID);
  });

  it('does not treat an Apple environment miss as an auth error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { errorCode: 4040010, errorMessage: 'Transaction id not found.' }),
    );

    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyApple(TRANSACTION_ID)).rejects.not.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not query Sandbox for a Production error other than 4040010', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { errorCode: 401, errorMessage: 'Unauthenticated' }));

    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('sandbox');
  });

  it('rejects a sandbox transaction with the wrong bundle id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { errorCode: 4040010, errorMessage: 'Transaction id not found.' }))
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          subscriptionBody({ environment: 'Sandbox', status: 1, bundleId: 'com.example.other' }),
        ),
      );

    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toThrow('bundleId mismatch');
  });

  it('rejects an unknown product and an inactive subscription', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, subscriptionBody({ environment: 'Production', status: 1, productId: 'other_product' })),
    );
    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toThrow('not allowed');

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, subscriptionBody({ environment: 'Production', status: 2 })),
    );
    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toThrow('not active');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads a numeric transaction id from a StoreKit JWS without using the JWS as the id', () => {
    const payload = Buffer.from(JSON.stringify({ transactionId: TRANSACTION_ID })).toString('base64url');
    expect(normalizeAppleTransactionId(`header.${payload}.sig`)).toBe(TRANSACTION_ID);
    expect(shouldRetryAppleSandbox(404, 4040010)).toBe(true);
    expect(shouldRetryAppleSandbox(404, null)).toBe(true);
    expect(shouldRetryAppleSandbox(200, 4040010)).toBe(false);
    expect(shouldRetryAppleSandbox(401, 401)).toBe(false);
  });

  it('signs the App Store Server API token with a raw ES256 signature', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(signAppleEs256(pem, 'header.payload').length).toBe(64);
  });

  it('treats an unexpired Sandbox transaction as active and does not turn a bad JWS into an auth error', async () => {
    const active = entitlementFromDecodedAppleTransaction(
      {
        productId: 'connectghin_monthly',
        bundleId: BUNDLE_ID,
        environment: 'Sandbox',
        originalTransactionId: TRANSACTION_ID,
        purchaseDate: Date.now() - 60_000,
        expiresDate: Date.now() + 60_000,
      },
      BUNDLE_ID,
    );
    expect(active.status).toBe(SubscriptionStatus.ACTIVE);

    const expired = entitlementFromDecodedAppleTransaction(
      {
        productId: 'connectghin_monthly',
        bundleId: BUNDLE_ID,
        environment: 'Sandbox',
        expiresDate: Date.now() - 60_000,
      },
      BUNDLE_ID,
    );
    expect(expired.status).toBe(SubscriptionStatus.EXPIRED);

    fetchMock.mockResolvedValue(
      jsonResponse(404, { errorCode: 4040010, errorMessage: 'Transaction id not found.' }),
    );
    await expect(service.verifyApple(TRANSACTION_ID, 'not-a-jws')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyApple(TRANSACTION_ID, 'a.b.c')).rejects.not.toBeInstanceOf(UnauthorizedException);
  });
});
