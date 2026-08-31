import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';

import { parseCorsOrigins, resolveCorsOriginOption } from './cors-origin';

type OriginCallback = (err: Error | null, allowed?: boolean) => void;

function invokeOriginCheck(
  originOption: CustomOrigin,
  origin: string | undefined,
): Promise<{ allowed: boolean; error?: string }> {
  return new Promise((resolve) => {
    const callback: OriginCallback = (err, allowed) => {
      if (err) {
        resolve({ allowed: false, error: err.message });
        return;
      }
      resolve({ allowed: allowed === true });
    };
    (originOption as (requestOrigin: string, cb: OriginCallback) => void)(
      origin ?? '',
      callback,
    );
  });
}

describe('parseCorsOrigins', () => {
  it('parses comma-separated origins with whitespace', () => {
    expect(
      parseCorsOrigins(' https://admin.connectghin.com , https://connectghin.com '),
    ).toEqual(['https://admin.connectghin.com', 'https://connectghin.com']);
  });

  it('drops empty entries', () => {
    expect(parseCorsOrigins('https://a.com,,https://b.com,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('returns empty array when unset or blank', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('   ')).toEqual([]);
  });

  it('supports a single origin', () => {
    expect(parseCorsOrigins('https://admin.connectghin.com')).toEqual([
      'https://admin.connectghin.com',
    ]);
  });
});

describe('resolveCorsOriginOption', () => {
  it('allows configured origins', async () => {
    const check = resolveCorsOriginOption(
      'https://admin.connectghin.com,https://connectghin.com',
    ) as CustomOrigin;
    await expect(invokeOriginCheck(check, 'https://connectghin.com')).resolves.toEqual({
      allowed: true,
    });
    await expect(invokeOriginCheck(check, 'https://admin.connectghin.com')).resolves.toEqual({
      allowed: true,
    });
  });

  it('rejects unlisted browser origins', async () => {
    const check = resolveCorsOriginOption('https://admin.connectghin.com') as CustomOrigin;
    const result = await invokeOriginCheck(check, 'https://evil.example');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('not allowed by CORS');
  });

  it('allows requests with no Origin header', async () => {
    const check = resolveCorsOriginOption('https://admin.connectghin.com') as CustomOrigin;
    await expect(invokeOriginCheck(check, undefined)).resolves.toEqual({ allowed: true });
  });

  it('rejects browser origins when CORS_ORIGIN is unset', async () => {
    const check = resolveCorsOriginOption(undefined) as CustomOrigin;
    const result = await invokeOriginCheck(check, 'https://connectghin.com');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('CORS_ORIGIN is not configured');
  });

  it('still allows no-Origin requests when CORS_ORIGIN is unset', async () => {
    const check = resolveCorsOriginOption(undefined) as CustomOrigin;
    await expect(invokeOriginCheck(check, undefined)).resolves.toEqual({ allowed: true });
  });
});
