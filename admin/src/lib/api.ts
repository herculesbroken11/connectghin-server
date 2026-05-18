const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const TOKEN_KEY = 'cg_admin_access_token';
const REFRESH_KEY = 'cg_admin_refresh_token';

type QueryValue = string | number | boolean | null | undefined;

export function getAdminAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAdminTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearAdminTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  clearAdminPublicConfigCache();
}

export function isAdminLoggedIn(): boolean {
  return Boolean(getAdminAccessToken());
}

/** JWT payload fields included on admin login (used for top bar profile). */
export type AdminJwtPayload = {
  sub?: string;
  email?: string;
  username?: string;
  role?: string;
};

export function decodeAdminAccessToken(): AdminJwtPayload | null {
  const token = getAdminAccessToken();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) {
      base64 += '='.repeat(4 - pad);
    }
    const json = atob(base64);
    return JSON.parse(json) as AdminJwtPayload;
  } catch {
    return null;
  }
}

export function buildAdminApiUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && `${v}`.length > 0) {
        url.searchParams.set(k, String(v));
      }
    });
  }
  return url.toString();
}

/** Pull a user-facing string from Nest/global exception JSON (handles nested `message`). */
export function formatApiErrorBody(body: string, status: number): string {
  const fallback = `Something went wrong (${status})`;
  const trimmed = body?.trim();
  if (!trimmed) {
    return fallback;
  }
  try {
    const data = JSON.parse(trimmed) as {
      message?: string | string[] | { message?: string | string[]; error?: string };
    };
    const raw = data.message;
    if (typeof raw === 'string') {
      return raw;
    }
    if (Array.isArray(raw)) {
      return raw.join(', ');
    }
    if (raw && typeof raw === 'object') {
      const inner = raw.message;
      if (typeof inner === 'string') {
        return inner;
      }
      if (Array.isArray(inner)) {
        return inner.join(', ');
      }
      if (typeof raw.error === 'string') {
        return raw.error;
      }
    }
    return fallback;
  } catch {
    return trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed;
  }
}

export async function adminApi<T>(
  path: string,
  init?: RequestInit,
  query?: Record<string, QueryValue>,
): Promise<T> {
  const token = getAdminAccessToken();
  const response = await fetch(buildAdminApiUrl(path, query), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(formatApiErrorBody(body, response.status));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function adminLogin(email: string, password: string): Promise<void> {
  const res = await adminApi<{ accessToken: string; refreshToken: string }>(
    '/admin/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
  );
  setAdminTokens(res.accessToken, res.refreshToken);
}

export type AdminPublicConfig = { brandName: string };

let publicConfigCache: AdminPublicConfig | null = null;
let publicConfigInflight: Promise<AdminPublicConfig> | null = null;

/** Unauthenticated; reads `admin_brand_name` from AppSettings (plus env fallback on server). */
export async function fetchAdminPublicConfig(): Promise<AdminPublicConfig> {
  if (publicConfigCache) return publicConfigCache;
  if (!publicConfigInflight) {
    publicConfigInflight = (async () => {
      const response = await fetch(buildAdminApiUrl('/admin/public-config'), { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(formatApiErrorBody(body, response.status));
      }
      const data = (await response.json()) as AdminPublicConfig;
      publicConfigCache = data;
      return data;
    })().finally(() => {
      publicConfigInflight = null;
    });
  }
  return publicConfigInflight;
}

export function clearAdminPublicConfigCache(): void {
  publicConfigCache = null;
}
