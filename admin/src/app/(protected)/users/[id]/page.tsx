'use client';

import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Calendar,
  Clock,
  CreditCard,
  Crown,
  Eye,
  Flag,
  Hash,
  Mail,
  MapPin,
  MessageSquare,
  Shield,
  Trash2,
  UserX,
  Users,
  ArrowLeftRight,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { AdminPageShell } from '../../../../components/admin/AdminPageShell';
import { useToast } from '../../../../context/ToastContext';
import { adminApi } from '../../../../lib/api';

type SubscriptionRow = {
  id: string;
  planCode: string;
  billingCycle: string;
  amount: number | null;
  currency: string | null;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
};

type ProfileDetail = {
  displayName: string;
  bio?: string | null;
  age?: number | null;
  city?: string | null;
  state?: string | null;
  handicap?: string | number | null;
  homeCourse?: string | null;
  lookingFor?: string | null;
  isGHINVerified?: boolean;
} | null;

type GhinRequest = {
  ghinNumber: string;
  status: string;
  submittedAt: string;
} | null;

type ReportRow = { id: string; reason: string; status: string; createdAt: string };

type UserDetail = {
  id: string;
  email: string;
  username: string;
  authProvider?: string;
  membershipType: string;
  isSuspended: boolean;
  isActive: boolean;
  lifecycleStatus?: string;
  createdAt: string;
  lastLoginAt: string | null;
  profile: ProfileDetail;
  subscriptions: SubscriptionRow[];
  primaryProfilePhoto: { imageUrl: string } | null;
  stats: {
    matchesCount: number;
    messagesCount: number;
    swipesCount: number;
    profileViewsCount: number;
    reportsReceivedCount: number;
    reportsMadeCount: number;
    blocksCreated: number;
  };
  latestGhinRequest: GhinRequest;
  recentReportsAgainstUser: ReportRow[];
  lifetimeValueCents: number | null;
  lifetimeValueSource?: 'billing_events' | 'estimated' | null;
};

const nf = new Intl.NumberFormat();

function moneyFromCents(cents: number | null, currency: string | null): string {
  if (cents == null) return '—';
  const cur = (currency || 'usd').toUpperCase();
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(cents / 100);
}

function initials(name: string, username: string): string {
  const n = name.trim();
  if (n.length >= 2) {
    const p = n.split(/\s+/);
    if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase() || '?';
}

function ghinLabel(profile: ProfileDetail, latest: GhinRequest): string {
  if (profile?.isGHINVerified) return 'Verified';
  const st = latest?.status;
  if (st === 'PENDING' || st === 'APPEAL') return 'Pending';
  return 'Not started';
}

function signInMethodLabel(p: string | undefined): string {
  switch (p) {
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

/** When `NEXT_PUBLIC_PUBLIC_PROFILE_URL` is set, build a link (supports `{{username}}` in the template). */
function buildPublicProfileUrl(username: string): string | null {
  const raw = process.env.NEXT_PUBLIC_PUBLIC_PROFILE_URL?.trim();
  if (!raw) return null;
  if (raw.includes('{{username}}')) {
    return raw.replace(/\{\{username\}\}/g, encodeURIComponent(username));
  }
  const base = raw.replace(/\/$/, '');
  return `${base}/${encodeURIComponent(username)}`;
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const id = params.id;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    setError(null);
    return adminApi<UserDetail>(`/admin/users/${id}`)
      .then(setUser)
      .catch((e) => {
        setUser(null);
        setError(e instanceof Error ? e.message : 'Failed to load user');
      });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSub = useMemo(() => {
    if (!user?.subscriptions?.length) return null;
    return (
      user.subscriptions.find((s) => s.status === 'ACTIVE' || s.status === 'TRIALING') ?? user.subscriptions[0]
    );
  }, [user]);

  const isDeleted = user?.lifecycleStatus === 'DELETED';

  const publicProfileUrl = useMemo(() => (user && !isDeleted ? buildPublicProfileUrl(user.username) : null), [user, isDeleted]);

  const toggleSuspend = async () => {
    if (!user || isDeleted) return;
    try {
      await adminApi<{ ok: true }>(`/admin/users/${id}/${user.isSuspended ? 'restore' : 'suspend'}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      toast.success(user.isSuspended ? 'User restored' : 'User suspended');
      await load();
    } catch {
      toast.error('Action failed');
    }
  };

  const deleteUser = async () => {
    if (!user || isDeleted) return;
    if (
      !window.confirm(
        'Archive this user? They will be signed out, removed from the user directory, and their login identifiers freed. This cannot be undone.',
      )
    ) {
      return;
    }
    try {
      await adminApi<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' });
      toast.success('User archived');
      router.push('/users');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const displayName = user?.profile?.displayName?.trim() || user?.username || '';
  const location =
    user?.profile?.city || user?.profile?.state
      ? [user.profile.city, user.profile.state].filter(Boolean).join(', ')
      : null;
  const handicapStr =
    user?.profile?.handicap !== undefined && user?.profile?.handicap !== null && `${user.profile.handicap}` !== ''
      ? String(user.profile.handicap)
      : null;

  const ghinNumber =
    user?.profile?.isGHINVerified || user?.latestGhinRequest?.status === 'PENDING'
      ? user?.latestGhinRequest?.ghinNumber
      : null;

  const cardClass =
    'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/90';

  return (
    <AdminPageShell title="User Details">
      <button
        type="button"
        onClick={() => router.push('/users')}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-connect-700 hover:underline dark:text-connect-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </button>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {user && (
        <div className="space-y-6">
          {isDeleted && (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
              role="status"
            >
              This account was <strong>archived (deleted)</strong>. It no longer appears in the user list and cannot sign in.
            </div>
          )}
          <section className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="flex shrink-0 items-start gap-4">
                {user.primaryProfilePhoto?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin avatars from arbitrary storage URLs
                  <img
                    src={user.primaryProfilePhoto.imageUrl}
                    alt=""
                    className="h-20 w-20 rounded-full border border-gray-200 object-cover dark:border-gray-600"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-600 dark:bg-gray-600 dark:text-gray-100">
                    {initials(displayName, user.username)}
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{displayName}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        user.membershipType === 'PREMIUM'
                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-100'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {user.membershipType === 'PREMIUM' ? 'Premium' : 'Free'}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        user.isSuspended
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100'
                      }`}
                    >
                      {user.isSuspended ? 'Suspended' : 'Active'}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        user.profile?.isGHINVerified
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {ghinLabel(user.profile, user.latestGhinRequest)}
                    </span>
                    {isDeleted && (
                      <span className="inline-flex rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-gray-600">
                        Archived
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
              {user.lastLoginAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-gray-400" />
                  Last active {formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-gray-400" />
                {user.email}
              </span>
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {location}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-gray-400" />
                Joined {format(new Date(user.createdAt), 'MMM d, yyyy')}
              </span>
              {ghinNumber && (
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="h-4 w-4 text-gray-400" />
                  GHIN: {ghinNumber}
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Matches', value: user.stats.matchesCount, accent: 'text-emerald-600 dark:text-emerald-400', Icon: Users },
                { label: 'Messages', value: user.stats.messagesCount, accent: 'text-sky-600 dark:text-sky-400', Icon: MessageSquare },
                {
                  label: 'Swipes',
                  value: user.stats.swipesCount,
                  accent: 'text-violet-600 dark:text-violet-400',
                  Icon: ArrowLeftRight,
                },
                {
                  label: 'Profile views',
                  value: user.stats.profileViewsCount,
                  accent: 'text-amber-600 dark:text-amber-400',
                  Icon: Eye,
                },
              ].map(({ label, value, accent, Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40"
                >
                  <Icon className={`h-5 w-5 ${accent}`} />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
                    <p className={`text-xl font-semibold tabular-nums ${accent}`}>{nf.format(value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <section className={cardClass}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Profile</h2>
                {user.profile?.bio ? (
                  <p className="mt-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{user.profile.bio}</p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No bio provided.</p>
                )}
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Age</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                      {user.profile?.age != null ? user.profile.age : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Handicap</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{handicapStr ?? '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Home course</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                      {user.profile?.homeCourse || '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Looking for</dt>
                    <dd className="mt-1 text-sm text-gray-800 dark:text-gray-200">{user.profile?.lookingFor || '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className={cardClass}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <Flag className="h-4 w-4 text-amber-500" />
                  Moderation & reports
                </h2>
                {user.recentReportsAgainstUser.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No recent reports against this user.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {user.recentReportsAgainstUser.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-lg border-l-4 border-amber-400 bg-amber-50/60 px-3 py-2 dark:border-amber-500 dark:bg-amber-950/30"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Report · {r.status}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{r.reason}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {format(new Date(r.createdAt), 'MMM d, yyyy')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4">
                  <Link
                    href="/reports"
                    className="text-sm font-medium text-connect-700 hover:underline dark:text-connect-400"
                  >
                    Open reports queue
                  </Link>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className={cardClass}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Admin actions</h2>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={toggleSuspend}
                    disabled={isDeleted}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                      user.isSuspended
                        ? 'bg-connect-600 hover:bg-connect-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    <UserX className="h-4 w-4" />
                    {user.isSuspended ? 'Restore user' : 'Suspend user'}
                  </button>
                  <Link
                    href="/reports"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    <Flag className="h-4 w-4" />
                    View reports ({user.stats.reportsReceivedCount})
                  </Link>
                  {activeSub ? (
                    <Link
                      href={`/subscriptions/${activeSub.id}`}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                      <CreditCard className="h-4 w-4" />
                      View subscription
                    </Link>
                  ) : (
                    <Link
                      href="/subscriptions"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                      <CreditCard className="h-4 w-4" />
                      Subscriptions
                    </Link>
                  )}
                  <Link
                    href="/verification"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    <Shield className="h-4 w-4" />
                    GHIN verification
                  </Link>
                  {publicProfileUrl ? (
                    <a
                      href={publicProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                      <Eye className="h-4 w-4" />
                      View public profile
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Set NEXT_PUBLIC_PUBLIC_PROFILE_URL in admin .env (see .env.example)"
                      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-400 dark:border-gray-600 dark:text-gray-500"
                    >
                      <Eye className="h-4 w-4" />
                      Public profile (configure URL)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={deleteUser}
                    disabled={isDeleted}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/60 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleted ? 'User archived' : 'Delete user'}
                  </button>
                </div>
              </section>

              <section className={cardClass}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <Crown className="h-4 w-4 text-amber-500" />
                  Subscription
                </h2>
                {!activeSub ? (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No subscription on file.</p>
                ) : (
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 dark:text-gray-400">Plan</dt>
                      <dd className="text-right font-medium text-gray-900 dark:text-white">
                        {activeSub.planCode} · {activeSub.billingCycle}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                      <dd>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            activeSub.status === 'ACTIVE' || activeSub.status === 'TRIALING'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100'
                              : activeSub.status === 'CANCELED' || activeSub.status === 'EXPIRED'
                                ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                                : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                          }`}
                        >
                          {activeSub.status}
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 dark:text-gray-400">Amount</dt>
                      <dd className="font-medium text-gray-900 dark:text-white">
                        {activeSub.amount != null
                          ? moneyFromCents(activeSub.amount, activeSub.currency)
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 dark:text-gray-400">Next billing</dt>
                      <dd className="font-medium text-gray-900 dark:text-white">
                        {activeSub.currentPeriodEnd
                          ? format(new Date(activeSub.currentPeriodEnd), 'MMM d, yyyy')
                          : '—'}
                      </dd>
                    </div>
                    {user.lifetimeValueCents != null && (
                      <div className="border-t border-gray-100 pt-3 dark:border-gray-700">
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-500 dark:text-gray-400">
                            {user.lifetimeValueSource === 'billing_events'
                              ? 'Lifetime value (billing records)'
                              : 'Est. lifetime value'}
                          </dt>
                          <dd className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {moneyFromCents(user.lifetimeValueCents, activeSub.currency)}
                          </dd>
                        </div>
                        {user.lifetimeValueSource === 'estimated' && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Based on plan price and time on file — no successful invoice webhooks recorded yet.
                          </p>
                        )}
                        {user.lifetimeValueSource === 'billing_events' && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Sum of <code className="rounded bg-gray-100 px-1 dark:bg-gray-900">invoice.payment_succeeded</code>{' '}
                            amounts from billing webhooks.
                          </p>
                        )}
                      </div>
                    )}
                  </dl>
                )}
              </section>

              <section className={cardClass}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Account</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">User ID</dt>
                    <dd className="font-mono text-xs text-gray-900 dark:text-white">{user.id}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">Sign-in method</dt>
                    <dd className="text-right font-medium text-gray-900 dark:text-white">
                      {signInMethodLabel(user.authProvider)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">Last login</dt>
                    <dd className="text-right text-gray-900 dark:text-white">
                      {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'MMM d, yyyy h:mm a') : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">Reports received</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{user.stats.reportsReceivedCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">Users blocked</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{user.stats.blocksCreated}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
