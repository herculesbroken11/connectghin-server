import { clsx } from 'clsx';

/** Apple mark for App Store / iOS subscription rows (monochrome). */
export function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.48 0-1.87-.8-3.63-.8-1.76 0-2.07.79-3.61.79-1.49 0-2.652-1.35-3.597-2.69-1.203-1.72-2.002-4.63-2.002-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.87 0 2.222-1.01 3.902-1.01.633 0 2.886.06 4.374 2.19-.13.09-2.607 1.57-2.607 4.66 0 3.7 3.263 4.91 3.363 4.96-.03.1-.63 2.15-1.87 4.23z" />
    </svg>
  );
}

/** Google Play–style badge (simplified; not an official Google trademark asset). */
export function GooglePlayGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#01875f" />
      <path fill="#ffffff" d="M9.5 7.5 9.5 16.5 16.5 12 9.5 7.5z" />
    </svg>
  );
}

export type StoreProvider = 'APPLE_APP_STORE' | 'GOOGLE_PLAY' | string;

export function parseStoreProvider(raw: string | null | undefined): StoreProvider {
  if (raw === 'GOOGLE_PLAY') return 'GOOGLE_PLAY';
  if (raw === 'APPLE_APP_STORE') return 'APPLE_APP_STORE';
  return raw ?? '';
}

export function PlatformLabel({ provider }: { provider: string }) {
  const p = parseStoreProvider(provider);
  if (p === 'GOOGLE_PLAY') return 'Google Play';
  if (p === 'APPLE_APP_STORE') return 'App Store';
  return provider.replace(/_/g, ' ');
}

/** Row in tables: icon + short label (iOS / Android) for known stores; text fallback otherwise. */
export function PlatformTableCell({
  provider,
  compact,
}: {
  provider: string | null | undefined;
  compact?: boolean;
}) {
  if (provider == null || provider === '') {
    return <span className="text-gray-400">—</span>;
  }
  const p = parseStoreProvider(provider);
  const isApple = p === 'APPLE_APP_STORE';
  const isGoogle = p === 'GOOGLE_PLAY';
  if (!isApple && !isGoogle) {
    return (
      <span className="font-medium text-gray-800 dark:text-gray-200">{String(p).replace(/_/g, ' ') || '—'}</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-black/5 dark:ring-white/10',
          isApple ? 'bg-white text-[#1d1d1f] dark:bg-gray-900 dark:text-white' : 'bg-white dark:bg-gray-900',
        )}
      >
        {isApple ? (
          <AppleGlyph className="h-[1.1rem] w-[1.1rem]" />
        ) : (
          <GooglePlayGlyph className="h-5 w-5" />
        )}
      </span>
      <span className="font-medium text-gray-900 dark:text-white">
        {compact ? (isApple ? 'iOS' : 'Android') : <PlatformLabel provider={provider} />}
      </span>
    </span>
  );
}
