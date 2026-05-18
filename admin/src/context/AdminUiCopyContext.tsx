'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { adminApi } from '../lib/api';

type AppSetting = { key: string; valueJson: unknown };

type AdminUiCopy = {
  searchPlaceholder: string;
  notificationsTitle: string;
  markAllRead: string;
  viewAllActivity: string;
  emptyNotifications: string;
  searching: string;
  noResults: string;
  usersSearchPlaceholder: string;
  reportsSearchPlaceholder: string;
  subscriptionsSearchPlaceholder: string;
  auditLogsSearchPlaceholder: string;
  usersEmptyState: string;
  reportsEmptyState: string;
  subscriptionsEmptyState: string;
};

const DEFAULT_COPY: AdminUiCopy = {
  searchPlaceholder: 'Search users, reports, subscriptions…',
  notificationsTitle: 'Notifications',
  markAllRead: 'Mark all read',
  viewAllActivity: 'View all activity',
  emptyNotifications: "You're all caught up.",
  searching: 'Searching…',
  noResults: 'No results',
  usersSearchPlaceholder: 'Search by email or username…',
  reportsSearchPlaceholder: 'Search reports by reason or details…',
  subscriptionsSearchPlaceholder: 'Search by user, email, plan, store external id, or product id…',
  auditLogsSearchPlaceholder: 'Search logs…',
  usersEmptyState: 'No users match these filters.',
  reportsEmptyState: 'No reports match these filters.',
  subscriptionsEmptyState: 'No subscriptions found.',
};

const AdminUiCopyContext = createContext<AdminUiCopy>(DEFAULT_COPY);

function parseUiCopy(raw: unknown): Partial<AdminUiCopy> {
  const base =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      : raw;
  if (!base || typeof base !== 'object') return {};
  const obj = base as Record<string, unknown>;
  const out: Partial<AdminUiCopy> = {};
  (Object.keys(DEFAULT_COPY) as Array<keyof AdminUiCopy>).forEach((k) => {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) {
      out[k] = v.trim();
    }
  });
  return out;
}

export function AdminUiCopyProvider({ children }: { children: ReactNode }) {
  const [copy, setCopy] = useState<AdminUiCopy>(DEFAULT_COPY);

  useEffect(() => {
    let cancelled = false;
    adminApi<AppSetting[]>('/admin/app-settings')
      .then((rows) => {
        if (cancelled) return;
        const setting = rows.find((r) => r.key === 'admin_ui_copy');
        const parsed = parseUiCopy(setting?.valueJson);
        setCopy({ ...DEFAULT_COPY, ...parsed });
      })
      .catch(() => {
        if (!cancelled) setCopy(DEFAULT_COPY);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => copy, [copy]);
  return <AdminUiCopyContext.Provider value={value}>{children}</AdminUiCopyContext.Provider>;
}

export function useAdminUiCopy(): AdminUiCopy {
  return useContext(AdminUiCopyContext);
}

