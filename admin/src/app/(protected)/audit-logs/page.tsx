'use client';

import { format } from 'date-fns';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Info,
  Search as SearchIcon,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { useAdminUiCopy } from '../../../context/AdminUiCopyContext';
import { useToast } from '../../../context/ToastContext';
import { adminApi } from '../../../lib/api';
import { useDebounced } from '../../../lib/useDebounced';

type AuditCategory = 'all' | 'user' | 'verification' | 'settings' | 'report' | 'billing' | 'system';

type AuditSummary = {
  total: number;
  user: number;
  verification: number;
  settings: number;
  report: number;
  billing: number;
  system: number;
};

type Severity = 'success' | 'warning' | 'info' | 'error';

type AuditItem = {
  id: string;
  adminUserId: string;
  adminEmail?: string;
  adminUsername?: string;
  adminDisplayName?: string;
  actionType: string;
  actionLabel: string;
  severity: Severity;
  targetUserId?: string | null;
  targetLabel: string;
  details: string;
  createdAt: string;
};

type ColKey = 'timestamp' | 'admin' | 'action' | 'target' | 'details';

const COL_LABELS: Record<ColKey, string> = {
  timestamp: 'Timestamp',
  admin: 'Admin',
  action: 'Action type',
  target: 'Target',
  details: 'Details',
};

function severityBadge(sev: Severity): { icon: typeof CheckCircle2; className: string; label: string } {
  switch (sev) {
    case 'success':
      return {
        icon: CheckCircle2,
        label: 'Success',
        className:
          'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        label: 'Warning',
        className:
          'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100',
      };
    case 'error':
      return {
        icon: XCircle,
        label: 'Error',
        className: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/45 dark:text-red-100',
      };
    default:
      return {
        icon: Info,
        label: 'Info',
        className: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-100',
      };
  }
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function AuditLogsPage() {
  const router = useRouter();
  const uiCopy = useAdminUiCopy();
  const pathname = usePathname();
  const toast = useToast();
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [category, setCategory] = useState<AuditCategory>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'actionType'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({
    timestamp: true,
    admin: true,
    action: true,
    target: true,
    details: true,
  });
  const colsRef = useRef<HTMLDivElement | null>(null);
  const dateMenuRef = useRef<HTMLDivElement | null>(null);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);

  const chips = useMemo(
    () =>
      [
        { key: 'all' as const, label: 'All actions', count: summary?.total },
        { key: 'user' as const, label: 'User actions', count: summary?.user },
        { key: 'verification' as const, label: 'Verification actions', count: summary?.verification },
        { key: 'settings' as const, label: 'Settings changes', count: summary?.settings },
        { key: 'report' as const, label: 'Report actions', count: summary?.report },
        { key: 'billing' as const, label: 'Billing', count: summary?.billing },
        { key: 'system' as const, label: 'System', count: summary?.system },
      ] as const,
    [summary],
  );

  /** Hide categories with no rows so Billing/System do not clutter empty dashboards. */
  const visibleChips = useMemo(
    () => chips.filter((c) => c.key === 'all' || (typeof c.count === 'number' && c.count > 0)),
    [chips],
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const cat = sp.get('category') as AuditCategory | null;
    if (cat && ['all', 'user', 'verification', 'settings', 'report', 'billing', 'system'].includes(cat)) {
      setCategory(cat);
    }
    setSearch(sp.get('search') ?? '');
    setFrom(sp.get('from') ?? '');
    setTo(sp.get('to') ?? '');
    setPage(Number(sp.get('page') ?? '0'));
    setPageSize(Number(sp.get('pageSize') ?? '20'));
    setSortBy((sp.get('sortBy') as 'createdAt' | 'actionType') ?? 'createdAt');
    setSortDir((sp.get('sortDir') as 'asc' | 'desc') ?? 'desc');
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set('category', category);
    if (debouncedSearch.trim()) sp.set('search', debouncedSearch.trim());
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    sp.set('page', String(page));
    sp.set('pageSize', String(pageSize));
    sp.set('sortBy', sortBy);
    sp.set('sortDir', sortDir);
    router.replace(`${pathname}?${sp.toString()}`);
  }, [category, debouncedSearch, from, to, page, pageSize, sortBy, sortDir, pathname, router]);

  const listQuery = useMemo(
    () => ({
      page,
      pageSize,
      sortBy,
      sortDir,
      category: category === 'all' ? undefined : category,
      search: debouncedSearch.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [page, pageSize, sortBy, sortDir, category, debouncedSearch, from, to],
  );

  useEffect(() => {
    adminApi<AuditSummary>('/admin/audit-logs/summary', undefined, {
      from: from || undefined,
      to: to || undefined,
    })
      .then(setSummary)
      .catch(() => toast.error('Failed to load summary'));
  }, [from, to, toast]);

  /** If the current category chip is hidden (count 0), fall back to All actions. */
  useEffect(() => {
    if (!summary || category === 'all') return;
    const n = summary[category];
    if (typeof n === 'number' && n === 0) {
      setCategory('all');
      setPage(0);
    }
  }, [summary, category]);

  useEffect(() => {
    adminApi<{ items: AuditItem[]; total: number; page: number; pageSize: number }>('/admin/audit-logs', undefined, listQuery)
      .then((res) => {
        setLogs(res.items);
        setTotal(res.total);
      })
      .catch(() => toast.error('Failed to load audit logs'));
  }, [listQuery, toast]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!colsRef.current?.contains(t)) setColsOpen(false);
      if (!dateMenuRef.current?.contains(t)) setDateMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggleSort = (col: 'createdAt' | 'actionType') => {
    setPage(0);
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'createdAt' ? 'desc' : 'asc');
    }
  };

  const clearDateRange = () => {
    setFrom('');
    setTo('');
    setPage(0);
  };

  const dateFilterLabel =
    from && to
      ? `${format(new Date(from + 'T12:00:00'), 'M/d/yyyy')} - ${format(new Date(to + 'T12:00:00'), 'M/d/yyyy')}`
      : from
        ? `From ${format(new Date(from + 'T12:00:00'), 'M/d/yyyy')}`
        : to
          ? `Until ${format(new Date(to + 'T12:00:00'), 'M/d/yyyy')}`
          : null;

  const runExport = useCallback(async () => {
    setExporting(true);
    try {
      const base = {
        sortBy: 'createdAt' as const,
        sortDir: 'desc' as const,
        category: category === 'all' ? undefined : category,
        search: debouncedSearch.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      };
      const all: AuditItem[] = [];
      let p = 0;
      const take = 100;
      for (;;) {
        const res = await adminApi<{ items: AuditItem[] }>('/admin/audit-logs', undefined, {
          ...base,
          page: p,
          pageSize: take,
        });
        all.push(...res.items);
        if (res.items.length < take || all.length >= 2000) break;
        p += 1;
      }
      const header = ['Timestamp', 'Admin', 'Action', 'Severity', 'Target', 'Details'];
      const lines = [
        header.join(','),
        ...all.map((row) =>
          [
            csvEscape(format(new Date(row.createdAt), 'MMM d, yyyy, h:mm a')),
            csvEscape(row.adminDisplayName ?? row.adminUsername ?? row.adminEmail ?? ''),
            csvEscape(row.actionLabel),
            csvEscape(row.severity),
            csvEscape(row.targetLabel),
            csvEscape(row.details ?? ''),
          ].join(','),
        ),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} row(s)`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }, [category, debouncedSearch, from, to, toast]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <AdminPageShell title="Audit Logs">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <span className="font-medium">Note:</span> All admin actions are automatically logged for accountability and review
          purposes.
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {visibleChips.map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setPage(0);
                    setCategory(c.key);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'border-connect-600 bg-connect-700 text-white dark:bg-connect-600'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {c.key === 'all' ? 'All actions' : c.label}
                  {typeof c.count === 'number' ? ` (${c.count})` : ''}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={dateMenuRef}>
              <button
                type="button"
                onClick={() => setDateMenuOpen((o) => !o)}
                aria-expanded={dateMenuOpen}
                aria-haspopup="dialog"
                className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <CalendarRange className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <span className="max-w-[14rem] truncate">{dateFilterLabel ?? 'Date range'}</span>
              </button>
              {dateMenuOpen ? (
                <div
                  className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-600 dark:bg-gray-900"
                  role="dialog"
                  aria-label="Date range filter"
                >
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Filter by date
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="audit-from" className="text-xs text-gray-500 dark:text-gray-400">
                        From
                      </label>
                      <input
                        id="audit-from"
                        type="date"
                        value={from}
                        onChange={(e) => {
                          setPage(0);
                          setFrom(e.target.value);
                        }}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="audit-to" className="text-xs text-gray-500 dark:text-gray-400">
                        To
                      </label>
                      <input
                        id="audit-to"
                        type="date"
                        value={to}
                        onChange={(e) => {
                          setPage(0);
                          setTo(e.target.value);
                        }}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => {
                          clearDateRange();
                        }}
                        className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateMenuOpen(false)}
                        className="rounded-lg bg-connect-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-connect-800 dark:bg-connect-600 dark:hover:bg-connect-700"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => runExport()}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-connect-700 px-4 py-2 text-sm font-medium text-white hover:bg-connect-800 disabled:opacity-50 dark:bg-connect-600 dark:hover:bg-connect-700"
            >
              <Download className="h-4 w-4" aria-hidden />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>

        <div className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder={uiCopy.auditLogsSearchPlaceholder}
              value={search}
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
              }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
            />
          </div>
          {(dateFilterLabel || debouncedSearch.trim()) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
              <span className="font-medium text-sky-800 dark:text-sky-200">Active filters:</span>
              {dateFilterLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-medium text-sky-900 shadow-sm dark:bg-gray-800 dark:text-sky-100">
                  Date range: {dateFilterLabel}
                  <button
                    type="button"
                    onClick={clearDateRange}
                    className="rounded p-0.5 hover:bg-sky-100 dark:hover:bg-gray-700"
                    aria-label="Clear date range"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}
              {debouncedSearch.trim() ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-medium text-sky-900 shadow-sm dark:bg-gray-800 dark:text-sky-100">
                  Search: {debouncedSearch.trim()}
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="rounded p-0.5 hover:bg-sky-100 dark:hover:bg-gray-700"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-end border-b border-gray-100 px-4 py-2 dark:border-gray-700">
            <div className="relative" ref={colsRef}>
              <button
                type="button"
                onClick={() => setColsOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Columns3 className="h-4 w-4" aria-hidden />
                Columns
              </button>
              {colsOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-900">
                  {(Object.keys(COL_LABELS) as ColKey[]).map((k) => (
                    <label
                      key={k}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
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
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-400">
                <tr>
                  {visible.timestamp ? (
                    <th className="whitespace-nowrap px-4 py-3">
                      <button type="button" onClick={() => toggleSort('createdAt')} className="inline-flex items-center gap-1">
                        Timestamp
                        <span className="text-gray-400">↕</span>
                      </button>
                    </th>
                  ) : null}
                  {visible.admin ? <th className="whitespace-nowrap px-4 py-3">Admin</th> : null}
                  {visible.action ? (
                    <th className="whitespace-nowrap px-4 py-3">
                      <button type="button" onClick={() => toggleSort('actionType')} className="inline-flex items-center gap-1">
                        Action type
                        <span className="text-gray-400">↕</span>
                      </button>
                    </th>
                  ) : null}
                  {visible.target ? <th className="whitespace-nowrap px-4 py-3">Target</th> : null}
                  {visible.details ? <th className="px-4 py-3">Details</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {logs.map((row) => {
                  const badge = severityBadge(row.severity);
                  const Icon = badge.icon;
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                      {visible.timestamp ? (
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
                          {format(new Date(row.createdAt), 'MMM d, yyyy, h:mm a')}
                        </td>
                      ) : null}
                      {visible.admin ? (
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900 dark:text-white">
                          {row.adminDisplayName ?? row.adminUsername ?? row.adminEmail ?? row.adminUserId}
                        </td>
                      ) : null}
                      {visible.action ? (
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                            <span className="text-gray-900 dark:text-white">{row.actionLabel}</span>
                            <span
                              className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {badge.label}
                            </span>
                          </div>
                        </td>
                      ) : null}
                      {visible.target ? (
                        <td className="whitespace-nowrap px-4 py-3 text-gray-800 dark:text-gray-200">{row.targetLabel}</td>
                      ) : null}
                      {visible.details ? (
                        <td className="max-w-md px-4 py-3 text-gray-600 dark:text-gray-400">{row.details || '—'}</td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Rows per page</span>
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  setPage(0);
                  setPageSize(Number(e.target.value));
                }}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <p className="text-center sm:flex-1">
              Showing {start} to {end} of {total} results
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-2 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const startPg = Math.max(0, Math.min(page - 2, totalPages - 5));
                const pg = startPg + i;
                if (pg >= totalPages) return null;
                return (
                  <button
                    key={pg}
                    type="button"
                    onClick={() => setPage(pg)}
                    className={`min-w-[2.25rem] rounded-lg px-2 py-1 text-sm font-medium ${
                      page === pg
                        ? 'bg-connect-700 text-white dark:bg-connect-600'
                        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {pg + 1}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-2 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
