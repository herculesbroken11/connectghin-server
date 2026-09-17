/**
 * Shared helpers for Google Play reviewer account scripts.
 * Never logs passwords, hashes, or tokens.
 */

export const DEFAULT_API_BASE = 'https://api.connectghin.com/api/v1';

export const PRIMARY = {
  emailEnv: 'GOOGLE_PLAY_REVIEWER_EMAIL',
  passwordEnv: 'GOOGLE_PLAY_REVIEWER_PASSWORD',
  defaultEmail: 'reviewer@connectghin.com',
  username: 'google_reviewer',
  displayName: 'Google Reviewer',
} as const;

export const SECONDARY = {
  emailEnv: 'GOOGLE_PLAY_REVIEWER2_EMAIL',
  passwordEnv: 'GOOGLE_PLAY_REVIEWER2_PASSWORD',
  defaultEmail: 'reviewer2@connectghin.com',
  username: 'demo_golfer',
  displayName: 'Demo Golfer',
} as const;

/** City-level public coordinates (Austin, TX downtown). Not a private address. */
export const REVIEW_LOCATION = {
  city: 'Austin',
  state: 'TX',
  country: 'USA',
  homeCourse: 'Lions Municipal Golf Course',
  primary: { lat: 30.2672, lng: -97.7431 },
  secondary: { lat: 30.2685, lng: -97.7418 },
} as const;

export const DEMO_MESSAGE = 'Hello! This is a demo conversation for app review.';
export const FEED_NOTES = 'Looking for golfers to join an upcoming round.';
export const FEED_COURSE = 'Lions Municipal Golf Course';
export const PREMIUM_OVERRIDE_REASON = 'Google Play review access';

export type TokenPair = { accessToken: string; refreshToken: string };

export type AuthMe = {
  id: string;
  email: string;
  username: string;
  isSuspended: boolean;
  lifecycleStatus: string;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  currentTermsVersion: string;
  needsTermsAcceptance: boolean;
  membershipType?: string;
  membershipStatus?: string;
};

export type ApiError = Error & { status?: number; body?: unknown };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function resolveApiBase(): string {
  return (process.env.API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, '');
}

export function printTargetEnvironment(apiBase: string): void {
  let host = apiBase;
  try {
    host = new URL(apiBase.includes('://') ? apiBase : `https://${apiBase}`).host;
  } catch {
    // keep raw
  }
  // eslint-disable-next-line no-console
  console.log(`Target API: ${apiBase}`);
  // eslint-disable-next-line no-console
  console.log(`Target host: ${host}`);
  // eslint-disable-next-line no-console
  console.log(`Node env: ${process.env.NODE_ENV ?? '(unset)'}`);
}

export async function api<T>(
  apiBase: string,
  path: string,
  init?: RequestInit & { token?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.token) {
    headers.Authorization = `Bearer ${init.token}`;
  }
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  if (!res.ok) {
    const err = new Error(
      `${init?.method ?? 'GET'} ${path} → HTTP ${res.status}`,
    ) as ApiError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export async function login(
  apiBase: string,
  email: string,
  password: string,
): Promise<TokenPair> {
  return api<TokenPair>(apiBase, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: normalizeEmail(email), password }),
  });
}

export async function register(
  apiBase: string,
  email: string,
  username: string,
  password: string,
): Promise<TokenPair> {
  return api<TokenPair>(apiBase, '/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: normalizeEmail(email),
      username,
      password,
    }),
  });
}

export async function authMe(apiBase: string, accessToken: string): Promise<AuthMe> {
  return api<AuthMe>(apiBase, '/auth/me', { token: accessToken });
}

export async function adminLogin(
  apiBase: string,
  email: string,
  password: string,
): Promise<TokenPair> {
  return api<TokenPair>(apiBase, '/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: normalizeEmail(email), password }),
  });
}

export function assertIdentity(
  me: AuthMe,
  expectedEmail: string,
  expectedUsername: string,
): void {
  const emailOk = normalizeEmail(me.email) === normalizeEmail(expectedEmail);
  const usernameOk = me.username === expectedUsername;
  if (!emailOk || !usernameOk) {
    throw new Error(
      `Identity mismatch: expected email=${normalizeEmail(expectedEmail)} username=${expectedUsername}, ` +
        `got email=${normalizeEmail(me.email)} username=${me.username}. Refusing to modify unrelated account.`,
    );
  }
  if (me.isSuspended || me.lifecycleStatus === 'DELETED') {
    throw new Error(
      `Account ${normalizeEmail(expectedEmail)} is unavailable (suspended=${me.isSuspended}, lifecycle=${me.lifecycleStatus}).`,
    );
  }
}

export function futureRoundDateIso(daysAhead = 14): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(16, 0, 0, 0);
  return d.toISOString();
}

export function logStep(message: string): void {
  // eslint-disable-next-line no-console
  console.log(message);
}

export function logFail(message: string): void {
  // eslint-disable-next-line no-console
  console.error(message);
}
