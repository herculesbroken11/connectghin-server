'use client';

import type { ReactNode } from 'react';

import { AdminTopBar } from './AdminTopBar';

export function AdminPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <AdminTopBar pageTitle={title} />
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 dark:bg-slate-950 md:p-6">{children}</div>
    </>
  );
}
