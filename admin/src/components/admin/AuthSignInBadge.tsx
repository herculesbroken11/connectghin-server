/** Badge for mobile app sign-in method (`User.authProvider`). */
export function authSignInLabel(provider: string | undefined): string {
  switch (provider) {
    case 'GOOGLE':
      return 'Google Sign-In';
    case 'APPLE':
      return 'Apple Sign-In';
    case 'EMAIL':
      return 'Email & password';
    default:
      return '—';
  }
}

export function AuthSignInBadge({ provider, compact }: { provider: string | undefined; compact?: boolean }) {
  const badge = signInBadgeStyle(provider);
  if (!badge) {
    return compact ? null : <span className="text-sm text-gray-500 dark:text-gray-400">—</span>;
  }
  return (
    <span
      className={`inline-flex rounded-full font-semibold uppercase tracking-wide ${badge.className} ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
      }`}
    >
      {badge.label}
    </span>
  );
}

function signInBadgeStyle(provider: string | undefined): { label: string; className: string } | null {
  switch (provider) {
    case 'GOOGLE':
      return {
        label: 'Google',
        className: 'bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100',
      };
    case 'APPLE':
      return {
        label: 'Apple',
        className: 'bg-gray-800 text-white dark:bg-gray-600 dark:text-white',
      };
    case 'EMAIL':
      return {
        label: 'Email',
        className: 'bg-violet-50 text-violet-800 dark:bg-violet-900/40 dark:text-violet-100',
      };
    default:
      return null;
  }
}
