import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';

import {
  APPLE_TRANSACTION_ID_NOT_FOUND,
  IapVerificationService,
  entitlementFromDecodedAppleTransaction,
  normalizeAppleTransactionId,
  shouldRetryAppleEnvironment,
} from './iap-verification.service';

const BUNDLE_ID = 'com.connectghin.app';
const TRANSACTION_ID = '2000000123456789';
const APP_APPLE_ID = '1234567890';

type AppleIapMock = {
  getTransactionInfo: jest.Mock;
  getAllSubscriptionStatuses: jest.Mock;
  verifyAndDecodeTransaction: jest.Mock;
};

jest.mock('@apple/app-store-server-library', () => {
  const actual = jest.requireActual('@apple/app-store-server-library');
  const state: AppleIapMock = {
    getTransactionInfo: jest.fn(),
    getAllSubscriptionStatuses: jest.fn(),
    verifyAndDecodeTransaction: jest.fn(),
  };
  (globalThis as { __appleIapMock?: AppleIapMock }).__appleIapMock = state;
  return {
    ...actual,
    AppStoreServerAPIClient: jest.fn().mockImplementation(
      (_signingKey: string, _keyId: string, _issuerId: string, _bundleId: string, environment: string) => ({
        getTransactionInfo: (transactionId: string) => state.getTransactionInfo(environment, transactionId),
        getAllSubscriptionStatuses: (transactionId: string) =>
          state.getAllSubscriptionStatuses(environment, transactionId),
      }),
    ),
    SignedDataVerifier: jest.fn().mockImplementation((_roots: unknown, _online: boolean, environment: string) => ({
      verifyAndDecodeTransaction: (signed: string) => state.verifyAndDecodeTransaction(environment, signed),
    })),
  };
});

function appleIapMock(): AppleIapMock {
  const state = (globalThis as { __appleIapMock?: AppleIapMock }).__appleIapMock;
  if (!state) throw new Error('Apple IAP mock was not installed');
  return state;
}

function activeDecoded(environment: Environment | string, overrides: Record<string, unknown> = {}) {
  return {
    productId: 'connectghin_monthly',
    bundleId: BUNDLE_ID,
    environment,
    transactionId: TRANSACTION_ID,
    originalTransactionId: TRANSACTION_ID,
    purchaseDate: Date.now() - 60_000,
    expiresDate: Date.now() + 60_000,
    ...overrides,
  };
}

function serviceWith(values: Record<string, string>): IapVerificationService {
  return new IapVerificationService({
    get: (key: string) => values[key],
  } as ConfigService);
}

describe('Apple subscription verification', () => {
  const credentials: Record<string, string> = {
    APPLE_IAP_ISSUER_ID: 'issuer',
    APPLE_IAP_KEY_ID: 'key',
    APPLE_IAP_BUNDLE_ID: BUNDLE_ID,
    APPLE_IAP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----',
    APPLE_IAP_APP_APPLE_ID: APP_APPLE_ID,
    APPLE_IAP_ALLOWED_PRODUCT_IDS: 'connectghin_monthly,connectghin_yearly',
  };
  let service: IapVerificationService;

  beforeAll(() => {
    service = serviceWith(credentials);
  });

  beforeEach(() => {
    const state = appleIapMock();
    state.getTransactionInfo.mockReset();
    state.getAllSubscriptionStatuses.mockReset();
    state.verifyAndDecodeTransaction.mockReset();
    state.getAllSubscriptionStatuses.mockResolvedValue({ data: [] });
    state.verifyAndDecodeTransaction.mockImplementation(async (environment: string) => activeDecoded(environment));
    state.getTransactionInfo.mockImplementation(async (environment: string, transactionId: string) => {
      if (environment === Environment.SANDBOX) {
        throw new Error(`unexpected sandbox lookup for ${transactionId.slice(-4)}`);
      }
      return { signedTransactionInfo: 'signed-transaction' };
    });
  });

  it('uses official Production and Sandbox clients and keeps a Production purchase on Production', async () => {
    const verified = await service.verifyApple(TRANSACTION_ID);

    expect(verified.status).toBe(SubscriptionStatus.ACTIVE);
    expect(verified.productId).toBe('connectghin_monthly');
    expect(verified.provider).toBe('APPLE_APP_STORE');
    expect(AppStoreServerAPIClient).toHaveBeenCalledWith(
      expect.stringContaining('BEGIN PRIVATE KEY'),
      'key',
      'issuer',
      BUNDLE_ID,
      Environment.PRODUCTION,
    );
    expect(AppStoreServerAPIClient).toHaveBeenCalledWith(
      expect.stringContaining('BEGIN PRIVATE KEY'),
      'key',
      'issuer',
      BUNDLE_ID,
      Environment.SANDBOX,
    );
    expect(appleIapMock().getTransactionInfo).toHaveBeenCalledTimes(1);
    expect(appleIapMock().getTransactionInfo).toHaveBeenCalledWith(Environment.PRODUCTION, TRANSACTION_ID);
    expect(appleIapMock().getAllSubscriptionStatuses).not.toHaveBeenCalled();
  });

  it('verifies a TestFlight transaction through Sandbox when Production cannot find it', async () => {
    const testFlight = serviceWith({ ...credentials, APPLE_IAP_APP_APPLE_ID: '' });
    appleIapMock().getTransactionInfo.mockImplementation(async (environment: string, transactionId: string) => {
      if (environment === Environment.PRODUCTION) {
        throw new APIException(404, APIError.TRANSACTION_ID_NOT_FOUND, 'Transaction id not found.');
      }
      return { signedTransactionInfo: `sandbox-${transactionId.slice(-4)}` };
    });

    const verified = await testFlight.verifyApple(TRANSACTION_ID);

    expect(verified.status).toBe(SubscriptionStatus.ACTIVE);
    expect(verified.provider).toBe('APPLE_APP_STORE');
    expect(appleIapMock().getTransactionInfo.mock.calls.map((call) => call[0])).toEqual([
      Environment.PRODUCTION,
      Environment.SANDBOX,
    ]);
    expect(appleIapMock().verifyAndDecodeTransaction).toHaveBeenCalledWith(
      Environment.SANDBOX,
      expect.any(String),
    );
    expect(appleIapMock().verifyAndDecodeTransaction).not.toHaveBeenCalledWith(
      Environment.PRODUCTION,
      expect.anything(),
    );
  });

  it('retries Sandbox for an environment mismatch and for a not-found HTTP 404', async () => {
    appleIapMock().verifyAndDecodeTransaction.mockImplementation(async (environment: string) => {
      if (environment === Environment.PRODUCTION) {
        throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
      }
      return activeDecoded(environment);
    });
    appleIapMock().getTransactionInfo.mockResolvedValue({ signedTransactionInfo: 'signed-transaction' });

    const verified = await service.verifyApple(TRANSACTION_ID);
    expect(verified.status).toBe(SubscriptionStatus.ACTIVE);
    expect(appleIapMock().getTransactionInfo.mock.calls.map((call) => call[0])).toEqual([
      Environment.PRODUCTION,
      Environment.SANDBOX,
    ]);

    appleIapMock().getTransactionInfo.mockReset();
    appleIapMock().verifyAndDecodeTransaction.mockImplementation(async (environment: string) => activeDecoded(environment));
    appleIapMock().getTransactionInfo.mockImplementation(async (environment: string) => {
      if (environment === Environment.PRODUCTION) throw new APIException(404, null, null);
      return { signedTransactionInfo: 'signed-transaction' };
    });
    await expect(service.verifyApple(TRANSACTION_ID)).resolves.toMatchObject({ status: SubscriptionStatus.ACTIVE });
  });

  it('does not treat an Apple lookup miss as an auth error', async () => {
    appleIapMock().getTransactionInfo.mockRejectedValue(
      new APIException(404, APPLE_TRANSACTION_ID_NOT_FOUND, 'Transaction id not found.'),
    );

    await expect(service.verifyApple(TRANSACTION_ID, 'a.b.c')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyApple(TRANSACTION_ID, 'a.b.c')).rejects.not.toBeInstanceOf(UnauthorizedException);
  });

  it('does not query Sandbox for an Apple 401 and keeps it a billing error', async () => {
    appleIapMock().getTransactionInfo.mockImplementation(async (environment: string) => {
      if (environment === Environment.SANDBOX) throw new Error('sandbox should not be called');
      throw new APIException(401, null, null);
    });

    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toThrow('Apple verification failed (401)');
    await expect(service.verifyApple(TRANSACTION_ID)).rejects.not.toBeInstanceOf(UnauthorizedException);
    expect(appleIapMock().getTransactionInfo.mock.calls.every((call) => call[0] === Environment.PRODUCTION)).toBe(true);
  });

  it('rejects a wrong bundle id, an unknown product, and an inactive subscription', async () => {
    appleIapMock().verifyAndDecodeTransaction.mockResolvedValue(
      activeDecoded(Environment.PRODUCTION, { bundleId: 'com.example.other' }),
    );
    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toThrow('bundleId mismatch');

    appleIapMock().verifyAndDecodeTransaction.mockResolvedValue(
      activeDecoded(Environment.PRODUCTION, { productId: 'other_product' }),
    );
    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toThrow('not allowed');

    appleIapMock().verifyAndDecodeTransaction.mockResolvedValue(
      activeDecoded(Environment.PRODUCTION, { expiresDate: Date.now() - 60_000 }),
    );
    await expect(service.verifyApple(TRANSACTION_ID)).rejects.toThrow('not active');
    expect(appleIapMock().getTransactionInfo.mock.calls.every((call) => call[0] === Environment.PRODUCTION)).toBe(true);
  });

  it('accepts a current renewal when the original transaction itself is expired', async () => {
    appleIapMock().verifyAndDecodeTransaction.mockImplementation(async (environment: string, signed: string) => {
      if (signed === 'latest') return activeDecoded(environment, { transactionId: '2000000123456790' });
      return activeDecoded(environment, { expiresDate: Date.now() - 60_000 });
    });
    appleIapMock().getAllSubscriptionStatuses.mockResolvedValue({
      environment: Environment.PRODUCTION,
      bundleId: BUNDLE_ID,
      data: [{ lastTransactions: [{ originalTransactionId: TRANSACTION_ID, signedTransactionInfo: 'latest' }] }],
    });

    const verified = await service.verifyApple(TRANSACTION_ID);

    expect(verified.status).toBe(SubscriptionStatus.ACTIVE);
    expect(appleIapMock().getAllSubscriptionStatuses).toHaveBeenCalledWith(Environment.PRODUCTION, TRANSACTION_ID);
    expect(appleIapMock().getTransactionInfo.mock.calls.map((call) => call[0])).toEqual([Environment.PRODUCTION]);
  });

  it('reads a numeric transaction id from a StoreKit JWS and does not send the JWS as the id', async () => {
    const payload = Buffer.from(JSON.stringify({ transactionId: TRANSACTION_ID })).toString('base64url');
    expect(normalizeAppleTransactionId(`header.${payload}.sig`)).toBe(TRANSACTION_ID);
    expect(shouldRetryAppleEnvironment(new APIException(404, 4040010, null))).toBe(true);
    expect(shouldRetryAppleEnvironment(new APIException(404, null, null))).toBe(true);
    expect(shouldRetryAppleEnvironment(new APIException(200, 4040010, null))).toBe(false);
    expect(shouldRetryAppleEnvironment(new APIException(401, 401, null))).toBe(false);
    expect(
      shouldRetryAppleEnvironment(new VerificationException(VerificationStatus.INVALID_ENVIRONMENT)),
    ).toBe(true);

    await service.verifyApple(`header.${payload}.sig`);
    expect(appleIapMock().getTransactionInfo).toHaveBeenCalledWith(Environment.PRODUCTION, TRANSACTION_ID);
  });

  it('treats an unexpired Sandbox transaction as active and a bad Apple result as a billing error', async () => {
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

    appleIapMock().getTransactionInfo.mockRejectedValue(new APIException(404, 4040010, null));
    await expect(service.verifyApple(TRANSACTION_ID, 'not-a-jws')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyApple(TRANSACTION_ID, 'a.b.c')).rejects.not.toBeInstanceOf(UnauthorizedException);
  });

  it('requires the Production app Apple ID only after Production finds a transaction', async () => {
    const withoutAppId = serviceWith({ ...credentials, APPLE_IAP_APP_APPLE_ID: '' });
    appleIapMock().getTransactionInfo.mockResolvedValue({ signedTransactionInfo: 'signed-transaction' });

    await expect(withoutAppId.verifyApple(TRANSACTION_ID)).rejects.toThrow('Missing Apple IAP credentials');
    expect(appleIapMock().getTransactionInfo.mock.calls.map((call) => call[0])).toEqual([Environment.PRODUCTION]);
  });

  it('rejects a missing transaction id before calling Apple', async () => {
    await expect(service.verifyApple('not-a-transaction')).rejects.toThrow('missing transactionId');
    expect(appleIapMock().getTransactionInfo).not.toHaveBeenCalled();
  });
});
