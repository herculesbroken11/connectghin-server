'use client';

import { ArrowLeft, EyeOff, Flag, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AdminPageShell } from '../../../../../components/admin/AdminPageShell';
import { useToast } from '../../../../../context/ToastContext';
import { adminApi } from '../../../../../lib/api';

type RatingStatus = 'approved' | 'flagged' | 'pending' | 'removed';
type PlayerRatingReview = {
  id: string;
  profileId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerHandle: string;
  revieweeName: string;
  revieweeHandle: string;
  roundDate: string;
  submittedDate: string;
  course: string;
  overallRating: number;
  handicapAccuracy: number;
  sportsmanship: number;
  pace: number;
  wouldPlayAgain: boolean;
  comment: string;
  status: RatingStatus;
  reportedReason?: string;
  adminNotes?: string;
  moderationHistory?: Array<{
    id: string;
    action: string;
    createdAt: string;
    adminName: string;
  }>;
};

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

export default function PlayerRatingDetailPage() {
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const [rating, setRating] = useState<PlayerRatingReview | null>(null);
  const [note, setNote] = useState('');
  const [overallRating, setOverallRating] = useState(1);
  const [handicapAccuracy, setHandicapAccuracy] = useState(1);
  const [sportsmanship, setSportsmanship] = useState(1);
  const [pace, setPace] = useState(1);
  const [commentDraft, setCommentDraft] = useState('');
  const [wouldPlayAgain, setWouldPlayAgain] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!params.id) return;
    setLoading(true);
    try {
      const row = await adminApi<PlayerRatingReview>(`/admin/player-ratings/reviews/${params.id}`);
      setRating(row);
      setNote(row.adminNotes ?? '');
      setOverallRating(row.overallRating);
      setHandicapAccuracy(row.handicapAccuracy);
      setSportsmanship(row.sportsmanship);
      setPace(row.pace);
      setCommentDraft(row.comment);
      setWouldPlayAgain(row.wouldPlayAgain);
    } catch {
      setRating(null);
      setNote('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!rating && !loading) {
    return (
      <AdminPageShell title="Rating Detail">
        <p className="text-sm text-red-600 dark:text-red-400">Rating not found.</p>
      </AdminPageShell>
    );
  }

  const guidelines = [
    'Flag ratings with abusive language',
    'Delete ratings that violate community guidelines',
    'Approve legitimate feedback even if negative',
    'Contact users if clarification needed',
  ];

  const runModeration = async (action: 'approve' | 'flag' | 'hide') => {
    if (!rating) return;
    try {
      await adminApi(`/admin/player-ratings/reviews/${rating.id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      toast.success(
        action === 'approve' ? 'Rating approved' : action === 'flag' ? 'Rating flagged' : 'Rating hidden',
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const saveNote = async () => {
    if (!rating) return;
    try {
      await adminApi(`/admin/player-ratings/reviews/${rating.id}/note`, {
        method: 'PATCH',
        body: JSON.stringify({ adminNotes: note }),
      });
      toast.success('Note saved');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const saveAdjustments = async () => {
    if (!rating) return;
    try {
      await adminApi(`/admin/player-ratings/reviews/${rating.id}/adjust`, {
        method: 'PATCH',
        body: JSON.stringify({
          overallRating,
          handicapAccuracy,
          sportsmanship,
          pace,
          comment: commentDraft,
          wouldPlayAgain,
        }),
      });
      toast.success('Review adjusted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Adjustment failed');
    }
  };

  return (
    <AdminPageShell title="Rating Detail">
      {loading && <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Loading...</p>}
      <div className="mb-4">
        <Link href={rating ? `/player-ratings/${rating.profileId}` : '/player-ratings'} className="inline-flex items-center gap-1 text-sm font-medium text-connect-700 hover:underline dark:text-connect-400">
          <ArrowLeft className="h-4 w-4" /> Back to Ratings
        </Link>
      </div>

      {rating && <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Review submitted on {rating.submittedDate}</p>}

      {rating && <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Players</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Reviewer</p>
                <p className="mt-2 font-semibold text-gray-900 dark:text-white">{rating.reviewerName}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{rating.reviewerHandle}</p>
                <Link href={`/users/${rating.reviewerId}`} className="mt-2 inline-block text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400">
                  View Profile
                </Link>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Reviewee</p>
                <p className="mt-2 font-semibold text-gray-900 dark:text-white">{rating.revieweeName}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{rating.revieweeHandle}</p>
                <Link href={`/player-ratings/${rating.profileId}`} className="mt-2 inline-block text-sm font-semibold text-connect-700 hover:underline dark:text-connect-400">
                  View Profile
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Round Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Round Date</p>
                <p className="mt-2 text-gray-900 dark:text-white">{rating.roundDate}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Course</p>
                <p className="mt-2 text-gray-900 dark:text-white">{rating.course}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Rating Breakdown</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700 dark:text-gray-300">Overall</p>
                {stars(rating.overallRating)}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700 dark:text-gray-300">Handicap Accuracy</p>
                {stars(rating.handicapAccuracy)}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700 dark:text-gray-300">Sportsmanship</p>
                {stars(rating.sportsmanship)}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700 dark:text-gray-300">Pace of Play</p>
                {stars(rating.pace)}
              </div>
            </div>
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300">Would Play Again</p>
              <p className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${rating.wouldPlayAgain ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'}`}>
                {rating.wouldPlayAgain ? 'Yes' : 'No'}
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Overall
                <input type="number" min={1} max={5} value={overallRating} onChange={(e) => setOverallRating(Number(e.target.value || 1))} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Handicap Accuracy
                <input type="number" min={1} max={5} value={handicapAccuracy} onChange={(e) => setHandicapAccuracy(Number(e.target.value || 1))} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Sportsmanship
                <input type="number" min={1} max={5} value={sportsmanship} onChange={(e) => setSportsmanship(Number(e.target.value || 1))} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-300">
                Pace of Play
                <input type="number" min={1} max={5} value={pace} onChange={(e) => setPace(Number(e.target.value || 1))} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </label>
            </div>
            <label className="mt-3 block text-xs text-gray-600 dark:text-gray-300">
              Moderator comment adjustment
              <textarea
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                rows={3}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
              />
            </label>
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={wouldPlayAgain} onChange={(e) => setWouldPlayAgain(e.target.checked)} />
              Would play again
            </label>
            <button
              type="button"
              onClick={saveAdjustments}
              className="mt-3 w-full rounded-xl border border-connect-300 bg-connect-50 px-4 py-2.5 text-sm font-semibold text-connect-800 hover:bg-connect-100 dark:border-connect-900/40 dark:bg-connect-900/20 dark:text-connect-300 dark:hover:bg-connect-900/30"
            >
              Save Adjustments
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Written Feedback</h2>
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{rating.comment}</p>
          </div>

          {rating.reportedReason && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
              <p className="mb-1 flex items-center gap-2 font-semibold text-red-800 dark:text-red-200">
                <Flag className="h-4 w-4" />
                Flagged for Review
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">{rating.reportedReason}</p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Admin Notes</h2>
            <textarea
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              rows={4}
              placeholder="Add an internal admin note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              onClick={saveNote}
              className="mt-3 w-full rounded-xl bg-gray-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500"
            >
              Add Note
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Moderation History</h2>
            {rating.moderationHistory && rating.moderationHistory.length > 0 ? (
              <ul className="space-y-2">
                {rating.moderationHistory.map((h) => (
                  <li key={h.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900/60">
                    <p className="font-medium text-gray-900 dark:text-white">{h.action}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(h.createdAt).toLocaleString()} by {h.adminName}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No moderation history yet.</p>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Moderation</h2>
            <button
              type="button"
              onClick={() => void runModeration('approve')}
              className="mb-2 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Approve Rating
            </button>
            <button
              type="button"
              onClick={() => void runModeration('flag')}
              className="mb-2 inline-flex w-full items-center justify-center rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-950/20"
            >
              Flag Rating
            </button>
            <button
              type="button"
              onClick={() => void runModeration('hide')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
            >
              <EyeOff className="h-4 w-4" />
              Hide Rating
            </button>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 dark:border-blue-900/30 dark:bg-blue-950/20">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">Moderation Guidelines</h3>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-blue-900/90 dark:text-blue-100/90">
              {guidelines.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>}
    </AdminPageShell>
  );
}
