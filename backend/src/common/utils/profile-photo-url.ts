/**
 * Stored profile photo URLs may point at localhost or an old host from upload time.
 * Rewrite upload paths to API_PUBLIC_BASE_URL (or request host) so mobile clients can load them.
 */
export function normalizeProfilePhotoUrl(stored: string | null | undefined): string | null {
  if (stored == null || stored.trim() === '') {
    return null;
  }
  const trimmed = stored.trim();

  // External CDN / Unsplash — keep as-is.
  if (/^https:\/\//i.test(trimmed) && !isLocalOrPrivateHost(trimmed)) {
    return trimmed;
  }

  const publicBase = resolvePublicApiBase();
  const filename = extractProfilePhotoFilename(trimmed);
  if (filename && publicBase) {
    return `${publicBase}/api/v1/uploads/profile-photos/${filename}`;
  }

  if (trimmed.startsWith('/api/v1/') && publicBase) {
    return `${publicBase}${trimmed}`;
  }

  if (trimmed.startsWith('/uploads/profile-photos/') && publicBase) {
    return `${publicBase}/api/v1${trimmed}`;
  }

  // http://localhost or legacy host — rewrite path if we can parse it.
  if (/^https?:\/\//i.test(trimmed) && publicBase) {
    const path = tryParseUrlPath(trimmed);
    const legacyFilename = path ? extractProfilePhotoFilename(path) : null;
    if (legacyFilename) {
      return `${publicBase}/api/v1/uploads/profile-photos/${legacyFilename}`;
    }
  }

  return trimmed;
}

function resolvePublicApiBase(): string | null {
  const fromEnv = process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv;
  }
  return null;
}

function isLocalOrPrivateHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '10.0.2.2' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.')
    );
  } catch {
    return false;
  }
}

function tryParseUrlPath(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

export function extractProfilePhotoFilename(pathOrUrl: string): string | null {
  const match = pathOrUrl.match(/\/uploads\/profile-photos\/([^/?#]+)$/i);
  if (!match?.[1]) {
    return null;
  }
  const safe = match[1].split('/').pop();
  return safe && safe.length > 0 ? safe : null;
}

export function normalizeUserProfilePhotos<T extends { profilePhotos?: { imageUrl: string }[] }>(
  user: T | null | undefined,
): T | null | undefined {
  if (!user?.profilePhotos?.length) {
    return user;
  }
  return {
    ...user,
    profilePhotos: user.profilePhotos.map((p) => ({
      ...p,
      imageUrl: normalizeProfilePhotoUrl(p.imageUrl) ?? p.imageUrl,
    })),
  };
}

export function normalizeProfileRow<
  T extends { user?: { profilePhotos?: { imageUrl: string }[] } | null },
>(row: T): T {
  if (!row.user) {
    return row;
  }
  return {
    ...row,
    user: normalizeUserProfilePhotos(row.user) ?? row.user,
  };
}
