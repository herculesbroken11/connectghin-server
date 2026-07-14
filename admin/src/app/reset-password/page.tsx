'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Missing reset token. Open the link from your email again.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const body = await res.text();
        let message = 'Could not reset password. The link may be invalid or expired.';
        try {
          const json = JSON.parse(body) as { message?: string | string[] };
          if (typeof json.message === 'string') message = json.message;
          else if (Array.isArray(json.message) && json.message[0]) message = json.message[0];
        } catch {
          // keep default
        }
        throw new Error(message);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Reset password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set a new password for your ConnectGHIN account. If you signed up with Google, you can still use
          Continue with Google after this.
        </p>

        {done ? (
          <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Password updated. Open the ConnectGHIN app and sign in with your email and new password, or use
            Continue with Google.
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            {!token && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No token found in the URL. Use the full link from your reset email.
              </div>
            )}
            <label className="block text-sm font-medium text-slate-800">
              New password
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <button
              type="submit"
              disabled={busy || !token}
              className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-slate-600">Loading…</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
