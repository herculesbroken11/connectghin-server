'use client';

import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Columns3, Filter, Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { PlatformTableCell } from '../../../components/admin/StorePlatformIcons';
import { useAdminUiCopy } from '../../../context/AdminUiCopyContext';
import { adminApi } from '../../../lib/api';
import { useDebounced } from '../../../lib/useDebounced';

type SubSummary = {
  total: number;
  active: number;
  trialing: number;
  canceled: number;
  expired: number;
};

type UserBrief = {
  id: string;
  email: string;
  username: string;
  profile: { displayName: string } | null;
};

type SubscriptionRow = {
  id: string;
  userId: string;
  status: string;
  planCode: string;
  billingCycle: string;
  provider: string;
  storeExternalId?: string | null;
  currentPeriodEnd?: string | null;
  createdAt: string;
  user: UserBrief;
};

type FilterKey = 'all' | 'ACTIVE' | 'TRIALING' | 'CANCELED' | 'EXPIRED';

type ColKey = 'user' | 'plan' | 'platform' | 'cycle' | 'status' | 'periodEnd' | 'storeExternalId' | 'created';

const COL_LABELS: Record<ColKey, string> = {
  user: 'User',
  plan: 'Plan',
  platform: 'Platform',
  cycle: 'Billing cycle',
  status: 'Status',
  periodEnd: 'Renewal date',
  storeExternalId: 'Store external id',
  created: 'Created',
};

function planDisplay(planCode: string, cycle: string): string {
  const cycleLabel = cycle === 'YEARLY' ? 'Yearly' : 'Monthly';
  if (/premium/i.test(planCode)) return `Premium ${cycleLabel}`;
  return `${planCode.replace(/_/g, ' ')} (${cycleLabel})`;
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Active',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-100',
      };
    case 'TRIALING':
      return {
        label: 'Trialing',
        className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
      };
    case 'CANCELED':
      return {
        label: 'Canceled',
        className: 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100',
      };
    case 'PAST_DUE':
      return {
        label: 'Past due',
        className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100',
      };
    case 'INCOMPLETE_EXPIRED':
    case 'UNPAID':
    case 'INCOMPLETE':
      return {
        label: 'Expired',
        className: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100',
      };
    default:
      return {
        label: status,
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      };
  }
}

function displayName(u: UserBrief): string {
  return u.profile?.displayName?.trim() || u.username;
}

export default function SubscriptionsPage() {
  const router = useRouter();
  const uiCopy = useAdminUiCopy();
  const pathname = usePathname();
  const [items, setItems] = useState<SubscriptionRow[]>([]);
  const [summary, setSummary] = useState<SubSummary | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [sortBy, setSortBy] = useState<'createdAt' | 'status' | 'planCode' | 'currentPeriodEnd'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({
    user: true,
    plan: true,
    platform: true,
    cycle: true,
    status: true,
    periodEnd: true,
    storeExternalId: true,
    created: true,
  });
  const colsRef = useRef<HTMLDivElement | null>(null);

  const chips = useMemo(
    () =>
      [
        { key: 'all' as const, label: 'All', count: summary?.total },
        { key: 'ACTIVE' as const, label: 'Active', count: summary?.active },
        { key: 'TRIALING' as const, label: 'Trialing', count: summary?.trialing },
        { key: 'CANCELED' as const, label: 'Canceled', count: summary?.canceled },
        { key: 'EXPIRED' as const, label: 'Expired', count: summary?.expired },
      ] as const,
    [summary],
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const f = sp.get('filter') as FilterKey | null;
    if (f && ['all', 'ACTIVE', 'TRIALING', 'CANCELED', 'EXPIRED'].includes(f)) {
      setFilter(f);
    } else if (sp.get('status')) {
      const st = sp.get('status') as FilterKey;
      setFilter(['ACTIVE', 'TRIALING', 'CANCELED', 'EXPIRED'].includes(st) ? st : 'all');
    } else setFilter('all');
    setSearch(sp.get('search') ?? '');
    setSortBy((sp.get('sortBy') as typeof sortBy) ?? 'createdAt');
    setSortDir((sp.get('sortDir') as 'asc' | 'desc') ?? 'desc');
    setPage(Number(sp.get('page') ?? '0'));
    setPageSize(Number(sp.get('pageSize') ?? '20'));
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (filter !== 'all') sp.set('filter', filter);
    if (search) sp.set('search', search);
    sp.set('sortBy', sortBy);
    sp.set('sortDir', sortDir);
    sp.set('page', String(page));
    sp.set('pageSize', String(pageSize));
    router.replace(`${pathname}?${sp.toString()}`);
  }, [filter, search, sortBy, sortDir, page, pageSize, pathname, router]);

  useEffect(() => {
    adminApi<SubSummary>('/admin/subscriptions/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const apiFilter = filter === 'all' ? undefined : filter;

  useEffect(() => {
    setError(null);
    adminApi<{ items: SubscriptionRow[]; total: number }>('/admin/subscriptions', undefined, {
      filter: apiFilter,
      search: debouncedSearch || undefined,
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
  }, [apiFilter, debouncedSearch, sortBy, sortDir, page, pageSize]);

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

  const toggleSort = (col: typeof sortBy) => {
    setPage(0);
    if (sortBy === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const nf = new Intl.NumberFormat();

  return (
    <AdminPageShell title="Subscriptions">
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
              {c.key === 'all' ? 'All' : c.label}
              {c.count !== undefined && (
                <span className={active ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'}>
                  ({nf.format(c.count)})
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="relative mb-6">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none ring-connect-500/20 focus:ring-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          placeholder={uiCopy.subscriptionsSearchPlaceholder}
          value={search}
          onChange={(e) => {
            setPage(0);
            setSearch(e.target.value);
          }}
          aria-label="Search subscriptions"
        />
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">{nf.format(total)}</span> subscriptions
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
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-600 dark:bg-gray-900">
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
                {visible.plan && (
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('planCode')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-connect-700 dark:hover:text-connect-400"
                    >
                      Plan
                    </button>
                  </th>
                )}
                {visible.platform && <th className="px-4 py-3">Platform</th>}
                {visible.cycle && <th className="px-4 py-3">Billing cycle</th>}
                {visible.status && (
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-connect-700 dark:hover:text-connect-400"
                    >
                      Status
                    </button>
                  </th>
                )}
                {visible.periodEnd && (
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('currentPeriodEnd')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-connect-700 dark:hover:text-connect-400"
                    >
                      Period ends
                    </button>
                  </th>
                )}
                {visible.storeExternalId && <th className="px-4 py-3">Store external id</th>}
                {visible.created && (
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('createdAt')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-connect-700 dark:hover:text-connect-400"
                    >
                      Created
                    </button>
                  </th>
                )}
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((item) => {
                const b = statusBadge(item.status);
                return (
                  <tr key={item.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-900/40">
                    {visible.user && (
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{displayName(item.user)}</td>
                    )}
                    {visible.plan && (
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                        {planDisplay(item.planCode, item.billingCycle)}
                      </td>
                    )}
                    {visible.platform && (
                      <td className="px-4 py-3">
                        <PlatformTableCell provider={item.provider} compact />
                      </td>
                    )}
                    {visible.cycle && (
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {item.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}
                      </td>
                    )}
                    {visible.status && (
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.className}`}>
                          {b.label}
                        </span>
                      </td>
                    )}
                    {visible.periodEnd && (
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {item.currentPeriodEnd ? format(new Date(item.currentPeriodEnd), 'MMM d, yyyy') : '—'}
                      </td>
                    )}
                    {visible.storeExternalId && (
                      <td className="max-w-[140px] truncate px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {item.storeExternalId ?? '—'}
                      </td>
                    )}
                    {visible.created && (
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        {format(new Date(item.createdAt), 'MMM d, yyyy')}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/subscriptions/${item.id}`}
                        className="inline-flex rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-connect-700 hover:bg-gray-50 dark:border-gray-600 dark:text-connect-400 dark:hover:bg-gray-700"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && !error && (
            <p className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{uiCopy.subscriptionsEmptyState}</p>
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
