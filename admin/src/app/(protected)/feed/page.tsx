'use client';

import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { useToast } from '../../../context/ToastContext';
import { adminApi } from '../../../lib/api';
import { useDebounced } from '../../../lib/useDebounced';

type FeedAuthor = {
  id: string;
  email: string;
  username: string;
  profile: { displayName: string } | null;
};

type FeedPost = {
  id: string;
  courseName: string;
  city: string | null;
  state: string | null;
  roundDate: string;
  teeTime: string;
  gameStyle: string;
  status: 'OPEN' | 'FILLED' | 'CANCELED';
  createdAt: string;
  poster: FeedAuthor;
};

function authorName(author: FeedAuthor): string {
  return author.profile?.displayName?.trim() || author.username;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|_)(\w)/g, (_, space: string, letter: string) => `${space ? ' ' : ''}${letter.toUpperCase()}`);
}

function statusClass(status: FeedPost['status']): string {
  if (status === 'OPEN') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100';
  if (status === 'FILLED') return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-100';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
}

export default function FeedModerationPage() {
  const toast = useToast();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 350);
  const [status, setStatus] = useState('all');
  const [gameStyle, setGameStyle] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await adminApi<{ items: FeedPost[]; total: number }>('/admin/foursome-feed', undefined, {
        page,
        pageSize,
        search: debouncedSearch || undefined,
        status: status === 'all' ? undefined : status,
        gameStyle: gameStyle === 'all' ? undefined : gameStyle,
      });
      setPosts(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feed posts');
    }
  }, [debouncedSearch, gameStyle, page, pageSize, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (post: FeedPost, action: 'hide' | 'restore') => {
    const nextStatus = action === 'hide' ? 'CANCELED' : 'OPEN';
    if (!window.confirm(`${action === 'hide' ? 'Hide' : 'Restore'} this feed post? Its status will be set to ${nextStatus}.`)) {
      return;
    }
    setModeratingId(post.id);
    try {
      await adminApi(`/admin/foursome-feed/${post.id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      toast.success(action === 'hide' ? 'Feed post hidden' : 'Feed post restored');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Moderation failed');
    } finally {
      setModeratingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminPageShell title="Feed">
      <div className="mb-6 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
            placeholder="Search author, course, city, or notes"
            aria-label="Search feed posts"
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm shadow-sm outline-none ring-connect-500/20 focus:ring-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setPage(0);
            setStatus(e.target.value);
          }}
          aria-label="Filter feed status"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="FILLED">Filled</option>
          <option value="CANCELED">Canceled / hidden</option>
        </select>
        <select
          value={gameStyle}
          onChange={(e) => {
            setPage(0);
            setGameStyle(e.target.value);
          }}
          aria-label="Filter game style"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="all">All game styles</option>
          <option value="CASUAL">Casual</option>
          <option value="COMPETITIVE">Competitive</option>
          <option value="TOURNAMENT">Tournament</option>
          <option value="SERIOUS">Serious</option>
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-white">{total.toLocaleString()}</span> matching posts
          </p>
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(0);
              setPageSize(Number(e.target.value));
            }}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          >
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Game style</th>
                <th className="px-4 py-3">Round date</th>
                <th className="px-4 py-3">Posted</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-900/40">
                  <td className="px-4 py-3">
                    <Link href={`/users/${post.poster.id}`} className="font-medium text-gray-900 hover:text-connect-700 dark:text-white dark:hover:text-connect-400">
                      {authorName(post.poster)}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400">@{post.poster.username}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{post.courseName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[post.city, post.state].filter(Boolean).join(', ') || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass(post.status)}`}>
                      {titleCase(post.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{titleCase(post.gameStyle)}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {format(new Date(post.roundDate), 'MMM d, yyyy')} · {post.teeTime}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {format(new Date(post.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={moderatingId === post.id}
                      onClick={() => void moderate(post, post.status === 'CANCELED' ? 'restore' : 'hide')}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                        post.status === 'CANCELED'
                          ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300'
                          : 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300'
                      }`}
                    >
                      {post.status === 'CANCELED' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {post.status === 'CANCELED' ? 'Restore' : 'Hide'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {posts.length === 0 && !error && (
            <p className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No feed posts match these filters.</p>
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
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            type="button"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((current) => current + 1)}
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
