'use client';

import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Columns3, Filter, Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { useAdminUiCopy } from '../../../context/AdminUiCopyContext';
import { adminApi } from '../../../lib/api';
import { useDebounced } from '../../../lib/useDebounced';

type ReportSummary = {
  total: number;
  open: number;
  reviewed: number;
  resolved: number;
  dismissed: number;
};

type UserBrief = {
  id: string;
  email: string;
  username: string;
  profile: { displayName: string } | null;
};

type ReportRow = {
  id: string;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  reportedBy: UserBrief;
  targetUser: UserBrief;
};

type FilterKey = 'all' | 'OPEN' | 'REVIEWED' | 'RESOLVED' | 'DISMISSED';

type ColKey = 'reported' | 'reporting' | 'reason' | 'severity' | 'status' | 'date';

const COL_LABELS: Record<ColKey, string> = {
  reported: 'Reported user',
  reporting: 'Reporting user',
  reason: 'Reason',
  severity: 'Severity',
  status: 'Status',
  date: 'Date',
};

function statusPill(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'border border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/35 dark:text-red-100';
    case 'REVIEWED':
      return 'border border-gray-300 bg-gray-50 text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200';
    case 'RESOLVED':
      return 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-100';
    case 'DISMISSED':
      return 'border border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

function severityPill(sev: string): string {
  if (sev === 'HIGH') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100';
  if (sev === 'MEDIUM') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
  return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-100';
}

function displayName(u: UserBrief): string {
  return u.profile?.displayName?.trim() || u.username;
}

export default function ReportsPage() {
  const router = useRouter();
  const uiCopy = useAdminUiCopy();
  const pathname = usePathname();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [sortBy, setSortBy] = useState<'createdAt' | 'status'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({
    reported: true,
    reporting: true,
    reason: true,
    severity: true,
    status: true,
    date: true,
  });
  const colsRef = useRef<HTMLDivElement | null>(null);

  const chips = useMemo(
    () =>
      [
        { key: 'all' as const, label: 'All Reports', count: summary?.total },
        { key: 'OPEN' as const, label: 'Open', count: summary?.open },
        { key: 'REVIEWED' as const, label: 'Reviewed', count: summary?.reviewed },
        { key: 'RESOLVED' as const, label: 'Resolved', count: summary?.resolved },
        { key: 'DISMISSED' as const, label: 'Dismissed', count: summary?.dismissed },
      ] as const,
    [summary],
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const f = sp.get('filter') as FilterKey | null;
    if (f && ['all', 'OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED'].includes(f)) {
      setFilter(f);
    } else if (sp.get('status')) {
      const st = sp.get('status') as FilterKey;
      setFilter(['OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED'].includes(st) ? st : 'all');
    } else setFilter('all');
    setSearch(sp.get('search') ?? '');
    setSortBy((sp.get('sortBy') as 'createdAt' | 'status') ?? 'createdAt');
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
    adminApi<ReportSummary>('/admin/reports/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const apiStatus = filter === 'all' ? undefined : filter;

  useEffect(() => {
    setError(null);
    adminApi<{ items: ReportRow[]; total: number }>('/admin/reports', undefined, {
      status: apiStatus,
      search: debouncedSearch || undefined,
      sortBy,
      sortDir,
      page,
      pageSize,
    })
      .then((res) => {
        setReports(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [apiStatus, debouncedSearch, sortBy, sortDir, page, pageSize]);

  useEffect(() => {
    if (!colsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [colsOpen]);

  const setFilterAndReset = useCallback((k: FilterKey) => {
    setPage(0);
    setFilter(k);
  }, []);

  const toggleSort = (col: 'createdAt' | 'status') => {
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
    <AdminPageShell title="Reports">
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

      <div className="relative mb-6">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none ring-connect-500/20 focus:ring-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          placeholder={uiCopy.reportsSearchPlaceholder}
          value={search}
          onChange={(e) => {
            setPage(0);
            setSearch(e.target.value);
          }}
          aria-label="Search reports"
        />
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">{nf.format(total)}</span> matching
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
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-600 dark:bg-gray-900">
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
                {visible.reported && <th className="px-4 py-3">Reported user</th>}
                {visible.reporting && <th className="px-4 py-3">Reporting user</th>}
                {visible.reason && <th className="px-4 py-3">Reason</th>}
                {visible.severity && <th className="px-4 py-3">Severity</th>}
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
                {visible.date && (
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('createdAt')}
                      className="inline-flex items-center gap-1 font-semibold hover:text-connect-700 dark:hover:text-connect-400"
                    >
                      Date
                    </button>
                  </th>
                )}
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-900/40">
                  {visible.reported && (
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{displayName(r.targetUser)}</td>
                  )}
                  {visible.reporting && (
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{displayName(r.reportedBy)}</td>
                  )}
                  {visible.reason && (
                    <td className="max-w-xs truncate px-4 py-3 text-gray-700 dark:text-gray-300" title={r.reason}>
                      {r.reason}
                    </td>
                  )}
                  {visible.severity && (
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${severityPill(r.severity)}`}
                      >
                        {r.severity === 'HIGH' ? 'High' : r.severity === 'MEDIUM' ? 'Medium' : 'Low'}
                      </span>
                    </td>
                  )}
                  {visible.status && (
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusPill(r.status)}`}>
                        {r.status === 'OPEN' ? 'Open' : r.status === 'REVIEWED' ? 'Reviewed' : r.status === 'RESOLVED' ? 'Resolved' : 'Dismissed'}
                      </span>
                    </td>
                  )}
                  {visible.date && (
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {format(new Date(r.createdAt), 'MMM d, yyyy')}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/reports/${r.id}`}
                      className="inline-flex rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-connect-700 hover:bg-gray-50 dark:border-gray-600 dark:text-connect-400 dark:hover:bg-gray-700"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reports.length === 0 && !error && (
            <p className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">{uiCopy.reportsEmptyState}</p>
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
