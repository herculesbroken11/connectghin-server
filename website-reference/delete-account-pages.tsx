/**
 * Reference implementation for https://connectghin.com/delete-account
 *
 * Drop into the ConnectGHIN marketing site (connectghin.com) source repo.
 * Matches the live page layout; adds Option 2 web form wired to the backend API.
 *
 * Routes to register:
 *   /delete-account          -> DeleteAccountPublicPage
 *   /delete-account/confirm  -> DeleteAccountConfirmPage
 *
 * Production API base: https://api.connectghin.com/api/v1
 * Ensure CORS_ORIGIN includes https://connectghin.com on the backend.
 */

import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'wouter';

const API_BASE =
  (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ??
  'https://api.connectghin.com/api/v1';

const DELETED_OR_ANONYMIZED = [
  'Profile photos and profile posts',
  'Device and push notification tokens',
  'Password-reset tokens',
  'Profile information (display name, bio, location, preferences, handicap display fields)',
  'Login email and username (replaced with anonymized placeholders)',
  'GHIN verification submission details (numbers and names redacted)',
  'Open Feed posts (canceled and non-essential fields cleared)',
] as const;

const RETAINED_ANONYMIZED = [
  'Match and message history (identity anonymized; retained for safety and integrity)',
  'Moderation reports involving your account (anonymized identity)',
  'Subscription and billing records where retention is required for store reconciliation or legal obligations',
] as const;

export function DeleteAccountPublicPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmitWebRequest(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/account/deletion-web-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        throw new Error('Request failed');
      }
      setSubmitted(true);
    } catch {
      setError('Could not submit your request. Try again or email support@connectghin.com.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <PublicNav />
      <main className="flex-1 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <header className="mb-12">
            <h1 className="text-4xl font-display font-bold text-foreground">
              Delete Your ConnectGHIN Account
            </h1>
            <p className="text-lg text-muted-foreground mt-4">
              ConnectGHIN lets you delete your account and associated personal data without
              reinstalling the app. Choose the option that works best for you.
            </p>
          </header>

          <section className="mb-10 rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4">
            <h2 className="text-2xl font-display font-semibold">Option 1 — Delete in the app</h2>
            <p className="text-muted-foreground">
              If you still have the ConnectGHIN app installed:
            </p>
            <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
              <li>Open ConnectGHIN and sign in.</li>
              <li>Go to Settings → Delete Account.</li>
              <li>Follow the confirmation steps (including typing DELETE).</li>
            </ol>
            <p className="text-sm text-muted-foreground">
              After you submit, your account is processed using the same backend deletion workflow
              described below. You are signed out immediately.
            </p>
          </section>

          <section className="mb-10 rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4">
            <h2 className="text-2xl font-display font-semibold">
              Option 2 — Request deletion on the web (no app required)
            </h2>
            <p className="text-muted-foreground">
              Enter the email address on your ConnectGHIN account. We email a one-time confirmation
              link to verify ownership. Deletion does not happen until you confirm that link.
            </p>
            {submitted ? (
              <p className="rounded-xl bg-muted/50 border border-border/60 p-4 text-muted-foreground">
                If an account exists for that email, we sent a confirmation link. Check your inbox
                and spam folder. The link expires in 60 minutes.
              </p>
            ) : (
              <form onSubmit={onSubmitWebRequest} className="space-y-4 max-w-md">
                <label className="block text-sm font-medium text-foreground" htmlFor="deletion-email">
                  Account email
                </label>
                <input
                  id="deletion-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2"
                  placeholder="you@example.com"
                  disabled={submitting}
                />
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="rounded-lg bg-destructive text-destructive-foreground px-4 py-2 font-medium disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : 'Email me a confirmation link'}
                </button>
              </form>
            )}
          </section>

          <section className="mb-10 rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4">
            <h2 className="text-2xl font-display font-semibold">Option 3 — Email support</h2>
            <p className="text-muted-foreground">
              If you cannot access your email or need help, contact{' '}
              <a
                href="mailto:support@connectghin.com?subject=Delete%20My%20ConnectGHIN%20Account"
                className="text-primary underline underline-offset-2"
              >
                support@connectghin.com
              </a>{' '}
              from the email on your account so we can verify ownership.
            </p>
          </section>

          <DataOutcomesSection />
          <SubscriptionNote />
          <footer className="flex flex-wrap gap-4 text-sm mt-8">
            <Link href="/" className="text-primary underline underline-offset-2">
              Back to Homepage
            </Link>
            <Link href="/privacy" className="text-primary underline underline-offset-2">
              Privacy Policy
            </Link>
          </footer>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function DeleteAccountConfirmPage() {
  const token =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') ?? ''
      : '';
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>(() =>
    token ? 'working' : 'error',
  );
  const [message, setMessage] = useState(
    token ? 'Confirming your deletion request…' : 'Missing or invalid confirmation link.',
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch(`${API_BASE}/account/deletion-web-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          data?: { billingNote?: string; message?: string };
          message?: string;
        };
        if (!res.ok) {
          throw new Error(body.message ?? 'Confirmation failed');
        }
        if (cancelled) return;
        setState('done');
        setMessage(
          body.data?.billingNote ??
            'Your ConnectGHIN account was deleted or anonymized. Manage any Google Play or App Store subscription in the store.',
        );
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
        setMessage(
          'This confirmation link is invalid or expired. Return to the delete-account page to request a new link.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <PublicNav />
      <main className="flex-1 py-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <h1 className="text-3xl font-display font-bold">
            {state === 'done' ? 'Account deletion complete' : 'Confirm account deletion'}
          </h1>
          <p className="text-muted-foreground">{message}</p>
          {state === 'done' ? <SubscriptionNote /> : null}
          <Link href="/delete-account" className="text-primary underline underline-offset-2 text-sm">
            Back to account deletion
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

function DataOutcomesSection() {
  return (
    <section className="mb-10 rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4">
      <h2 className="text-2xl font-display font-semibold">What happens after your request</h2>
      <p className="text-muted-foreground">
        After we verify a valid deletion request (in-app submission or confirmed email link),
        ConnectGHIN processes deletion promptly using the same backend workflow for all channels.
        Your sessions are invalidated and you can no longer sign in.
      </p>
      <div>
        <p className="font-medium text-foreground mb-2">Deleted or anonymized</p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          {DELETED_OR_ANONYMIZED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-muted/50 border border-border/60 p-4 text-sm space-y-2">
        <p className="font-medium text-foreground">Data we may retain (anonymized identity)</p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          {RETAINED_ANONYMIZED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-muted-foreground pt-1">
          Retained data is kept only as long as needed for safety, fraud prevention, dispute
          resolution, or legal and billing obligations.
        </p>
      </div>
    </section>
  );
}

function SubscriptionNote() {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground mb-1">Google Play and App Store subscriptions</p>
      <p>
        ConnectGHIN does not cancel Google Play or App Store billing when your account is deleted.
        Manage or cancel subscriptions in Google Play or the App Store separately.
      </p>
    </div>
  );
}

function PublicNav() {
  return (
    <nav className="border-b border-border/40 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="font-display font-bold text-xl text-primary">
          ConnectGHIN
        </Link>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Back to Home
        </Link>
      </div>
    </nav>
  );
}

function PublicFooter() {
  return (
    <footer className="py-12 bg-muted/20 border-t border-border/50 text-center text-sm text-muted-foreground">
      <p>© {new Date().getFullYear()} ConnectGHIN. All rights reserved.</p>
    </footer>
  );
}
