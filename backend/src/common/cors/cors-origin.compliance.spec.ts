import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Express } from 'express';

import { parseCorsOrigins, resolveCorsOriginOption } from './cors-origin';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cors = require('cors') as typeof import('cors');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');

const PRODUCTION_CORS_ORIGIN = 'https://admin.connectghin.com,https://connectghin.com';

type OriginCallback = (err: Error | null, allowed?: boolean) => void;

function invokeOriginCheck(
  originOption: CustomOrigin,
  origin: string | undefined,
): Promise<{ allowed: boolean; error: Error | null }> {
  return new Promise((resolve) => {
    const callback: OriginCallback = (err, allowed) => {
      resolve({ allowed: allowed === true, error: err });
    };
    (originOption as (requestOrigin: string, cb: OriginCallback) => void)(
      origin ?? '',
      callback,
    );
  });
}

function createCorsTestApp(corsOriginRaw: string | undefined): Express {
  const app = express();
  app.use(
    cors({
      origin: resolveCorsOriginOption(corsOriginRaw) as import('cors').CorsOptions['origin'],
      credentials: true,
    }),
  );
  app.options('*', (_req, res) => {
    res.sendStatus(204);
  });
  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('parseCorsOrigins', () => {
  it('parses comma-separated origins with whitespace', () => {
    expect(parseCorsOrigins(` ${PRODUCTION_CORS_ORIGIN} `)).toEqual([
      'https://admin.connectghin.com',
      'https://connectghin.com',
    ]);
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
  it('allows https://connectghin.com', async () => {
    const check = resolveCorsOriginOption(PRODUCTION_CORS_ORIGIN) as CustomOrigin;
    await expect(invokeOriginCheck(check, 'https://connectghin.com')).resolves.toEqual({
      allowed: true,
      error: null,
    });
  });

  it('allows https://admin.connectghin.com', async () => {
    const check = resolveCorsOriginOption(PRODUCTION_CORS_ORIGIN) as CustomOrigin;
    await expect(invokeOriginCheck(check, 'https://admin.connectghin.com')).resolves.toEqual({
      allowed: true,
      error: null,
    });
  });

  it('rejects https://example.com without throwing an Error', async () => {
    const check = resolveCorsOriginOption(PRODUCTION_CORS_ORIGIN) as CustomOrigin;
    await expect(invokeOriginCheck(check, 'https://example.com')).resolves.toEqual({
      allowed: false,
      error: null,
    });
  });

  it('allows requests with no Origin header', async () => {
    const check = resolveCorsOriginOption(PRODUCTION_CORS_ORIGIN) as CustomOrigin;
    await expect(invokeOriginCheck(check, undefined)).resolves.toEqual({
      allowed: true,
      error: null,
    });
  });

  it('supports a single-origin allowlist', async () => {
    const check = resolveCorsOriginOption('https://admin.connectghin.com') as CustomOrigin;
    await expect(invokeOriginCheck(check, 'https://admin.connectghin.com')).resolves.toEqual({
      allowed: true,
      error: null,
    });
    await expect(invokeOriginCheck(check, 'https://connectghin.com')).resolves.toEqual({
      allowed: false,
      error: null,
    });
  });

  it('rejects browser origins when CORS_ORIGIN is unset without throwing', async () => {
    const check = resolveCorsOriginOption(undefined) as CustomOrigin;
    await expect(invokeOriginCheck(check, 'https://connectghin.com')).resolves.toEqual({
      allowed: false,
      error: null,
    });
  });

  it('still allows no-Origin requests when CORS_ORIGIN is unset', async () => {
    const check = resolveCorsOriginOption(undefined) as CustomOrigin;
    await expect(invokeOriginCheck(check, undefined)).resolves.toEqual({
      allowed: true,
      error: null,
    });
  });
});

describe('resolveCorsOriginOption HTTP preflight', () => {
  it('returns 204 with Access-Control-Allow-Origin for allowed origins', async () => {
    const app = createCorsTestApp(PRODUCTION_CORS_ORIGIN);

    for (const origin of ['https://connectghin.com', 'https://admin.connectghin.com']) {
      const res = await request(app)
        .options('/api/v1/health')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('does not emit Access-Control-Allow-Origin and does not return 500 for disallowed origins', async () => {
    const app = createCorsTestApp(PRODUCTION_CORS_ORIGIN);

    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.status).not.toBe(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows no-Origin preflight without Access-Control-Allow-Origin', async () => {
    const app = createCorsTestApp(PRODUCTION_CORS_ORIGIN);

    const res = await request(app)
      .options('/api/v1/health')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).not.toBe(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
