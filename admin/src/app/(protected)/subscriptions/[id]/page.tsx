'use client';

import { format } from 'date-fns';
import { ArrowLeft, CreditCard, ExternalLink, StickyNote } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { AdminPageShell } from '../../../../components/admin/AdminPageShell';
import { PlatformTableCell } from '../../../../components/admin/StorePlatformIcons';
import { useToast } from '../../../../context/ToastContext';
import { adminApi } from '../../../../lib/api';

type UserDetail = {
  id: string;
  email: string;
  username: string;
  profile: { displayName: string } | null;
  primaryProfilePhoto: { imageUrl: string } | null;
};

type PaymentRow = {
  createdAt: string;
  amountCents: number;
  currency: string;
  invoiceId: string;
  status: string;
  provider: string | null;
};

type SubscriptionDetail = {
  id: string;
  userId: string;
  status: string;
  planCode: string;
  billingCycle: string;
  provider: string;
  storeProductId?: string | null;
  storeExternalId?: string | null;
  amount?: number | null;
  currency?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string | null;
  createdAt: string;
  user: UserDetail;
  paymentHistory: PaymentRow[];
  stats: { totalRevenueCents: number; successfulPaymentCount: number };
  providerDashboardSubscription: string | null;
};

function planDisplay(planCode: string, cycle: string): string {
  const cycleLabel = cycle === 'YEARLY' ? 'Yearly' : 'Monthly';
  if (/premium/i.test(planCode)) return `Premium ${cycleLabel}`;
  return `${planCode.replace(/_/g, ' ')} (${cycleLabel})`;
}

function moneyFromCents(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null) return '—';
  const cur = (currency || 'usd').toUpperCase();
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(cents / 100);
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
    default:
      return {
        label: status,
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      };
  }
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

export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [row, setRow] = useState<SubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setError(null);
    adminApi<SubscriptionDetail>(`/admin/subscriptions/${id}`)
      .then(setRow)
      .catch((e) => {
        setRow(null);
        setError(e instanceof Error ? e.message : 'Failed');
      });
  }, [id]);

  const card =
    'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/90';

  const display = row?.user.profile?.displayName?.trim() || row?.user.username || '';
  const st = row ? statusBadge(row.status) : null;

  return (
    <AdminPageShell title="Subscription Detail">
      <button
        type="button"
        onClick={() => router.push('/subscriptions')}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-connect-700 hover:underline dark:text-connect-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Subscriptions
      </button>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {row && st && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className={card}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4">
                  {row.user.primaryProfilePhoto?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.user.primaryProfilePhoto.imageUrl}
                      alt=""
                      className="h-16 w-16 rounded-full border border-gray-200 object-cover dark:border-gray-600"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600 dark:bg-gray-600 dark:text-gray-100">
                      {initials(display, row.user.username)}
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{display}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{row.user.username}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{row.user.email}</p>
                  </div>
                </div>
                <Link
                  href={`/users/${row.user.id}`}
                  className="shrink-0 text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400"
                >
                  View full profile
                </Link>
              </div>
            </section>

            <section className={card}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Subscription details
                </h2>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${st.className}`}>
                  {st.label}
                </span>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Plan</dt>
                  <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                    {planDisplay(row.planCode, row.billingCycle)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Amount</dt>
                  <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                    {moneyFromCents(row.amount ?? null, row.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Platform</dt>
                  <dd className="mt-1">
                    <PlatformTableCell provider={row.provider} compact />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Billing cycle</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">
                    {row.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Cancel at period end</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">{row.cancelAtPeriodEnd ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Current period start</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">
                    {row.currentPeriodStart ? format(new Date(row.currentPeriodStart), 'MMM d, yyyy') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Current period end</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">
                    {row.currentPeriodEnd ? format(new Date(row.currentPeriodEnd), 'MMM d, yyyy') : '—'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                App Store / Google Play
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Store</dt>
                  <dd className="mt-1 inline-flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <PlatformTableCell provider={row.provider} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Store product id</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-gray-900 dark:text-white">
                    {row.storeProductId ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Store external id</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-gray-900 dark:text-white">
                    {row.storeExternalId ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Payment method</dt>
                  <dd className="mt-1 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <CreditCard className="h-4 w-4 text-gray-400" />
                    <span>—</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">(store-managed)</span>
                  </dd>
                </div>
              </dl>
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Payment history
              </h2>
              {row.paymentHistory.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  No invoice or in-app entitlement sync events recorded for this subscription yet.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-gray-100 text-xs font-semibold uppercase text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <tr>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Store</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2">Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {row.paymentHistory.map((p) => (
                        <tr key={p.invoiceId + p.createdAt}>
                          <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                            {format(new Date(p.createdAt), 'MMM d, yyyy')}
                          </td>
                          <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white">
                            {moneyFromCents(p.amountCents, p.currency)}
                          </td>
                          <td className="py-2 pr-4">
                            <PlatformTableCell provider={p.provider} />
                          </td>
                          <td className="py-2 pr-4">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{p.status}</span>
                          </td>
                          <td className="max-w-[160px] truncate py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                            {p.invoiceId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Quick stats
              </h2>
              <div className="mt-4 space-y-4">
                <div className="rounded-xl bg-emerald-50/80 px-4 py-3 dark:bg-emerald-950/30">
                  <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">Total revenue</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                    {moneyFromCents(row.stats.totalRevenueCents, row.currency)}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50/80 px-4 py-3 dark:bg-sky-950/30">
                  <p className="text-xs font-medium text-sky-800 dark:text-sky-200">Successful payments</p>
                  <p className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-300">{row.stats.successfulPaymentCount}</p>
                </div>
              </div>
            </section>

            <section className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Admin actions</h2>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() =>
                    toast.info('Internal subscription notes will be available in a future update. Use store entitlement metadata for now.')
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  <StickyNote className="h-4 w-4" />
                  Add internal note
                </button>
                {row.providerDashboardSubscription ? (
                  <a
                    href={row.providerDashboardSubscription}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View provider dashboard
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-2.5 text-sm text-gray-400 dark:border-gray-600"
                  >
                    Provider link unavailable
                  </button>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-sky-200 bg-sky-50/80 p-5 dark:border-sky-900/50 dark:bg-sky-950/30">
              <p className="text-sm text-sky-900 dark:text-sky-100">
                Subscription billing is managed by the mobile store provider. For payment issues, refer to App Store Connect or Google Play Console.
              </p>
            </section>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
