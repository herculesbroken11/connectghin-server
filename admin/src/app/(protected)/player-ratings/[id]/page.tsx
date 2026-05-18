'use client';

import { ArrowLeft, CheckCircle2, EyeOff, Flag, ShieldAlert, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AdminPageShell } from '../../../../components/admin/AdminPageShell';
import { useToast } from '../../../../context/ToastContext';
import { adminApi } from '../../../../lib/api';

type PlayerRatingProfile = {
  id: string;
  name: string;
  hcp: string;
  ghin: string;
  membership: 'Free' | 'Premium';
  averageRating: number;
  totalRatings: number;
  trend: 'up' | 'down' | 'flat';
  handicapAccuracyAvg: number;
  sportsmanshipAvg: number;
  paceAvg: number;
  wouldPlayAgainPct: number;
  ratingDistribution: Array<{ rating: number; count: number }>;
};

type PlayerRatingEntry = {
  id: string;
  profileId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerHandle: string;
  roundDate: string;
  submittedDate: string;
  course: string;
  overallRating: number;
  handicapAccuracy: number;
  sportsmanship: number;
  pace: number;
  wouldPlayAgain: boolean;
  comment: string;
  status: 'approved' | 'flagged' | 'pending' | 'removed';
  reportedReason?: string;
};

type ProfileFilter = 'all' | 'flagged' | 'low' | 'pending' | 'removed';
type ProfileSort = 'newest' | 'lowest' | 'highest' | 'reported';

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

function statBar(label: string, value: number) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
        <span>{label}</span>
        <span>{value.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PlayerRatingProfilePage() {
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<PlayerRatingProfile | null>(null);
  const [ratings, setRatings] = useState<PlayerRatingEntry[]>([]);
  const [counts, setCounts] = useState<Record<ProfileFilter, number>>({
    all: 0,
    flagged: 0,
    low: 0,
    pending: 0,
    removed: 0,
  });
  const [filter, setFilter] = useState<ProfileFilter>('all');
  const [sort, setSort] = useState<ProfileSort>('newest');
  const [searchReviewer, setSearchReviewer] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    adminApi<{ profile: PlayerRatingProfile; ratings: PlayerRatingEntry[]; counts: Record<ProfileFilter, number> }>(
      `/admin/player-ratings/profiles/${params.id}`,
      undefined,
      { filter, sort, search: searchReviewer || undefined },
    )
      .then((res) => {
        setProfile(res.profile);
        setRatings(res.ratings);
        setCounts(res.counts);
      })
      .catch(() => {
        setProfile(null);
        setRatings([]);
      })
      .finally(() => setLoading(false));
  }, [params.id, filter, sort, searchReviewer]);

  const runModeration = async (
    ratingId: string,
    action: 'approve' | 'flag' | 'hide',
  ) => {
    try {
      await adminApi(`/admin/player-ratings/reviews/${ratingId}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      toast.success(
        action === 'approve' ? 'Rating approved' : action === 'flag' ? 'Rating flagged' : 'Rating hidden',
      );
      if (params.id) {
        const res = await adminApi<{ profile: PlayerRatingProfile; ratings: PlayerRatingEntry[]; counts: Record<ProfileFilter, number> }>(
          `/admin/player-ratings/profiles/${params.id}`,
          undefined,
          { filter, sort, search: searchReviewer || undefined },
        );
        setProfile(res.profile);
        setRatings(res.ratings);
        setCounts(res.counts);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  if (!profile && !loading) {
    return (
      <AdminPageShell title="Player Rating Profile">
        <p className="text-sm text-red-600 dark:text-red-400">Profile not found.</p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="Player Rating Profile">
      {loading && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Loading...</p>}
      <div className="mb-4">
        <Link href="/player-ratings" className="inline-flex items-center gap-1 text-sm font-medium text-connect-700 hover:underline dark:text-connect-400">
          <ArrowLeft className="h-4 w-4" /> Back to Ratings
        </Link>
      </div>

      {profile && <div className="grid gap-5 xl:grid-cols-[310px_1fr]">
        <aside className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 pb-4 text-center dark:border-gray-700">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-700 dark:bg-gray-600 dark:text-gray-100">
              {profile.name
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{profile.name}</h2>
            <div className="mt-2 flex items-center justify-center gap-2 text-xs">
              <span className="rounded-md bg-emerald-500 px-2 py-1 font-semibold text-white">{profile.hcp} HCP</span>
              <span className="rounded-md bg-blue-600 px-2 py-1 font-semibold text-white">{profile.ghin}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{profile.membership}</p>
          </div>

          <div className="border-b border-gray-100 pb-4 text-center dark:border-gray-700">
            <p className="text-5xl font-semibold text-gray-900 dark:text-white">{profile.averageRating.toFixed(1)}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{profile.totalRatings} total ratings</p>
            <p className={`mt-1 text-xs font-medium ${profile.trend === 'down' ? 'text-red-500' : profile.trend === 'up' ? 'text-emerald-600' : 'text-gray-500'}`}>
              {profile.trend === 'down' ? 'Trending down' : profile.trend === 'up' ? 'Trending up' : 'Trend flat'}
            </p>
          </div>

          <div className="space-y-3">
            {statBar('Handicap Accuracy', profile.handicapAccuracyAvg)}
            {statBar('Sportsmanship', profile.sportsmanshipAvg)}
            {statBar('Pace of Play', profile.paceAvg)}
          </div>

          <div className="rounded-xl bg-emerald-50 p-4 text-center dark:bg-emerald-900/20">
            <p className="text-4xl font-semibold text-emerald-700 dark:text-emerald-300">{profile.wouldPlayAgainPct}%</p>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Would play again</p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Rating Distribution</p>
            <div className="space-y-2">
              {profile.ratingDistribution.map((d) => {
                const maxCount = Math.max(1, ...profile.ratingDistribution.map((x) => x.count));
                const width = Math.round((d.count / maxCount) * 100);
                return (
                  <div key={d.rating} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-gray-600 dark:text-gray-300">{d.rating}</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                      <div className="h-2 rounded-full bg-amber-400" style={{ width: `${width}%` }} />
                    </div>
                    <span className="w-4 text-right text-gray-600 dark:text-gray-300">{d.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {([
                ['all', 'All Ratings'],
                ['flagged', 'Flagged'],
                ['low', 'Low Ratings'],
                ['pending', 'Pending'],
                ['removed', 'Removed'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    filter === k
                      ? 'bg-connect-100 text-connect-800 dark:bg-connect-900/40 dark:text-connect-300'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {label} {counts[k]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={searchReviewer}
                onChange={(e) => setSearchReviewer(e.target.value)}
                placeholder="Search by reviewer name..."
                className="min-w-[220px] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as ProfileSort)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                <option value="newest">Newest</option>
                <option value="lowest">Lowest Ratings</option>
                <option value="highest">Highest Ratings</option>
                <option value="reported">Most Reported</option>
              </select>
            </div>
          </div>
          {ratings.map((rating) => (
            <article
              key={rating.id}
              className={`rounded-2xl border p-4 ${
                rating.status === 'flagged'
                  ? 'border-red-200 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/20'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              }`}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link href={`/player-ratings/${rating.reviewerId}`} className="font-semibold text-gray-900 hover:text-connect-700 hover:underline dark:text-white dark:hover:text-connect-400">
                      {rating.reviewerName}
                    </Link>
                    {rating.status === 'flagged' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-200">
                        <ShieldAlert className="h-3 w-3" /> Reported
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Played {rating.roundDate} · Submitted {rating.submittedDate}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{rating.course}</p>
                </div>
                {stars(rating.overallRating)}
              </div>

              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-900/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Handicap</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">{rating.handicapAccuracy}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-900/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sportsmanship</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">{rating.sportsmanship}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-gray-900/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pace</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">{rating.pace}</p>
                </div>
              </div>

              <p className={`mb-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${rating.wouldPlayAgain ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'}`}>
                {rating.wouldPlayAgain ? 'Would play again' : 'Would not play again'}
              </p>

              <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">{rating.comment}</p>

              {rating.reportedReason && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
                  <span className="font-semibold">Flag reason:</span> {rating.reportedReason}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runModeration(rating.id, 'approve')}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void runModeration(rating.id, 'flag')}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
                >
                  <Flag className="h-3.5 w-3.5" />
                  Flag
                </button>
                <button
                  type="button"
                  onClick={() => void runModeration(rating.id, 'hide')}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Hide
                </button>
                <Link href={`/player-ratings/reviews/${rating.id}`} className="inline-flex rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                  View Details
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>}
    </AdminPageShell>
  );
}
