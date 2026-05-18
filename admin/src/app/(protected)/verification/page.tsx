'use client';

import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, Filter } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { adminApi } from '../../../lib/api';

type GhinSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  appeal: number;
};

type UserLite = {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  profile: { displayName: string } | null;
};

type GHINRow = {
  id: string;
  userId: string;
  status: string;
  ghinNumber: string;
  handicapSnapshot?: string | number | null;
  submittedAt: string;
  user: UserLite | null;
};

type FilterKey = 'all' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'APPEAL';

type ColKey = 'user' | 'handicap' | 'ghin' | 'submitted' | 'status';

const COL_LABELS: Record<ColKey, string> = {
  user: 'User',
  handicap: 'Handicap',
  ghin: 'GHIN number',
  submitted: 'Submitted',
  status: 'Status',
};

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Pending',
        className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
      };
    case 'VERIFIED':
      return {
        label: 'Approved',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-100',
      };
    case 'REJECTED':
      return {
        label: 'Rejected',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100',
      };
    case 'APPEAL':
      return {
        label: 'Appeal',
        className: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100',
      };
    default:
      return {
        label: status,
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      };
  }
}

function formatGhin(n: string): string {
  const t = (n || '').trim();
  if (/^\d{7}$/.test(t)) return t;
  return 'Invalid';
}

function initials(display: string, username: string): string {
  const d = display.trim();
  if (d.length >= 2) {
    const p = d.split(/\s+/);
    if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
    return d.slice(0, 2).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase() || '?';
}

export default function GHINQueuePage() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<GHINRow[]>([]);
  const [summary, setSummary] = useState<GhinSummary | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortBy, setSortBy] = useState<'submittedAt' | 'status'>('submittedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({
    user: true,
    handicap: true,
    ghin: true,
    submitted: true,
    status: true,
  });
  const colsRef = useRef<HTMLDivElement | null>(null);

  const chips = useMemo(
    () =>
      [
        { key: 'all' as const, label: 'All', count: summary?.total },
        { key: 'PENDING' as const, label: 'Pending', count: summary?.pending },
        { key: 'VERIFIED' as const, label: 'Approved', count: summary?.approved },
        { key: 'REJECTED' as const, label: 'Rejected', count: summary?.rejected },
        { key: 'APPEAL' as const, label: 'Appeal', count: summary?.appeal },
      ] as const,
    [summary],
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const f = sp.get('filter') as FilterKey | null;
    if (f && ['all', 'PENDING', 'VERIFIED', 'REJECTED', 'APPEAL'].includes(f)) {
      setFilter(f);
    } else if (sp.get('status')) {
      const st = sp.get('status') as FilterKey;
      setFilter(['PENDING', 'VERIFIED', 'REJECTED', 'APPEAL'].includes(st) ? st : 'all');
    } else {
      setFilter('all');
    }
    setSortBy((sp.get('sortBy') as 'submittedAt' | 'status') ?? 'submittedAt');
    setSortDir((sp.get('sortDir') as 'asc' | 'desc') ?? 'desc');
    setPage(Number(sp.get('page') ?? '0'));
    setPageSize(Number(sp.get('pageSize') ?? '20'));
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (filter !== 'all') sp.set('filter', filter);
    sp.set('sortBy', sortBy);
    sp.set('sortDir', sortDir);
    sp.set('page', String(page));
    sp.set('pageSize', String(pageSize));
    router.replace(`${pathname}?${sp.toString()}`);
  }, [filter, sortBy, sortDir, page, pageSize, pathname, router]);

  useEffect(() => {
    adminApi<GhinSummary>('/admin/ghin-requests/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const apiStatus = filter === 'all' ? undefined : filter;

  useEffect(() => {
    setError(null);
    adminApi<{ items: GHINRow[]; total: number }>('/admin/ghin-requests', undefined, {
      status: apiStatus,
      sortBy,
      sortDir,
      page,
      pageSize,
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [apiStatus, sortBy, sortDir, page, pageSize]);

  useEffect(() => {
    if (!colsOpen) return;
    const close = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [colsOpen]);

  const setFilterAndReset = useCallback((k: FilterKey) => {
    setPage(0);
    setFilter(k);
  }, []);

  const toggleSort = (col: 'submittedAt' | 'status') => {
    setPage(0);
    if (sortBy === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: 'submittedAt' | 'status' }) => {
    if (sortBy !== col) return <ChevronDown className="inline h-3.5 w-3.5 opacity-40" aria-hidden />;
    return sortDir === 'desc' ? (
      <ChevronDown className="inline h-3.5 w-3.5" aria-hidden />
    ) : (
      <ChevronUp className="inline h-3.5 w-3.5" aria-hidden />
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const nf = new Intl.NumberFormat();

  return (
    <AdminPageShell title="GHIN Verification">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden />
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Filter:</span>
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilterAndReset(c.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'border-connect-600 bg-connect-600 text-white shadow-sm dark:border-connect-500 dark:bg-connect-600'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500'
              }`}
            >
              {c.label}
              {c.count !== undefined && (
                <span className={active ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'}>
                  ({nf.format(c.count)})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">{nf.format(total)}</span> requests
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
            <div className="relative" ref={colsRef}>
              <button
                type="button"
                onClick={() => setColsOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </button>
              {colsOpen && (
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-600 dark:bg-gray-900">
                  {(Object.keys(COL_LABELS) as ColKey[]).map((k) => (
                    <label
                      key={k}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={visible[k]}
                        onChange={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
                        className="rounded border-gray-300"
                      />
                      {COL_LABELS[k]}
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
                {visible.handicap && <th className="px-4 py-3">Handicap</th>}
                {visible.ghin && <th className="px-4 py-3">GHIN number</th>}
                {visible.submitted && (
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('submittedAt')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-connect-700 dark:hover:text-connect-400"
                    >
                      Submitted
                      <SortIcon col="submittedAt" />
                    </button>
                  </th>
                )}
                {visible.status && (
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-connect-700 dark:hover:text-connect-400"
                    >
                      Status
                      <SortIcon col="status" />
                    </button>
                  </th>
                )}
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((item) => {
                const u = item.user;
                const display = u?.profile?.displayName?.trim() || u?.username || 'Unknown';
                const badge = statusBadge(item.status);
                const hc =
                  item.handicapSnapshot !== undefined &&
                  item.handicapSnapshot !== null &&
                  `${item.handicapSnapshot}` !== ''
                    ? String(item.handicapSnapshot)
                    : '—';
                return (
                  <tr key={item.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-900/40">
                    {visible.user && (
                      <td className="px-4 py-3">
                        <Link href={`/verification/${item.id}`} className="flex items-center gap-3 group">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 dark:bg-gray-600 dark:text-gray-100">
                            {initials(display, u?.username ?? item.userId)}
                          </span>
                          <span>
                            <span className="block font-medium text-gray-900 group-hover:text-connect-700 dark:text-white dark:group-hover:text-connect-400">
                              {display}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              @{u?.username ?? '—'}
                            </span>
                          </span>
                        </Link>
                      </td>
                    )}
                    {visible.handicap && (
                      <td className="px-4 py-3 tabular-nums text-gray-800 dark:text-gray-200">{hc}</td>
                    )}
                    {visible.ghin && (
                      <td className="px-4 py-3 font-mono text-gray-800 dark:text-gray-200">
                        {formatGhin(item.ghinNumber)}
                      </td>
                    )}
                    {visible.submitted && (
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {formatDistanceToNow(new Date(item.submittedAt), { addSuffix: true })}
                      </td>
                    )}
                    {visible.status && (
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/verification/${item.id}`}
                        className="inline-flex rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-connect-700 hover:bg-gray-50 dark:border-gray-600 dark:text-connect-400 dark:hover:bg-gray-700"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && !error && (
            <p className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No verification requests.</p>
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
