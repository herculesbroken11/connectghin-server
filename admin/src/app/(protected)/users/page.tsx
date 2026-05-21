'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Columns3, Search as SearchIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { AuthSignInBadge } from '../../../components/admin/AuthSignInBadge';
import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { useAdminUiCopy } from '../../../context/AdminUiCopyContext';
import { adminApi } from '../../../lib/api';
import { useDebounced } from '../../../lib/useDebounced';

type UserSegment = 'all' | 'active' | 'suspended' | 'premium' | 'free' | 'verified';

type UsersSummary = {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  premiumUsers: number;
  freeUsers: number;
  verifiedProfiles: number;
  emailSignInUsers: number;
  googleSignInUsers: number;
  appleSignInUsers: number;
};

type ProfileLite = {
  displayName?: string;
  city?: string | null;
  state?: string | null;
  handicap?: string | number | null;
  isGHINVerified?: boolean;
} | null;

type UserRow = {
  id: string;
  email: string;
  username: string;
  authProvider?: string;
  membershipType: string;
  isSuspended: boolean;
  isActive: boolean;
  createdAt: string;
  profile: ProfileLite;
  lastGhinRequest: { status: string } | null;
};

type ColumnKey = 'user' | 'email' | 'location' | 'handicap' | 'membership' | 'ghin' | 'status' | 'joined';

const nf = new Intl.NumberFormat();

const COLUMN_LABELS: Record<ColumnKey, string> = {
  user: 'User',
  email: 'Email',
  location: 'Location',
  handicap: 'Handicap',
  membership: 'Membership',
  ghin: 'GHIN',
  status: 'Status',
  joined: 'Joined',
};

function segmentToQuery(segment: UserSegment): Record<string, string | boolean | undefined> {
  switch (segment) {
    case 'all':
      return {};
    case 'active':
      return { isSuspended: false, isActive: true };
    case 'suspended':
      return { isSuspended: true };
    case 'premium':
      return { membershipType: 'PREMIUM' };
    case 'free':
      return { membershipType: 'FREE' };
    case 'verified':
      return { isGHINVerified: true };
    default:
      return {};
  }
}

function initialsFrom(name: string, username: string): string {
  const n = name.trim();
  if (n.length >= 2) {
    const parts = n.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const u = username.trim();
  return u.slice(0, 2).toUpperCase() || '?';
}

function ghinBadge(profile: ProfileLite, lastGhin: UserRow['lastGhinRequest']) {
  if (profile?.isGHINVerified) {
    return { label: 'Verified', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-100' };
  }
  const st = lastGhin?.status;
  if (st === 'PENDING' || st === 'APPEAL') {
    return { label: 'Pending', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' };
  }
  return { label: 'Not started', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200' };
}

type AuthProviderFilter = '' | 'EMAIL' | 'GOOGLE' | 'APPLE';

export default function UsersPage() {
  const router = useRouter();
  const uiCopy = useAdminUiCopy();
  const pathname = usePathname();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [summary, setSummary] = useState<UsersSummary | null>(null);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<UserSegment>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'email' | 'username' | 'membershipType'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [authProviderFilter, setAuthProviderFilter] = useState<AuthProviderFilter>('');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>({
    user: true,
    email: true,
    location: true,
    handicap: true,
    membership: true,
    ghin: true,
    status: true,
    joined: true,
  });
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const debouncedSearch = useDebounced(search, 350);

  const chipDefs = useMemo(
    () =>
      [
        { id: 'all' as const, label: 'All Users', count: summary?.totalUsers },
        { id: 'active' as const, label: 'Active', count: summary?.activeUsers },
        { id: 'suspended' as const, label: 'Suspended', count: summary?.suspendedUsers },
        { id: 'premium' as const, label: 'Premium', count: summary?.premiumUsers },
        { id: 'free' as const, label: 'Free', count: summary?.freeUsers },
        { id: 'verified' as const, label: 'Verified', count: summary?.verifiedProfiles },
      ] as const,
    [summary],
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setSearch(sp.get('search') ?? '');
    const seg = sp.get('segment') as UserSegment | null;
    if (seg && ['all', 'active', 'suspended', 'premium', 'free', 'verified'].includes(seg)) {
      setSegment(seg);
    } else if (sp.get('isSuspended') === 'true') {
      setSegment('suspended');
    } else if (sp.get('membershipType') === 'PREMIUM') {
      setSegment('premium');
    } else if (sp.get('membershipType') === 'FREE') {
      setSegment('free');
    } else if (sp.get('isGHINVerified') === 'true') {
      setSegment('verified');
    } else if (sp.get('isSuspended') === 'false') {
      setSegment('active');
    } else {
      setSegment('all');
    }
    setSortBy((sp.get('sortBy') as 'createdAt' | 'email' | 'username' | 'membershipType') ?? 'createdAt');
    setSortDir((sp.get('sortDir') as 'asc' | 'desc') ?? 'desc');
    setPage(Number(sp.get('page') ?? '0'));
    setPageSize(Number(sp.get('pageSize') ?? '20'));
    const ap = sp.get('authProvider') as AuthProviderFilter | null;
    if (ap === 'EMAIL' || ap === 'GOOGLE' || ap === 'APPLE') {
      setAuthProviderFilter(ap);
    }
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (segment !== 'all') sp.set('segment', segment);
    if (search) sp.set('search', search);
    sp.set('sortBy', sortBy);
    sp.set('sortDir', sortDir);
    sp.set('page', String(page));
    sp.set('pageSize', String(pageSize));
    if (authProviderFilter) sp.set('authProvider', authProviderFilter);
    router.replace(`${pathname}?${sp.toString()}`);
  }, [search, segment, sortBy, sortDir, page, pageSize, pathname, router, authProviderFilter]);

  useEffect(() => {
    adminApi<UsersSummary>('/admin/users/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const segmentQuery = useMemo(() => segmentToQuery(segment), [segment]);

  useEffect(() => {
    setError(null);
    adminApi<{ items: UserRow[]; total: number; page: number; pageSize: number }>('/admin/users', undefined, {
      search: debouncedSearch || undefined,
      sortBy,
      sortDir,
      page,
      pageSize,
      ...(authProviderFilter ? { authProvider: authProviderFilter } : {}),
      ...segmentQuery,
    })
      .then((res) => {
        setUsers(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [debouncedSearch, segmentQuery, sortBy, sortDir, page, pageSize, authProviderFilter]);

  useEffect(() => {
    if (!columnsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [columnsOpen]);

  const setSegmentAndReset = useCallback((s: UserSegment) => {
    setPage(0);
    setSegment(s);
  }, []);

  const setAuthProviderAndReset = useCallback((ap: AuthProviderFilter) => {
    setPage(0);
    setAuthProviderFilter(ap);
  }, []);

  const signInFilterDefs = useMemo(
    () =>
      [
        { id: '' as const, label: 'All sign-in', count: summary?.totalUsers },
        { id: 'EMAIL' as const, label: 'Email', count: summary?.emailSignInUsers },
        { id: 'GOOGLE' as const, label: 'Google', count: summary?.googleSignInUsers },
        { id: 'APPLE' as const, label: 'Apple', count: summary?.appleSignInUsers },
      ] as const,
    [summary],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleColumn = (k: ColumnKey) => {
    setVisible((v) => ({ ...v, [k]: !v[k] }));
  };

  return (
    <AdminPageShell title="Users">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Filter:</span>
          {chipDefs.map((c) => {
            const active = segment === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSegmentAndReset(c.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'border-connect-600 bg-connect-600 text-white shadow-sm dark:border-connect-500 dark:bg-connect-600'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500'
                }`}
              >
                {c.label}
                {c.count !== undefined && (
                  <span className={active ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'}>({c.count})</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sign-in:</span>
          {signInFilterDefs.map((c) => {
            const active = authProviderFilter === c.id;
            return (
              <button
                key={c.id || 'all'}
                type="button"
                onClick={() => setAuthProviderAndReset(c.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-500 dark:bg-blue-600'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500'
                }`}
              >
                {c.label}
                {c.count !== undefined && (
                  <span className={active ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'}>({c.count})</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none ring-connect-500/20 focus:ring-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            placeholder={uiCopy.usersSearchPlaceholder}
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
            aria-label="Search users"
          />
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">{nf.format(total)}</span> matching users
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPage(0);
                setPageSize(Number(e.target.value));
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            >
              <option value="10">10 / page</option>
              <option value="20">20 / page</option>
              <option value="50">50 / page</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => {
                setPage(0);
                setSortBy(e.target.value as typeof sortBy);
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            >
              <option value="createdAt">Sort: joined</option>
              <option value="email">Sort: email</option>
              <option value="username">Sort: username</option>
              <option value="membershipType">Sort: membership</option>
            </select>
            <select
              value={sortDir}
              onChange={(e) => {
                setPage(0);
                setSortDir(e.target.value as 'asc' | 'desc');
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <select
              value={authProviderFilter}
              onChange={(e) => {
                setPage(0);
                setAuthProviderFilter(e.target.value as AuthProviderFilter);
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              aria-label="Filter by sign-in method"
            >
              <option value="">All sign-in</option>
              <option value="EMAIL">Email</option>
              <option value="GOOGLE">Google</option>
              <option value="APPLE">Apple</option>
            </select>
            <div className="relative" ref={columnsRef}>
              <button
                type="button"
                onClick={() => setColumnsOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </button>
              {columnsOpen && (
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-600 dark:bg-gray-900">
                  {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((k) => (
                    <label
                      key={k}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={visible[k]}
                        onChange={() => toggleColumn(k)}
                        className="rounded border-gray-300"
                      />
                      {COLUMN_LABELS[k]}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
              <tr>
                {visible.user && <th className="px-4 py-3">User</th>}
                {visible.email && <th className="px-4 py-3">Email</th>}
                {visible.location && <th className="px-4 py-3">Location</th>}
                {visible.handicap && <th className="px-4 py-3">Handicap</th>}
                {visible.membership && <th className="px-4 py-3">Membership</th>}
                {visible.ghin && <th className="px-4 py-3">GHIN</th>}
                {visible.status && <th className="px-4 py-3">Status</th>}
                {visible.joined && <th className="px-4 py-3">Joined</th>}
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {users.map((user) => {
                const display = user.profile?.displayName?.trim() || user.username;
                const ghin = ghinBadge(user.profile, user.lastGhinRequest);
                const loc =
                  [user.profile?.city, user.profile?.state].filter(Boolean).join(', ') || '—';
                const hc =
                  user.profile?.handicap !== undefined && user.profile?.handicap !== null && user.profile?.handicap !== ''
                    ? String(user.profile.handicap)
                    : '—';
                return (
                  <tr
                    key={user.id}
                    className="transition hover:bg-gray-50/80 dark:hover:bg-gray-900/40"
                  >
                    {visible.user && (
                      <td className="px-4 py-3">
                        <Link href={`/users/${user.id}`} className="flex items-center gap-3 group">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 dark:bg-gray-600 dark:text-gray-100">
                            {initialsFrom(display, user.username)}
                          </span>
                          <span>
                            <span className="block font-medium text-gray-900 group-hover:text-connect-700 dark:text-white dark:group-hover:text-connect-400">
                              {display}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</span>
                            <span className="mt-1 block">
                              <AuthSignInBadge provider={user.authProvider} compact />
                            </span>
                          </span>
                        </Link>
                      </td>
                    )}
                    {visible.email && (
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{user.email}</td>
                    )}
                    {visible.location && (
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{loc}</td>
                    )}
                    {visible.handicap && (
                      <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">{hc}</td>
                    )}
                    {visible.membership && (
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            user.membershipType === 'PREMIUM'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-100'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {user.membershipType === 'PREMIUM' ? 'Premium' : 'Free'}
                        </span>
                      </td>
                    )}
                    {visible.ghin && (
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ghin.className}`}>
                          {ghin.label}
                        </span>
                      </td>
                    )}
                    {visible.status && (
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            user.isSuspended
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100'
                          }`}
                        >
                          {user.isSuspended ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                    )}
                    {visible.joined && (
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {format(new Date(user.createdAt), 'MMM d, yyyy')}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/users/${user.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-connect-700 hover:bg-gray-50 dark:border-gray-600 dark:text-connect-400 dark:hover:bg-gray-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && !error && (
            <p className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{uiCopy.usersEmptyState}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Page {page + 1} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            type="button"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </AdminPageShell>
  );
}
