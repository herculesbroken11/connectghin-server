'use client';

import { format } from 'date-fns';
import { ArrowLeft, Calendar, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { AdminPageShell } from '../../../../components/admin/AdminPageShell';
import { useToast } from '../../../../context/ToastContext';
import { adminApi } from '../../../../lib/api';

type UserLite = {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  profile: { displayName: string; homeCourse?: string | null; bio?: string | null } | null;
};

type GhinDetail = {
  id: string;
  userId: string;
  status: string;
  ghinNumber: string;
  handicapSnapshot?: string | number | null;
  submittedAt: string;
  submittedFirstName?: string | null;
  submittedLastName?: string | null;
  rejectionReason?: string | null;
  appealNote?: string | null;
  reviewedAt?: string | null;
  user: UserLite;
};

type AppSetting = { key: string; valueJson: unknown };

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
  'GHIN number must be valid and active.',
  'Handicap should match GHIN records.',
  'Club name should be verifiable.',
  'Profile info should be consistent.',
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

export default function GHINDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState<GhinDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveNote, setApproveNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [guidelines, setGuidelines] = useState<string[]>(DEFAULT_GUIDELINES);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const data = await adminApi<GhinDetail>(`/admin/ghin-requests/${id}`);
      setItem(data);
    } catch (e) {
      setItem(null);
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
        const setting = rows.find((r) => r.key === 'admin_verification_guidelines');
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

  const canReview = item && (item.status === 'PENDING' || item.status === 'APPEAL');

  const runApprove = async () => {
    if (!id) return;
    try {
      await adminApi(`/admin/ghin-requests/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
      toast.success('Verification approved');
      setApproveOpen(false);
      setApproveNote('');
      await load();
    } catch {
      toast.error('Approve failed');
    }
  };

  const runReject = async () => {
    if (!id || !rejectReason.trim()) return;
    try {
      await adminApi(`/admin/ghin-requests/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      toast.success('Verification rejected');
      setRejectOpen(false);
      setRejectReason('');
      await load();
    } catch {
      toast.error('Reject failed');
    }
  };

  const card =
    'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/90';

  const displayName =
    item?.user.profile?.displayName?.trim() ||
    [item?.submittedFirstName, item?.submittedLastName].filter(Boolean).join(' ') ||
    item?.user.username ||
    '';
  const handicapStr =
    item?.handicapSnapshot !== undefined && item?.handicapSnapshot !== null && `${item.handicapSnapshot}` !== ''
      ? String(item.handicapSnapshot)
      : '—';
  const club = item?.user.profile?.homeCourse || '—';
  const notes = item?.appealNote?.trim() || item?.user.profile?.bio?.trim() || null;

  return (
    <AdminPageShell title="GHIN Verification Detail">
      <button
        type="button"
        onClick={() => router.push('/verification')}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-connect-700 hover:underline dark:text-connect-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Verifications
      </button>

      {loadError && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {item && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <section className={card}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600 dark:bg-gray-600 dark:text-gray-100">
                      {initials(displayName, item.user.username)}
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-gray-900 dark:text-white">{displayName}</h1>
                      <p className="text-sm text-gray-500 dark:text-gray-400">@{item.user.username}</p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.user.email}</p>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Member since {format(new Date(item.user.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/users/${item.user.id}`}
                    className="shrink-0 text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400"
                  >
                    View full profile
                  </Link>
                </div>
              </section>

              <section className={card}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Submitted GHIN data
                </h2>
                <dl className="mt-4 grid gap-6 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">GHIN number</dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                      {formatGhin(item.ghinNumber)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Handicap index</dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{handicapStr}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Club name</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{club}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Additional notes</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                      {notes ?? '—'}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className={card}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Verification timeline
                </h2>
                <ul className="mt-4 space-y-4 border-l-2 border-connect-500/30 pl-4 dark:border-connect-500/40">
                  <li className="relative">
                    <Calendar className="absolute -left-[1.15rem] top-0.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Verification requested</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(item.submittedAt), 'MMM d, yyyy')}
                    </p>
                  </li>
                  <li className="relative">
                    <Calendar className="absolute -left-[1.15rem] top-0.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Submitted GHIN data</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(item.submittedAt), 'MMM d, yyyy')}
                    </p>
                  </li>
                  {item.reviewedAt && (
                    <li className="relative">
                      <Calendar className="absolute -left-[1.15rem] top-0.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
                      <p className="text-sm font-medium text-gray-900 dark:text-white">Review completed</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(item.reviewedAt), 'MMM d, yyyy')}
                      </p>
                    </li>
                  )}
                </ul>
              </section>
            </div>

            <div className="space-y-6">
              <section className={card}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Current status
                </h2>
                <div className="mt-4 flex flex-col items-center gap-2 text-center">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusBadge(item.status).className}`}
                  >
                    {statusBadge(item.status).label}
                  </span>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Submitted {format(new Date(item.submittedAt), 'MMM d, yyyy')}
                  </p>
                  {item.rejectionReason && (
                    <p className="text-left text-xs text-red-700 dark:text-red-300">Reason: {item.rejectionReason}</p>
                  )}
                </div>
              </section>

              <section className={card}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Review actions
                </h2>
                <div className="mt-4 flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={!canReview}
                    onClick={() => setApproveOpen(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-connect-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-connect-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-connect-600 dark:hover:bg-connect-500"
                  >
                    <Check className="h-4 w-4" />
                    Approve verification
                  </button>
                  <button
                    type="button"
                    disabled={!canReview}
                    onClick={() => setRejectOpen(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                    Reject verification
                  </button>
                </div>
              </section>

              <section className={card}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Verification guidelines
                </h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
                  {guidelines.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      {approveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-600 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setApproveOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Approve GHIN verification</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This user will receive a verified badge and access to verified-only features.
            </p>
            <label className="mt-4 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Internal note (optional, not sent to user)
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                rows={3}
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApproveOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runApprove}
                className="rounded-xl bg-connect-600 px-4 py-2 text-sm font-semibold text-white hover:bg-connect-700 dark:bg-connect-600 dark:hover:bg-connect-500"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-600 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reject GHIN verification</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Please provide a reason for rejection. The user will be notified.
            </p>
            <textarea
              className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              rows={4}
              placeholder="Reason…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim()}
                onClick={runReject}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
