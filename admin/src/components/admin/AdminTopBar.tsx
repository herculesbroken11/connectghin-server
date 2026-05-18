'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  ChevronDown,
  CreditCard,
  Flag,
  LogOut,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTheme } from '../../context/ThemeContext';
import { useAdminUiCopy } from '../../context/AdminUiCopyContext';
import { adminApi, clearAdminTokens, decodeAdminAccessToken } from '../../lib/api';
import { useDebounced } from '../../lib/useDebounced';
import { clsx } from 'clsx';

type AdminTopBarProps = { pageTitle: string };

type NotificationItem = {
  id: string;
  type: 'verification' | 'report' | 'billing' | 'system';
  title: string;
  message: string;
  at: string;
  read: boolean;
  link: string;
  readKey?: string;
};

type SearchPayload = {
  users: { id: string; email: string; username: string; membershipType: string }[];
  reports: { id: string; reason: string; status: string; targetUserId: string }[];
  ghinRequests: { id: string; userId: string; ghinNumber: string; status: string }[];
  subscriptions: { id: string; userId: string; planCode: string; status: string; billingCycle: string }[];
};

type SearchHit =
  | { kind: 'user'; title: string; subtitle: string; href: string }
  | { kind: 'report'; title: string; subtitle: string; href: string }
  | { kind: 'verification'; title: string; subtitle: string; href: string }
  | { kind: 'subscription'; title: string; subtitle: string; href: string };

const NOTIFICATION_READ_KEY = 'cg_admin_notifications_read_keys';

function getStoredReadNotificationKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_READ_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function persistReadNotificationKeys(keys: Set<string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(Array.from(keys)));
}

function flattenSearch(data: SearchPayload): SearchHit[] {
  const out: SearchHit[] = [];
  for (const u of data.users) {
    out.push({
      kind: 'user',
      title: u.username,
      subtitle: `${u.email} · ${u.membershipType}`,
      href: `/users/${u.id}`,
    });
  }
  for (const r of data.reports) {
    out.push({
      kind: 'report',
      title: `Report ${r.id.slice(0, 8)}…`,
      subtitle: `${r.reason} · ${r.status}`,
      href: `/reports/${r.id}`,
    });
  }
  for (const g of data.ghinRequests) {
    out.push({
      kind: 'verification',
      title: `GHIN ${g.ghinNumber}`,
      subtitle: `${g.status} · user ${g.userId.slice(0, 8)}…`,
      href: `/verification/${g.id}`,
    });
  }
  for (const s of data.subscriptions) {
    out.push({
      kind: 'subscription',
      title: `Subscription ${s.id.slice(0, 8)}…`,
      subtitle: `${s.planCode} · ${s.status}`,
      href: `/subscriptions/${s.id}`,
    });
  }
  return out;
}

function NotificationIcon({ type }: { type: NotificationItem['type'] }) {
  const cls = 'h-4 w-4';
  if (type === 'verification') return <ShieldCheck className={cls} />;
  if (type === 'report') return <Flag className={cls} />;
  if (type === 'billing') return <CreditCard className={cls} />;
  return <Bell className={cls} />;
}

function profileInitials(email?: string, username?: string): string {
  if (username) {
    const parts = username.split(/[_\s.-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase().slice(0, 2);
    }
    return username.slice(0, 2).toUpperCase();
  }
  const local = email?.split('@')[0] ?? 'A';
  return local.slice(0, 2).toUpperCase();
}

export function AdminTopBar({ pageTitle }: AdminTopBarProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const uiCopy = useAdminUiCopy();
  const [profile, setProfile] = useState<{ email?: string; username?: string }>({});
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounced(searchQuery, 320);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const p = decodeAdminAccessToken();
    setProfile({ email: p?.email, username: p?.username });
  }, []);

  const loadNotifications = useCallback(() => {
    adminApi<{ items: NotificationItem[] }>('/admin/notifications')
      .then((res) => {
        const stored = getStoredReadNotificationKeys();
        setNotifications(
          res.items.map((item) => {
            const readKey = `${item.id}:${item.message}`;
            return {
              ...item,
              readKey,
              read: stored.has(readKey),
            };
          }),
        );
      })
      .catch(() => setNotifications([]));
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') loadNotifications();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadNotifications]);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    adminApi<SearchPayload>('/admin/search', undefined, { q })
      .then((data) => {
        if (!cancelled) {
          setSearchHits(flattenSearch(data));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSearchHits([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearchLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(t)) {
        setShowSearch(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(t)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(t)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const markAllRead = () => {
    const keys = notifications.map((n) => n.readKey ?? `${n.id}:${n.message}`);
    const next = getStoredReadNotificationKeys();
    keys.forEach((k) => next.add(k));
    persistReadNotificationKeys(next);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const onNotificationClick = (n: NotificationItem) => {
    const key = n.readKey ?? `${n.id}:${n.message}`;
    const next = getStoredReadNotificationKeys();
    next.add(key);
    persistReadNotificationKeys(next);
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setShowNotifications(false);
    router.push(n.link);
  };

  const onHitClick = (hit: SearchHit) => {
    router.push(hit.href);
    setSearchQuery('');
    setShowSearch(false);
  };

  const logout = () => {
    clearAdminTokens();
    router.replace('/login');
  };

  const displayName = profile.username?.replace(/_/g, ' ') ?? 'Admin User';
  const displayEmail = profile.email ?? '—';
  const initials = profileInitials(profile.email, profile.username);

  const notificationPanel = showNotifications && (
    <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5 dark:border-slate-700">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{uiCopy.notificationsTitle}</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-xs font-semibold text-connect-700 hover:text-connect-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {uiCopy.markAllRead}
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 && (
          <p className="p-4 text-sm text-gray-500 dark:text-slate-400">{uiCopy.emptyNotifications}</p>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onNotificationClick(n)}
            className={clsx(
              'flex w-full gap-3 border-b border-gray-100 px-3 py-3 text-left last:border-0 hover:bg-gray-50 dark:border-slate-700/80 dark:hover:bg-slate-800/90',
              !n.read && 'bg-connect-50/60 dark:bg-slate-800/60',
            )}
          >
            <span
              className={clsx(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-900',
                n.type === 'verification' && 'bg-emerald-200 dark:bg-emerald-400/90',
                n.type === 'report' && 'bg-amber-200 dark:bg-amber-300/90',
                n.type === 'billing' && 'bg-violet-200 dark:bg-violet-300/90',
                n.type === 'system' && 'bg-gray-200 dark:bg-slate-300',
              )}
            >
              <NotificationIcon type={n.type} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start gap-2">
                <span className="mt-1 flex w-4 shrink-0 justify-center pt-0.5" aria-hidden>
                  {!n.read ? (
                    <span className="block h-2 w-2 rounded-full bg-connect-600 dark:bg-sky-400" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">{n.title}</span>
                  <span className="mt-0.5 block text-xs text-gray-600 dark:text-slate-400">{n.message}</span>
                  <span className="mt-1 block text-[11px] text-gray-500 dark:text-slate-500">
                    {formatDistanceToNow(new Date(n.at), { addSuffix: true })}
                  </span>
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="border-t border-gray-200 px-3 py-2.5 dark:border-slate-700">
        <button
          type="button"
          onClick={() => {
            setShowNotifications(false);
            router.push('/audit-logs');
          }}
          className="text-xs font-semibold text-connect-700 hover:text-connect-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          {uiCopy.viewAllActivity}
        </button>
      </div>
    </div>
  );

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 lg:flex-nowrap lg:px-6">
        <h1 className="min-w-0 flex-[1_1_8rem] truncate pl-10 text-lg font-semibold tracking-tight text-gray-900 dark:text-white lg:flex-none lg:pl-0 lg:pr-2">
          {pageTitle}
        </h1>

        <div ref={searchRef} className="relative order-last min-w-0 w-full flex-[1_1_100%] lg:order-none lg:max-w-xl lg:flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search size={18} className="text-gray-400 dark:text-gray-500" />
          </div>
          <input
            type="search"
            placeholder={uiCopy.searchPlaceholder}
            value={searchQuery}
            onFocus={() => setShowSearch(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearch(true);
            }}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-connect-600 focus:outline-none focus:ring-2 focus:ring-connect-600/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
          />
          {showSearch && (
            <div className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
              {searchLoading && (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">{uiCopy.searching}</div>
              )}
              {!searchLoading && debouncedSearch.trim().length >= 2 && searchHits.length === 0 && (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">{uiCopy.noResults}</div>
              )}
              {!searchLoading &&
                searchHits.map((hit, i) => (
                  <button
                    key={`${hit.kind}-${hit.href}-${i}`}
                    type="button"
                    onClick={() => onHitClick(hit)}
                    className="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-0 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800/90"
                  >
                    <span className="mt-0.5 text-gray-400 dark:text-gray-500">
                      {hit.kind === 'user' && <Users size={18} />}
                      {hit.kind === 'report' && <Flag size={18} />}
                      {hit.kind === 'verification' && <ShieldCheck size={18} />}
                      {hit.kind === 'subscription' && <CreditCard size={18} />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">{hit.title}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{hit.subtitle}</span>
                      <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600 dark:bg-gray-600 dark:text-gray-200">
                        {hit.kind}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <Sun size={20} className="text-gray-700 dark:text-gray-300" />
            ) : (
              <Moon size={20} className="text-gray-700 dark:text-gray-300" />
            )}
          </button>

          <div ref={notificationsRef} className="relative">
            <button
              type="button"
              onClick={() =>
                setShowNotifications((v) => {
                  const next = !v;
                  if (next) {
                    loadNotifications();
                  }
                  return next;
                })
              }
              className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              aria-label="Notifications"
            >
              <Bell size={20} className="text-gray-700 dark:text-gray-300" />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notificationPanel}
          </div>

          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-gray-200 py-1 pl-1 pr-2 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800 sm:gap-3 sm:pl-1.5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-connect-700 text-xs font-bold text-white dark:bg-connect-600">
                {initials}
              </span>
              <span className="hidden text-left text-sm leading-tight sm:block">
                <span className="block font-medium text-gray-900 dark:text-white">{displayName}</span>
                <span className="block max-w-[11rem] truncate text-xs text-gray-500 dark:text-gray-400">
                  {displayEmail}
                </span>
              </span>
              <ChevronDown size={16} className="hidden text-gray-500 dark:text-gray-400 sm:block" />
            </button>
            {showUserMenu && (
              <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-800"
                >
                  <LogOut size={16} className="shrink-0 text-gray-600 dark:text-gray-400" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
