'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Flag,
  Star,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { clsx } from 'clsx';

import { fetchAdminPublicConfig } from '../../lib/api';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/verification', label: 'GHIN Verification', icon: ShieldCheck },
  { href: '/reports', label: 'Reports', icon: Flag },
  { href: '/player-ratings', label: 'Player Ratings', icon: Star },
  { href: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/settings', label: 'App Settings', icon: Settings },
  { href: '/audit-logs', label: 'Audit Logs', icon: FileText },
];

function isActivePath(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [brandName, setBrandName] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminPublicConfig()
      .then((c) => setBrandName(c.brandName))
      .catch(() => setBrandName('Admin'));
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('adminSidebarCollapsed');
    setIsCollapsed(saved === 'true');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('adminSidebarCollapsed', String(isCollapsed));
  }, [isCollapsed]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileOpen((o) => !o)}
        className="fixed left-4 top-4 z-50 rounded-lg border border-gray-200 bg-white p-2 shadow-md dark:border-slate-700 dark:bg-slate-900 lg:hidden"
        aria-label="Toggle menu"
      >
        {isMobileOpen ? (
          <X size={24} className="text-gray-900 dark:text-white" />
        ) : (
          <Menu size={24} className="text-gray-900 dark:text-white" />
        )}
      </button>

      <aside
        className={clsx(
          'fixed left-0 top-0 z-40 flex h-screen min-h-0 min-w-0 flex-col overflow-x-hidden border-r border-gray-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          isCollapsed ? 'lg:w-20' : 'lg:w-64',
          'w-64 lg:sticky',
        )}
      >
        <div
          className={clsx(
            'flex items-center justify-between border-b border-gray-200 dark:border-slate-800',
            isCollapsed ? 'p-6 lg:px-2 lg:py-4' : 'p-6',
          )}
        >
          <div
            className={clsx(
              'min-w-0 shrink transition-opacity duration-300',
              isCollapsed ? 'lg:pointer-events-none lg:w-0 lg:overflow-hidden lg:opacity-0' : 'opacity-100',
            )}
          >
            <Image
              src="/connectghin-logo.png"
              alt="ConnectGHIN"
              width={160}
              height={56}
              className="mb-2 h-10 w-auto object-contain object-left"
            />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {brandName === null ? '…' : brandName}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Admin panel</p>
          </div>
          {isCollapsed && (
            <div className="hidden min-w-0 shrink truncate text-2xl font-bold text-connect-700 dark:text-connect-600 lg:block">
              {(brandName && brandName[0] ? brandName[0] : 'A').toUpperCase()}
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed((c) => !c)}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 lg:flex"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
            ) : (
              <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>

        <nav
          className={clsx(
            'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto',
            isCollapsed ? 'p-4 lg:p-2' : 'p-4',
          )}
        >
          <ul className="min-w-0 space-y-2">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href, item.exact);
              const Icon = item.icon;
              return (
                <li key={item.href} className="min-w-0">
                  <Link
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    title={isCollapsed ? item.label : undefined}
                    className={clsx(
                      'relative flex min-w-0 items-center gap-3 rounded-lg py-3 transition-colors',
                      isCollapsed ? 'px-4 lg:justify-center lg:px-2' : 'px-4',
                      active
                        ? 'bg-connect-50 font-medium text-connect-800 dark:bg-connect-900/30 dark:text-connect-300'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-slate-800/90',
                    )}
                  >
                    <Icon
                      size={20}
                      className={clsx(
                        'shrink-0',
                        active
                          ? 'text-connect-700 dark:text-connect-400'
                          : 'text-gray-600 dark:text-gray-400',
                      )}
                    />
                    <span
                      className={clsx(
                        'whitespace-nowrap transition-opacity duration-300',
                        isCollapsed ? 'lg:hidden' : '',
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className={clsx(
            'border-t border-gray-200 dark:border-slate-800',
            isCollapsed ? 'p-4 lg:p-2' : 'p-4',
          )}
        >
          <p
            className={clsx(
              'text-xs text-gray-500 transition-opacity dark:text-gray-400',
              isCollapsed ? 'lg:hidden' : '',
            )}
          >
            {brandName === null ? 'Admin v1.0' : `${brandName} Admin v1.0`}
          </p>
          {isCollapsed && (
            <p className="hidden text-center text-xs text-gray-500 dark:text-gray-400 lg:block">v1.0</p>
          )}
        </div>
      </aside>

      {isMobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-label="Close menu"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}
