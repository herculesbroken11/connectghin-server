'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Flag,
  KeyRound,
  Settings,
  ShieldCheck,
  ShieldOff,
  Store,
  UserCheck,
  UserMinus,
  UserX,
} from 'lucide-react';

import { clsx } from 'clsx';

import { AppleGlyph, GooglePlayGlyph } from './StorePlatformIcons';

export type ActivityIconVariant =
  | 'ghin-approve'
  | 'ghin-reject'
  | 'user-suspend'
  | 'user-restore'
  | 'user-delete'
  | 'report-review'
  | 'report-resolve'
  | 'subscription'
  | 'settings'
  | 'admin-login'
  | 'system';

export type ActivityRow = {
  id: string;
  type: 'verification' | 'user' | 'report' | 'billing' | 'settings' | 'system';
  iconVariant?: ActivityIconVariant;
  action: string;
  description: string;
  at: string;
  admin: string;
  severity: 'success' | 'warning' | 'error' | 'info';
  /** App Store / Google Play when audit metadata or linked subscription resolves it. */
  storeProvider?: 'APPLE_APP_STORE' | 'GOOGLE_PLAY' | string | null;
};

function fallbackIconVariant(type: ActivityRow['type']): ActivityIconVariant {
  if (type === 'verification') return 'ghin-approve';
  if (type === 'user') return 'user-suspend';
  if (type === 'report') return 'report-review';
  if (type === 'billing') return 'subscription';
  if (type === 'settings') return 'settings';
  return 'system';
}

function activityVisual(v: ActivityIconVariant): {
  Icon: typeof ShieldCheck;
  ring: string;
  icon: string;
  showSuccessBadge?: boolean;
  showWarningBadge?: boolean;
} {
  switch (v) {
    case 'ghin-approve':
      return {
        Icon: ShieldCheck,
        ring: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200',
        icon: '',
        showSuccessBadge: true,
      };
    case 'ghin-reject':
      return {
        Icon: ShieldOff,
        ring: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
        icon: '',
        showWarningBadge: true,
      };
    case 'user-suspend':
      return {
        Icon: UserMinus,
        ring: 'bg-amber-100 text-amber-800 dark:bg-amber-900/45 dark:text-amber-100',
        icon: '',
        showWarningBadge: true,
      };
    case 'user-restore':
      return {
        Icon: UserCheck,
        ring: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-100',
        icon: '',
        showSuccessBadge: true,
      };
    case 'user-delete':
      return {
        Icon: UserX,
        ring: 'bg-red-100 text-red-700 dark:bg-red-900/45 dark:text-red-100',
        icon: '',
      };
    case 'report-review':
      return {
        Icon: Flag,
        ring: 'bg-sky-100 text-sky-800 dark:bg-sky-900/45 dark:text-sky-100',
        icon: '',
      };
    case 'report-resolve':
      return {
        Icon: CheckCircle2,
        ring: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/45 dark:text-indigo-100',
        icon: '',
        showSuccessBadge: true,
      };
    case 'subscription':
      return {
        Icon: Store,
        ring: 'bg-violet-100 text-violet-800 dark:bg-violet-900/45 dark:text-violet-100',
        icon: '',
        showSuccessBadge: true,
      };
    case 'settings':
      return {
        Icon: Settings,
        ring: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        icon: '',
      };
    case 'admin-login':
      return {
        Icon: KeyRound,
        ring: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
        icon: '',
      };
    default:
      return {
        Icon: Activity,
        ring: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
        icon: '',
      };
  }
}

function barColor(severity: ActivityRow['severity']) {
  if (severity === 'success') return 'bg-emerald-500';
  if (severity === 'warning') return 'bg-amber-500';
  if (severity === 'error') return 'bg-red-500';
  return 'bg-slate-400 dark:bg-slate-500';
}

export function DashboardActivity({ items }: { items: ActivityRow[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">No recent admin activity yet.</p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((row) => {
        const variant = row.iconVariant ?? fallbackIconVariant(row.type);
        const { Icon, ring, showSuccessBadge, showWarningBadge } = activityVisual(variant);
        const billingStoreIcon =
          row.storeProvider === 'APPLE_APP_STORE' || row.storeProvider === 'GOOGLE_PLAY' ? row.storeProvider : null;
        return (
          <li
            key={row.id}
            className="flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
          >
            <div className={clsx('w-1 shrink-0', barColor(row.severity))} aria-hidden />
            <div className="flex min-w-0 flex-1 items-start gap-3 p-4">
              <span
                className={clsx(
                  'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-inner',
                  billingStoreIcon
                    ? 'bg-white ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10'
                    : ring,
                )}
              >
                {billingStoreIcon === 'APPLE_APP_STORE' ? (
                  <AppleGlyph className="h-5 w-5 text-[#1d1d1f] dark:text-white" aria-hidden />
                ) : billingStoreIcon === 'GOOGLE_PLAY' ? (
                  <GooglePlayGlyph className="h-5 w-5" aria-hidden />
                ) : (
                  <Icon className="h-5 w-5" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.action}</p>
                  {showSuccessBadge && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  )}
                  {showWarningBadge && (
                    <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                  )}
                </div>
                {row.description ? (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{row.description}</p>
                ) : null}
                {row.admin ? (
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    by <span className="font-medium text-gray-700 dark:text-gray-300">{row.admin}</span>
                  </p>
                ) : null}
              </div>
              <time
                className="shrink-0 pt-0.5 text-xs font-medium tabular-nums text-gray-400 dark:text-gray-500"
                dateTime={row.at}
              >
                {formatDistanceToNow(new Date(row.at), { addSuffix: true })}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardActivityCard({ items }: { items: ActivityRow[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent activity</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Latest admin actions and system events
        </p>
      </div>
      <DashboardActivity items={items} />
      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-700">
        <Link
          href="/audit-logs"
          className="text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400"
        >
          View all activity
        </Link>
      </div>
    </div>
  );
}
