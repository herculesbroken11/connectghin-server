# Google Play Reviewer Accounts

Primary: `reviewer@connectghin.com` (username: `google_reviewer`)  
Secondary: `reviewer2@connectghin.com` (username: `demo_golfer`)

**Do not include passwords in this document, Git, or `.env.example`.**  
**DO NOT DELETE THE REVIEWER ACCOUNT DURING REVIEW.**

App name: **Connectghin**  
Android package: **com.connectghin.app**

---

## Purpose

Ordinary production accounts so Google Play reviewers can sign into the real app and exercise implemented features. No reviewer-only bypass, hidden login, backdoor, or Google-specific app behavior.

---

## How accounts are created

Script: `connectghin-server/backend/scripts/prepare-google-play-reviewers.ts`

Creation path (normal production APIs only):

1. `POST /api/v1/auth/register` — argon2 password hashing via `AuthService.register`
2. `PATCH /api/v1/profiles/me` — profile completion fields (triggers completion recompute)
3. Admin `PATCH /api/v1/admin/users/:id/premium-override` — legitimate Premium override
4. `POST /api/v1/swipes` — mutual LIKE → Match upsert
5. `POST /api/v1/conversations/start` + `POST /api/v1/conversations/:id/messages`
6. `POST /api/v1/foursome-feed` — one neutral Open Spot from secondary

The script does **not** use raw SQL, does **not** set `passwordHash` directly, and does **not** set `isEmailVerified=true`.

---

## Email verification

Left exactly as normal EMAIL registration creates it (`isEmailVerified=false`).  
Email/password login does **not** require verification. No verification bypass.

---

## Terms

Registration records current Terms (`CURRENT_TERMS_VERSION`, e.g. `2026-08-31`).  
The script verifies `termsVersion === currentTermsVersion` via `GET /auth/me`.

---

## Profile completion

Neutral profiles:

| | Primary | Secondary |
|---|---|---|
| Display name | Google Reviewer | Demo Golfer |
| Age | 35 | 35 |
| Location | Austin, TX (city-level public coords) | Same city, slight offset |
| GHIN verified | `false` | `false` |
| Handicap | Self-reported optional value only | Same |

**Profile photo:** Not required for Connect discovery. Script does **not** invent uploads or photo rows. Upload one photo in the normal app flow if you want a fuller Connect card (completion can reach ~84% without photos; photos add up to +16%).

---

## Premium override

Both accounts receive admin Premium override:

- `premiumOverride = true`
- `premiumOverrideExpiresAt = null` (no expiry during review)
- `premiumOverrideReason = "Google Play review access"`

Effective Premium comes only from `isEffectivePremium()` (store **or** valid admin override).  
No fake Play receipts, tokens, or `membershipType` simulation.

Expected Premium benefits:

1. Unlimited Connect likes  
2. Full Feed access  
3. Post open spots  
4. Contact Feed posters  
5. Premium badge  

---

## Match / chat / Feed

- Mutual Connect (LIKE both directions) creates a real `Match`
- One conversation with message: `Hello! This is a demo conversation for app review.`
- One Feed post from `demo_golfer` at Lions Municipal Golf Course (Austin), notes: `Looking for golfers to join an upcoming round.`

---

## Environment variables

| Variable | Purpose |
|---|---|
| `CONFIRM_GOOGLE_PLAY_REVIEWER_SETUP` | Must be `YES` or prepare script exits |
| `GOOGLE_PLAY_REVIEWER_EMAIL` | Default `reviewer@connectghin.com` |
| `GOOGLE_PLAY_REVIEWER_PASSWORD` | Runtime only — never commit |
| `GOOGLE_PLAY_REVIEWER2_EMAIL` | Default `reviewer2@connectghin.com` |
| `GOOGLE_PLAY_REVIEWER2_PASSWORD` | Runtime only — never commit |
| `ADMIN_API_EMAIL` | Admin for Premium override |
| `ADMIN_API_PASSWORD` | Admin password |
| `API_BASE_URL` | Default `https://api.connectghin.com/api/v1` |

Auth-only test: `CONFIRM_GOOGLE_PLAY_REVIEWER_AUTH_TEST=YES`  
Cleanup (after review only): `CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP=YES` plus exact email confirmation list.

---

## Commands (do not run until approved)

From `connectghin-server/backend`:

```bash
# Prepare accounts (PRODUCTION — only when explicitly approved)
CONFIRM_GOOGLE_PLAY_REVIEWER_SETUP=YES ^
GOOGLE_PLAY_REVIEWER_EMAIL=reviewer@connectghin.com ^
GOOGLE_PLAY_REVIEWER_PASSWORD=<set-at-runtime> ^
GOOGLE_PLAY_REVIEWER2_EMAIL=reviewer2@connectghin.com ^
GOOGLE_PLAY_REVIEWER2_PASSWORD=<set-at-runtime> ^
ADMIN_API_EMAIL=<admin> ^
ADMIN_API_PASSWORD=<admin-password> ^
npm run prepare:google-play-reviewers
```

```bash
# Auth verification only
CONFIRM_GOOGLE_PLAY_REVIEWER_AUTH_TEST=YES ^
GOOGLE_PLAY_REVIEWER_PASSWORD=<set-at-runtime> ^
GOOGLE_PLAY_REVIEWER2_PASSWORD=<set-at-runtime> ^
npm run verify:google-play-reviewers-auth
```

```bash
# Cleanup — ONLY after Google Play review is completely finished
CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP=YES ^
CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP_EMAILS=reviewer@connectghin.com,reviewer2@connectghin.com ^
ADMIN_API_EMAIL=<admin> ^
ADMIN_API_PASSWORD=<admin-password> ^
npm run cleanup:google-play-reviewers
```

On PowerShell, set env vars with `$env:NAME="value"` before `npm run …`.

---

## Recommended Play Console review path

1. Sign in with primary (`reviewer@connectghin.com`)  
2. Home  
3. Connect → open **Demo Golfer** profile  
4. Matches  
5. Chat (demo conversation)  
6. The Feed (see open spot from Demo Golfer)  
7. Premium functionality (unlimited likes, full Feed, post/contact, badge)  
8. Settings  
9. Terms  
10. Privacy  
11. Delete Account **information** only  

**DO NOT DELETE THE REVIEWER ACCOUNT DURING REVIEW.**

---

## Manual steps still required

1. Set strong unique passwords in a secure secret store (not Git).  
2. Run prepare script against production only after explicit approval.  
3. Manually verify clean-install login on a physical Android device/emulator with the production AAB.  
4. Optionally upload a profile photo for each reviewer via the normal app UI.  
5. Paste credentials into Play Console’s app access / demo account section (Console UI only — never into source).  
6. Do **not** run cleanup until review is finished.

---

## Related report

See `docs/google_play_reviewer_account_report.md` for readiness checklist status.
