'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { AdminSidebar } from '../../components/admin/AdminSidebar';
import { AdminUiCopyProvider } from '../../context/AdminUiCopyContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { ToastProvider } from '../../context/ToastContext';
import { expireAdminSession, isAdminAccessTokenExpired, isAdminLoggedIn } from '../../lib/api';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isAdminLoggedIn() || isAdminAccessTokenExpired()) {
      expireAdminSession();
    }
  }, []);

  return (
    <ThemeProvider>
      <ToastProvider>
        <AdminUiCopyProvider>
          <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
            <AdminSidebar />
            <div className="flex min-w-0 flex-1 flex-col pt-14 lg:pt-0">{children}</div>
          </div>
        </AdminUiCopyProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
