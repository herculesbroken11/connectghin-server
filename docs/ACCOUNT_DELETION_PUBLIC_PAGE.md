# ConnectGHIN public account deletion page

**Production URL:** https://connectghin.com/delete-account  
**Do not create** `/account-deletion` — Play Console and Google should use `/delete-account`.

The marketing website source (connectghin.com SPA) is **not** in the `connectghin-mobile` / `connectghin-server` workspace. The live page was audited from production HTML/JS (Aug 31, 2026).

## Audit summary (before this update)

| Requirement | Live page (pre-update) | Status |
|---|---|---|
| Identifies ConnectGHIN | Yes — header/branding | Pass |
| Public, no app login | Yes | Pass |
| Initiate deletion from web without app | **Email support only** — no API-backed web flow | **Fail** |
| Reuses backend deletion workflow | No — manual support email | **Fail** |
| No arbitrary delete-by-email API | N/A (no API) | Pass (nothing exposed) |
| Ownership verification | Support email only (manual) | Partial |
| Explains post-request outcomes | Yes, but **inaccurate** (see below) | Partial |
| Matches backend anonymization | **No** — claimed full message/match deletion, 30-day SLA | **Fail** |
| Retained data disclosed | Generic legal retention note | Partial |
| Store subscription disclosure | **Missing** | **Fail** |
| Privacy Policy link | Yes — `/privacy` | Pass |
| Outdated wording | “30 days”, “Active subscriptions will be cancelled” (in old app mock) | **Fail** |

### Inaccuracies on the live page (fixed in reference implementation)

- **“Deletion requests are generally processed within 30 days”** — backend now processes immediately after a valid in-app or confirmed web request.
- **“Messages and match history” listed as deleted** — backend **anonymizes** identity and **retains** structural rows for safety/integrity.
- **No Google Play / App Store billing note** — required; subscriptions are **not** cancelled by ConnectGHIN.

## Backend APIs (implemented in `connectghin-server`)

All routes are under `/api/v1` and reuse `PrivacySafetyService.deleteRequest()` → `processAccountDeletion()`.

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `POST` | `/account/delete-request` | JWT (in-app) | Immediate deletion after confirmation |
| `GET` | `/account/delete-request` | JWT | Deletion status |
| `POST` | `/account/deletion-web-request` | **None** | Body: `{ "email" }`. Always returns generic success. Sends one-time confirm link if account eligible. **Does not delete.** |
| `POST` | `/account/deletion-web-confirm` | **None** | Body: `{ "token", "reason?" }`. Validates emailed token (60 min). Calls same deletion path as in-app. |

### Ownership verification

1. User submits email on `/delete-account` (web form).
2. Backend emails a **one-time link** to that address (only if an active, non-admin account exists).
3. User must open `https://connectghin.com/delete-account/confirm?token=…` and the page calls `deletion-web-confirm`.
4. Deletion **never** occurs from email alone without token confirmation.

Support email (Option 3) remains a manual fallback for edge cases.

## Website integration

Reference React pages: [`website-reference/delete-account-pages.tsx`](../website-reference/delete-account-pages.tsx)

Register routes in the connectghin.com SPA:

- `/delete-account` → `DeleteAccountPublicPage`
- `/delete-account/confirm` → `DeleteAccountConfirmPage`

### Deploy checklist (manual — not automated)

1. Merge reference page into the **connectghin.com** website repo and deploy static assets.
2. Deploy backend + run migration `20260831210000_account_deletion_web_confirm`.
3. Set `APP_PUBLIC_URL=https://connectghin.com` (confirm links).
4. Set `CORS_ORIGIN` to include `https://connectghin.com`.
5. Play Console → App content → Data deletion → URL: `https://connectghin.com/delete-account`.

## App / Play configuration references

| Location | References `/delete-account`? |
|---|---|
| Mobile in-app flow | `/app/delete-account` (in-app route only) |
| Mobile Privacy Policy screen | Mentions Settings deletion; **no external URL** |
| `settings/public-legal` API | **No** `account_deletion_url` field yet |
| This workspace Play/build scripts | **No** deletion URL configured |
| Play Console | **Confirm in Console** (outside repo) |

## Remaining business / legal confirmations

- [ ] Legal review of updated deletion copy on connectghin.com after deploy
- [ ] Confirm monitored inbox for `support@connectghin.com` (Option 3)
- [ ] Play Console Data deletion URL set to `https://connectghin.com/delete-account`
- [ ] Privacy Policy at `/privacy` reflects retention categories (separate legal review)
- [ ] `APP_PUBLIC_URL` and mail delivery verified in production
