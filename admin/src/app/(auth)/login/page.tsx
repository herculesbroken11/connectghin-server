'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

import { adminLogin, fetchAdminPublicConfig } from '../../../lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [brandName, setBrandName] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminPublicConfig()
      .then((c) => setBrandName(c.brandName))
      .catch(() => setBrandName('Admin'));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-connect-50 via-white to-slate-100 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <form
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            await adminLogin(email, password);
            router.replace('/dashboard');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="mb-6 flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left">
          <Image
            src="/connectghin-logo.png"
            alt="ConnectGHIN"
            width={200}
            height={80}
            className="h-auto w-44 shrink-0 object-contain"
            priority
          />
          <div className="mt-4 sm:mt-0 sm:ml-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {brandName === null ? 'Admin panel' : `${brandName} Admin`}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Sign in with your admin account</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none ring-connect-600 focus:ring-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none ring-connect-600 focus:ring-2 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-connect-700 py-2.5 text-sm font-semibold text-white transition hover:bg-connect-800 disabled:opacity-60 dark:bg-connect-600 dark:hover:bg-connect-500"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
