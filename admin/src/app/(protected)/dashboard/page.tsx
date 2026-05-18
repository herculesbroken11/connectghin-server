'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Activity, ClipboardList, Crown, Flag, RefreshCcw, ShieldCheck, UserPlus, Users } from 'lucide-react';

import { DashboardActivityCard, type ActivityRow } from '../../../components/admin/DashboardActivity';
import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { AppleGlyph, GooglePlayGlyph } from '../../../components/admin/StorePlatformIcons';
import { adminApi } from '../../../lib/api';

type DashboardTrends = {
  totalUsersPct: number | null;
  activeUsersPct: number | null;
  premiumUsersPct: number | null;
  pendingGhinPct: number | null;
  openReportsPct: number | null;
  activeSubscriptionsPct: number | null;
  verifiedUsersPct: number | null;
};

type DashboardStats = {
  totalUsers: number;
  activeUsers: number;
  premiumUsers: number;
  verifiedUsers: number;
  pendingGhin: number;
  openReports: number;
  newUsersLast7Days?: number;
  activeSubscriptions?: number;
  estimatedMrrCents?: number;
  premiumSubscriptions?: {
    activeApple: number;
    activeGoogle: number;
    appleSharePct: number | null;
    googleSharePct: number | null;
    newAppleLast7Days: number;
    newGoogleLast7Days: number;
    newAppleTrendPct: number | null;
    newGoogleTrendPct: number | null;
  };
  inAppPurchaseSync?: {
    lastEntitlementSyncAt: string | null;
    entitlementSyncsLast7Days: number;
    entitlementSyncsAppleLast7Days: number;
    entitlementSyncsGoogleLast7Days: number;
    usersWithReceiptSyncRecorded: number;
    activeEntitlements: number;
  };
  trends?: DashboardTrends;
};

type GhinUser = {
  id: string;
  username: string;
  profile?: { displayName?: string | null } | null;
};

type GhinPendingRow = {
  id: string;
  userId: string;
  user?: GhinUser | null;
  status: string;
  ghinNumber?: string;
  handicapSnapshot?: string | number | null;
  submittedAt: string;
};

type ReportUserBrief = {
  id: string;
  username: string;
  profile?: { displayName?: string | null } | null;
};

type ReportRow = {
  id: string;
  reason: string;
  status: string;
  targetUserId: string;
  reportedByUserId: string;
  createdAt: string;
  reportedBy?: ReportUserBrief | null;
  targetUser?: ReportUserBrief | null;
};

type SignupUserRow = {
  id: string;
  email: string;
  username: string;
  membershipType: string;
  createdAt: string;
  profile?: { displayName?: string | null; isGHINVerified?: boolean | null } | null;
};

const nf = new Intl.NumberFormat();

const moneyUsd = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatWeekNewLabel(n: number): string {
  if (n === 0) return '0 this week';
  return `${n > 0 ? '+' : ''}${n} this week`;
}

function shortUserRef(u: ReportUserBrief | undefined | null, fallbackId: string): string {
  if (u?.profile?.displayName?.trim()) return u.profile.displayName.trim();
  if (u?.username) return u.username;
  const id = u?.id ?? fallbackId;
  return `User #${id.length > 6 ? id.slice(-6) : id}`;
}

function TrendLine({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) {
    return <span className="text-sm font-medium text-gray-400 dark:text-gray-500">—</span>;
  }
  const up = pct >= 0;
  return (
    <span
      className={`text-sm font-semibold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
    >
      {up ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  );
}

function SecondaryKpiCard({
  label,
  value,
  trendPct,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: number;
  trendPct: number | null | undefined;
  icon: typeof ShieldCheck;
  iconClass: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white">{nf.format(value)}</p>
          <div className="mt-2">
            <TrendLine pct={trendPct} />
          </div>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  trendPct,
  variant,
  kpiIcon: KpiIcon,
}: {
  label: string;
  value: number;
  trendPct: number | null | undefined;
  variant: 'trend' | 'warning' | 'danger';
  kpiIcon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          <KpiIcon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white">{nf.format(value)}</p>
      <div
        className={`mt-3 flex items-center gap-2 ${variant === 'trend' ? 'justify-start' : 'min-h-[2.25rem] justify-between'}`}
      >
        <TrendLine pct={trendPct} />
        {variant === 'warning' && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
            <AlertCircle className="h-5 w-5" aria-hidden />
          </span>
        )}
        {variant === 'danger' && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/45 dark:text-red-200">
            <AlertCircle className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      <Link
        href={href}
        className="shrink-0 text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function reportStatusPill(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100';
    case 'REVIEWED':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-200';
    case 'RESOLVED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100';
    case 'DISMISSED':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [pendingGhin, setPendingGhin] = useState<GhinPendingRow[]>([]);
  const [latestReports, setLatestReports] = useState<ReportRow[]>([]);
  const [signups, setSignups] = useState<SignupUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, activityRes, ghinRes, reportsRes, usersRes] = await Promise.all([
          adminApi<DashboardStats>('/admin/dashboard/stats'),
          adminApi<{ items: ActivityRow[] }>('/admin/dashboard/activity', undefined, { limit: 6 }),
          adminApi<{ items: GhinPendingRow[] }>('/admin/ghin-requests', undefined, {
            status: 'PENDING',
            page: 0,
            pageSize: 5,
            sortBy: 'submittedAt',
            sortDir: 'desc',
          }),
          adminApi<{ items: ReportRow[] }>('/admin/reports', undefined, {
            page: 0,
            pageSize: 5,
            sortBy: 'createdAt',
            sortDir: 'desc',
          }),
          adminApi<{ items: SignupUserRow[] }>('/admin/users', undefined, {
            page: 0,
            pageSize: 5,
            sortBy: 'createdAt',
            sortDir: 'desc',
          }),
        ]);
        if (cancelled) return;
        setStats(statsRes);
        setActivity(activityRes.items);
        setPendingGhin(ghinRes.items);
        setLatestReports(reportsRes.items);
        setSignups(usersRes.items);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load dashboard');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tr = stats?.trends;

  return (
    <AdminPageShell title="Dashboard">
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      )}

      {stats === null && !error && (
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Loading dashboard…</p>
      )}

      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Total users" value={stats.totalUsers} trendPct={tr?.totalUsersPct} variant="trend" kpiIcon={Users} />
          <KpiCard label="Active users" value={stats.activeUsers} trendPct={tr?.activeUsersPct} variant="trend" kpiIcon={Activity} />
          <KpiCard label="Premium users" value={stats.premiumUsers} trendPct={tr?.premiumUsersPct} variant="trend" kpiIcon={Crown} />
          <KpiCard label="Pending verifications" value={stats.pendingGhin} trendPct={tr?.pendingGhinPct} variant="warning" kpiIcon={ClipboardList} />
          <KpiCard label="Open reports" value={stats.openReports} trendPct={tr?.openReportsPct} variant="danger" kpiIcon={Flag} />
          <KpiCard
            label="Active subscriptions"
            value={stats.activeSubscriptions ?? 0}
            trendPct={tr?.activeSubscriptionsPct}
            variant="trend"
            kpiIcon={RefreshCcw}
          />
        </div>
      )}

      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SecondaryKpiCard
            label="GHIN verified profiles"
            value={stats.verifiedUsers}
            trendPct={tr?.verifiedUsersPct}
            icon={ShieldCheck}
            iconClass="bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
          />
          <SecondaryKpiCard
            label="New signups (last 7 days)"
            value={stats.newUsersLast7Days ?? 0}
            trendPct={tr?.totalUsersPct}
            icon={UserPlus}
            iconClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
          />
        </div>
      )}

      {stats?.premiumSubscriptions && stats?.inAppPurchaseSync && (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Premium subscriptions</h2>
              <Link
                href="/subscriptions"
                className="shrink-0 text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400"
              >
                View all
              </Link>
            </div>
            <ul className="space-y-4">
              <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#1d1d1f] shadow-sm ring-1 ring-black/5 dark:bg-gray-800 dark:text-white dark:ring-white/10">
                    <AppleGlyph className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">iOS (App Store)</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.premiumSubscriptions.appleSharePct != null
                        ? `${stats.premiumSubscriptions.appleSharePct}% of store subs`
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                    {nf.format(stats.premiumSubscriptions.activeApple)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatWeekNewLabel(stats.premiumSubscriptions.newAppleLast7Days)}</span>
                    {stats.premiumSubscriptions.newAppleTrendPct != null ? (
                      <span className="ml-1 inline-block">
                        <TrendLine pct={stats.premiumSubscriptions.newAppleTrendPct} />
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
              <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10">
                    <GooglePlayGlyph className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Android (Google Play)</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.premiumSubscriptions.googleSharePct != null
                        ? `${stats.premiumSubscriptions.googleSharePct}% of store subs`
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                    {nf.format(stats.premiumSubscriptions.activeGoogle)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatWeekNewLabel(stats.premiumSubscriptions.newGoogleLast7Days)}</span>
                    {stats.premiumSubscriptions.newGoogleTrendPct != null ? (
                      <span className="ml-1 inline-block">
                        <TrendLine pct={stats.premiumSubscriptions.newGoogleTrendPct} />
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Total active (all stores)
                </p>
                <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                  {nf.format(stats.activeSubscriptions ?? 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Est. monthly revenue
                </p>
                <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {typeof stats.estimatedMrrCents === 'number' && stats.estimatedMrrCents > 0
                    ? `${moneyUsd.format(stats.estimatedMrrCents / 100)}/mo`
                    : '—'}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                  From recorded plan amounts; not a tax invoice.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">In-app purchase sync</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-100">
                Live
              </span>
            </div>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              Receipt verification and entitlement updates from Apple and Google.
            </p>
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
                <span>Activity (last 7 days)</span>
                <span>{nf.format(stats.inAppPurchaseSync.entitlementSyncsLast7Days)} events</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-connect-600 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      stats.inAppPurchaseSync.entitlementSyncsLast7Days > 0
                        ? Math.max(12, Math.log10(stats.inAppPurchaseSync.entitlementSyncsLast7Days + 1) * 35)
                        : 4,
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Last entitlement sync:{' '}
                {stats.inAppPurchaseSync.lastEntitlementSyncAt
                  ? formatDistanceToNow(new Date(stats.inAppPurchaseSync.lastEntitlementSyncAt), {
                      addSuffix: true,
                    })
                  : 'No events yet'}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Users with receipt sync</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                  {nf.format(stats.inAppPurchaseSync.usersWithReceiptSyncRecorded)}
                </dd>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Active entitlements</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                  {nf.format(stats.inAppPurchaseSync.activeEntitlements)}
                </dd>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <dt className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#1d1d1f] shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:text-white dark:ring-white/10">
                    <AppleGlyph className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  iOS syncs (7d)
                </dt>
                <dd className="mt-1 font-semibold tabular-nums text-gray-900 dark:text-white">
                  {nf.format(stats.inAppPurchaseSync.entitlementSyncsAppleLast7Days)}
                </dd>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <dt className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
                    <GooglePlayGlyph className="h-4 w-4" aria-hidden />
                  </span>
                  Android syncs (7d)
                </dt>
                <dd className="mt-1 font-semibold tabular-nums text-gray-900 dark:text-white">
                  {nf.format(stats.inAppPurchaseSync.entitlementSyncsGoogleLast7Days)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
              Sync errors are monitored via server logs; this panel shows successful entitlement sync events only.
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <SectionHeader title="Pending GHIN verifications" href="/verification" linkLabel="View All" />
          {pendingGhin.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {pendingGhin.map((row) => {
                const name =
                  row.user?.profile?.displayName?.trim() || row.user?.username?.replace(/_/g, ' ') || 'Golfer';
                const hcp =
                  row.handicapSnapshot != null && row.handicapSnapshot !== ''
                    ? ` · Hcp ${row.handicapSnapshot}`
                    : '';
                return (
                  <li key={row.id}>
                    <Link
                      href={`/verification/${row.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition hover:bg-gray-50/80 dark:hover:bg-gray-900/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900 dark:text-white">{name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          GHIN {row.ghinNumber ?? '—'}
                          {hcp}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {formatDistanceToNow(new Date(row.submittedAt), { addSuffix: true })}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                        Pending
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <SectionHeader title="Latest reports" href="/reports" linkLabel="View All" />
          {latestReports.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No reports yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {latestReports.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/reports/${row.id}`}
                    className="block py-3 transition hover:bg-gray-50/80 dark:hover:bg-gray-900/40"
                  >
                    <p className="font-medium text-gray-900 dark:text-white">{row.reason}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {shortUserRef(row.reportedBy, row.reportedByUserId)} →{' '}
                      {shortUserRef(row.targetUser, row.targetUserId)}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${reportStatusPill(row.status)}`}>
                        {row.status === 'OPEN'
                          ? 'Open'
                          : row.status === 'REVIEWED'
                            ? 'Reviewed'
                            : row.status === 'RESOLVED'
                              ? 'Resolved'
                              : row.status === 'DISMISSED'
                                ? 'Dismissed'
                                : row.status}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader title="Recent user signups" href="/users" linkLabel="View All Users" />
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-900/80 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Membership</th>
                <th className="px-4 py-3">GHIN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {signups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No users yet.
                  </td>
                </tr>
              ) : (
                signups.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-900/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <Link href={`/users/${u.id}`} className="hover:text-connect-700 dark:hover:text-connect-400">
                        {u.profile?.displayName || u.username}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.email}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.membershipType === 'PREMIUM'
                            ? 'inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-900/40 dark:text-sky-100'
                            : 'inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
                        }
                      >
                        {u.membershipType === 'PREMIUM' ? 'Premium' : 'Free'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.profile?.isGHINVerified
                            ? 'inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
                            : 'inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                        }
                      >
                        {u.profile?.isGHINVerified ? 'Verified' : 'Not started'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DashboardActivityCard items={activity} />
    </AdminPageShell>
  );
}
