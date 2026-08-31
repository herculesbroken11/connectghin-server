/**
 * EXTERNAL WEBSITE IMPLEMENTATION REQUIRED
 *
 * ConnectGHIN has no public marketing website in this workspace
 * (only `connectghin-mobile` and `connectghin-server` / admin).
 *
 * Google Play requires a publicly accessible URL where users can request
 * account deletion without installing the app.
 *
 * Deploy the following page on the official public site once it exists
 * (for example https://connectghin.com/account-deletion — confirm domain with business).
 */

/**
 * Suggested route: /account-deletion
 *
 * Page content requirements:
 * 1. Identify ConnectGHIN
 * 2. Explain in-app deletion: Settings → Privacy / Delete Account
 * 3. Explain web request option below for users who cannot access the app
 * 4. Describe data outcomes matching backend processAccountDeletion:
 *    - Deleted: profile photos, profile posts, device/push tokens, password-reset tokens
 *    - Anonymized: email/username, profile PII, open Feed posts canceled/scrubbed
 *    - Retained (anonymized identity): matches, messages, reports, subscription rows for integrity/billing history
 *    - Billing: Google Play / App Store subscriptions are NOT canceled by ConnectGHIN; user must manage in store
 * 5. Do not expose admin APIs or secrets
 */

/**
 * Secure web deletion request API (to implement on public site backend or API gateway)
 *
 * Do NOT accept unauthenticated `{ email }` alone to delete accounts.
 *
 * Recommended flow (aligned with existing mail + auth patterns):
 *
 * POST /api/v1/account/deletion-web-request
 * Body: { "email": "user@example.com" }
 * Behavior:
 *   - Always return generic success (do not reveal whether email exists)
 *   - If active user exists, email a one-time confirmation link (hashed token, 30–60 min expiry)
 *   - Store token similar to ForgotPasswordToken
 *
 * GET /api/v1/account/deletion-web-confirm?token=...
 * Behavior:
 *   - Validate token
 *   - Call the same processAccountDeletion(userId) used by authenticated in-app flow
 *   - Invalidate sessions (refreshTokenVersion++)
 *   - Show confirmation page
 *
 * CSRF: use same-site cookies or double-submit token if form-based; prefer email link confirm.
 *
 * Until this page and API are live, mark Play Console external deletion URL as pending.
 */

export const ACCOUNT_DELETION_PUBLIC_PAGE_STATUS =
  'EXTERNAL WEBSITE IMPLEMENTATION REQUIRED' as const;
