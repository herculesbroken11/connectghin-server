import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Parse comma-separated CORS_ORIGIN; trim entries and drop empties. */
export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Dynamic origin check: allow missing Origin (server-to-server, mobile native, curl)
 * and reflect only explicitly configured browser origins (works with credentials: true).
 */
export function createCorsOriginValidator(allowedOrigins: readonly string[]): CorsOptions['origin'] {
  const allowed = new Set(allowedOrigins);

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowed.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

export function resolveCorsOriginOption(raw: string | undefined): CorsOptions['origin'] {
  const allowedOrigins = parseCorsOrigins(raw);
  if (allowedOrigins.length === 0) {
    return (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, false);
    };
  }
  return createCorsOriginValidator(allowedOrigins);
}
