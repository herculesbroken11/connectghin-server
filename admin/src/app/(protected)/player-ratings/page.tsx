'use client';

import { Search, Star } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { adminApi } from '../../../lib/api';

type RatingStatus = 'approved' | 'flagged' | 'pending' | 'removed';
type PlayerRatingRow = {
  id: string;
  profileId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerHandle: string;
  revieweeId: string;
  revieweeName: string;
  revieweeHandle: string;
  submittedDate: string;
  overallRating: number;
  comment: string;
  wouldPlayAgain: boolean;
  status: RatingStatus;
};
type PlayerRatingsSummary = { total: number; flagged: number; approved: number; avgRating: number };

function stars(value: number) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < rounded ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-gray-700 dark:text-gray-200">{value.toFixed(1)}</span>
    </div>
  );
}

function statusBadge(status: string) {
  if (status === 'approved') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200';
  }
  if (status === 'flagged') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';
  }
  if (status === 'pending') {
    return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  }
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200';
}

export default function PlayerRatingsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'approved' | 'flagged' | 'pending' | 'removed'>('all');
  const [summary, setSummary] = useState<PlayerRatingsSummary>({
    total: 0,
    flagged: 0,
    approved: 0,
    avgRating: 0,
  });
  const [rows, setRows] = useState<PlayerRatingRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminApi<PlayerRatingsSummary>('/admin/player-ratings/summary')
      .then(setSummary)
      .catch(() => setSummary({ total: 0, flagged: 0, approved: 0, avgRating: 0 }));
  }, []);

  useEffect(() => {
    setLoading(true);
    adminApi<{ items: PlayerRatingRow[]; total: number }>('/admin/player-ratings', undefined, {
      search: search || undefined,
      status,
      page: 0,
      pageSize: 100,
    })
      .then((res) => setRows(res.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [search, status]);

  const filtered = useMemo(() => rows, [rows]);

  return (
    <AdminPageShell title="Player Ratings Management">
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">Review, moderate, and manage player ratings and reviews</p>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Ratings</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Flagged</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{summary.flagged}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Approved</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{summary.approved}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Avg Rating</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{summary.avgRating}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            placeholder="Search by reviewer, reviewee, or comment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | 'approved' | 'flagged' | 'pending' | 'removed')}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="flagged">Flagged</option>
          <option value="pending">Pending</option>
          <option value="removed">Removed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Reviewer</th>
                <th className="px-4 py-3">Reviewee</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Comment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    <Link href={`/player-ratings/${r.reviewerId}`} className="group inline-block">
                      <p className="font-medium group-hover:text-connect-700 group-hover:underline dark:group-hover:text-connect-400">
                        {r.reviewerName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.reviewerHandle}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    <Link href={`/player-ratings/${r.revieweeId}`} className="group inline-block">
                      <p className="font-medium text-connect-700 group-hover:underline dark:text-connect-400">
                        {r.revieweeName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.revieweeHandle}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3">{stars(r.overallRating)}</td>
                  <td className="max-w-sm px-4 py-3 text-gray-700 dark:text-gray-300">
                    <p className="line-clamp-1">{r.comment}</p>
                    <p className={`mt-1 text-xs font-medium ${r.wouldPlayAgain ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {r.wouldPlayAgain ? 'Would play again' : 'Would not play again'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.submittedDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <Link href={`/player-ratings/${r.profileId}`} className="text-connect-700 hover:underline dark:text-connect-400">
                        View Details
                      </Link>
                      <Link href={`/player-ratings/reviews/${r.id}`} className="text-gray-700 hover:underline dark:text-gray-300">
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No ratings found.</p>
        )}
      </div>
      {loading && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Loading...</p>}
    </AdminPageShell>
  );
}
