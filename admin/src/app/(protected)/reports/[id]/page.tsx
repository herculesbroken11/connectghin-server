'use client';

import { format } from 'date-fns';
import { AlertTriangle, ArrowLeft, Ban, Check, Info, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { AdminPageShell } from '../../../../components/admin/AdminPageShell';
import { useToast } from '../../../../context/ToastContext';
import { adminApi } from '../../../../lib/api';

type UserBrief = {
  id: string;
  email: string;
  username: string;
  isSuspended: boolean;
  lifecycleStatus?: string;
  createdAt: string;
  profile: { displayName: string } | null;
};

type ReportDetail = {
  id: string;
  reason: string;
  details?: string | null;
  adminNotes?: string | null;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  reportedBy: UserBrief;
  targetUser: UserBrief;
};

type AppSetting = { key: string; valueJson: unknown };

function statusPill(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'border border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100';
    case 'REVIEWED':
      return 'border border-gray-300 bg-gray-50 text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200';
    case 'RESOLVED':
      return 'border border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100';
    case 'DISMISSED':
      return 'border border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }
}

function severityPill(sev: string): string {
  if (sev === 'HIGH') return 'bg-red-100 text-red-900 dark:bg-red-900/45 dark:text-red-100';
  if (sev === 'MEDIUM') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100';
  return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-100';
}

function displayName(u: UserBrief): string {
  return u.profile?.displayName?.trim() || u.username;
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

const DEFAULT_GUIDELINES = [
  'High severity reports require immediate review.',
  'Harassment cases warrant suspension.',
  'Multiple reports may indicate patterns.',
  'Document all actions taken.',
];

function parseGuidelines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [guidelines, setGuidelines] = useState<string[]>(DEFAULT_GUIDELINES);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const r = await adminApi<ReportDetail>(`/admin/reports/${id}`);
      setReport(r);
      setNoteDraft(r.adminNotes ?? '');
    } catch (e) {
      setReport(null);
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    adminApi<AppSetting[]>('/admin/app-settings')
      .then((rows) => {
        if (cancelled) return;
        const setting = rows.find((r) => r.key === 'admin_report_moderation_guidelines');
        const parsed = parseGuidelines(setting?.valueJson);
        setGuidelines(parsed.length > 0 ? parsed : DEFAULT_GUIDELINES);
      })
      .catch(() => {
        if (!cancelled) setGuidelines(DEFAULT_GUIDELINES);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const card =
    'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/90';

  const finalStatus = report?.status === 'RESOLVED' || report?.status === 'DISMISSED';
  const targetDeleted = report?.targetUser.lifecycleStatus === 'DELETED';
  const canSuspend =
    report && !finalStatus && !report.targetUser.isSuspended && !targetDeleted;

  const saveNote = async () => {
    if (!report) return;
    try {
      await adminApi(`/admin/reports/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: report.status,
          adminNotes: noteDraft,
        }),
      });
      toast.success('Note saved');
      await load();
    } catch {
      toast.error('Save failed');
    }
  };

  const runSuspend = async () => {
    if (!report) return;
    try {
      await adminApi(`/admin/users/${report.targetUser.id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      toast.success('User suspended');
      setSuspendOpen(false);
      await load();
    } catch {
      toast.error('Suspend failed');
    }
  };

  const runResolve = async () => {
    if (!report) return;
    try {
      await adminApi(`/admin/reports/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      });
      toast.success('Report marked resolved');
      setResolveOpen(false);
      await load();
    } catch {
      toast.error('Update failed');
    }
  };

  const runDismiss = async () => {
    if (!report) return;
    try {
      await adminApi(`/admin/reports/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DISMISSED' }),
      });
      toast.success('Report dismissed');
      setDismissOpen(false);
      await load();
    } catch {
      toast.error('Update failed');
    }
  };

  const statusLabel =
    report?.status === 'OPEN'
      ? 'Open'
      : report?.status === 'REVIEWED'
        ? 'Reviewed'
        : report?.status === 'RESOLVED'
          ? 'Resolved'
          : 'Dismissed';

  const sevLabel = report?.severity === 'HIGH' ? 'High' : report?.severity === 'MEDIUM' ? 'Medium' : 'Low';

  return (
    <AdminPageShell title="Report Detail">
      <button
        type="button"
        onClick={() => router.push('/reports')}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-connect-700 hover:underline dark:text-connect-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </button>

      {loadError && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {report && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className={card}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">{report.reason}</h1>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {format(new Date(report.createdAt), 'MMM d, yyyy, h:mm a')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusPill(report.status)}`}>
                    {statusLabel}
                  </span>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${severityPill(report.severity)}`}>
                    {sevLabel} severity
                  </span>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {report.details?.trim() || 'No additional details provided.'}
              </p>
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Reporting user</h2>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{displayName(report.reportedBy)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">@{report.reportedBy.username}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{report.reportedBy.email}</p>
                </div>
                <Link
                  href={`/users/${report.reportedBy.id}`}
                  className="text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400"
                >
                  View profile
                </Link>
              </div>
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Reported user (target)
              </h2>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 dark:bg-gray-600 dark:text-gray-100">
                    {initials(displayName(report.targetUser), report.targetUser.username)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{displayName(report.targetUser)}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{report.targetUser.username}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{report.targetUser.email}</p>
                  </div>
                </div>
                <Link
                  href={`/users/${report.targetUser.id}`}
                  className="shrink-0 text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400"
                >
                  View full profile
                </Link>
              </div>
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Report timeline</h2>
              <ul className="mt-4 space-y-4 border-l-2 border-connect-500/30 pl-4 dark:border-connect-500/40">
                <li className="relative">
                  <Info className="absolute -left-[1.1rem] top-0.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Report submitted</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(report.createdAt), 'h:mm a')}
                  </p>
                </li>
                {report.severity === 'HIGH' && (
                  <li className="relative">
                    <AlertTriangle className="absolute -left-[1.1rem] top-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Automatically flagged as high priority</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(report.createdAt), 'h:mm a')}
                    </p>
                  </li>
                )}
                {report.reviewedAt && (
                  <li className="relative">
                    <Info className="absolute -left-[1.1rem] top-0.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Review updated</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(report.reviewedAt), 'MMM d, yyyy h:mm a')}
                    </p>
                  </li>
                )}
              </ul>
            </section>
          </div>

          <div className="space-y-6">
            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Admin actions</h2>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={!canSuspend}
                  onClick={() => setSuspendOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Ban className="h-4 w-4" />
                  Suspend target user
                </button>
                <button
                  type="button"
                  disabled={finalStatus}
                  onClick={() => setResolveOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-connect-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-connect-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-connect-600 dark:hover:bg-connect-500"
                >
                  <Check className="h-4 w-4" />
                  Mark resolved
                </button>
                <button
                  type="button"
                  disabled={finalStatus}
                  onClick={() => setDismissOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-700 dark:hover:bg-gray-600"
                >
                  <X className="h-4 w-4" />
                  Dismiss report
                </button>
              </div>
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Internal note</h2>
              <textarea
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                rows={5}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Internal notes (not visible to users)…"
              />
              <button
                type="button"
                onClick={saveNote}
                className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                Save note
              </button>
            </section>

            <section className="rounded-2xl border border-red-200 bg-red-50/80 p-5 dark:border-red-900/50 dark:bg-red-950/30">
              <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">Moderation guidelines</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-red-900/90 dark:text-red-100/90">
                {guidelines.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}

      {suspendOpen && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-600 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setSuspendOpen(false)}
              className="absolute right-4 top-4 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Suspend user</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This will suspend the reported user&apos;s account. They will not be able to access the app.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuspendOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runSuspend}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Suspend
              </button>
            </div>
          </div>
        </div>
      )}

      {resolveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-600 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setResolveOpen(false)}
              className="absolute right-4 top-4 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mark report as resolved</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This will mark the report as resolved and close it.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolveOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runResolve}
                className="rounded-xl bg-connect-600 px-4 py-2 text-sm font-semibold text-white hover:bg-connect-700 dark:bg-connect-600 dark:hover:bg-connect-500"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      {dismissOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-600 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setDismissOpen(false)}
              className="absolute right-4 top-4 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Dismiss report</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This will dismiss the report without taking action. Use this only if the report is invalid.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDismissOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runDismiss}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
