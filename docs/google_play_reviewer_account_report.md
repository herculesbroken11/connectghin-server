# Google Play Reviewer Account Report

Status date: scripts/docs prepared; **production accounts not created yet**.

Primary: `reviewer@connectghin.com`  
Secondary: `reviewer2@connectghin.com`  

Passwords: **not stored in this document**.

---

## Schema Findings

### User (relevant)

- Auth: `email`, `passwordHash` (argon2), `username`, `authProvider`
- Premium: `membershipType`, `membershipStatus`, `premiumOverride`, `premiumOverrideExpiresAt`, `premiumOverrideReason`, `premiumOverrideUpdatedAt`, `premiumOverrideByAdminId`
- Lifecycle: `lifecycleStatus` (`ACTIVE`/`SUSPENDED`/`DELETED`), `isActive`, `isSuspended`, `deletedAt`
- Terms: `termsVersion`, `termsAcceptedAt`
- Email flag: `isEmailVerified` (default false; **not** required for email/password login)

### Profile

- Identity/location: `displayName`, `bio`, `age`, `city`, `state`, `country`, `locationLat`, `locationLng` (`addressLine1` optional; unused for reviewers)
- Golf: `handicap`, `homeCourse`, `lookingFor`, `skillLevel`, `playFrequency`, prefs
- Completion: `profileCompletionPercent` (recomputed on profile update)
- GHIN: `isGHINVerified` (remains false)

### Social

- `Swipe` → reciprocal LIKE → `Match` upsert  
- `Conversation` / `Message` after Match  
- `FoursomeFeedPost` requires effective Premium  

### Password hashing

argon2 via `AuthService.register` / `login`.

---

## Creation Method

**Chosen:** production `POST /auth/register` + authenticated profile/swipe/conversation/feed APIs + admin Premium override API.

**Rejected for this flow:** raw SQL; direct Prisma `User`/`passwordHash` inserts; fake Play Billing.

Script: `backend/scripts/prepare-google-play-reviewers.ts`  
Guard: `CONFIRM_GOOGLE_PLAY_REVIEWER_SETUP=YES`

---

## Primary Reviewer

**PENDING** — script not executed against production.

Intended:

- Email `reviewer@connectghin.com` / username `google_reviewer`
- Display name `Google Reviewer`
- ACTIVE, not suspended, not deleted
- Terms accepted at registration
- Profile complete enough for Connect (photo optional manual step)
- Premium via admin override (no expiry)

## Secondary Reviewer

**PENDING** — script not executed against production.

Intended:

- Email `reviewer2@connectghin.com` / username `demo_golfer`
- Display name `Demo Golfer`
- Same location cluster (Austin, TX city-level)
- Premium via admin override (required so Feed post can be created from this account)

## Authentication

**PENDING** — not run.

Intended checks (no token/password logging):

- Primary login: PASS  
- Secondary login: PASS  
- Wrong-password → HTTP 401: PASS  

Utility: `npm run verify:google-play-reviewers-auth`

## Profile Completion

**PENDING**

Without photos, expected completion ≈ **84%** (photos add up to +16%).  
Photo **not** required for discovery. Manual app upload recommended.

## Terms Acceptance

**PENDING**

Expected: `termsVersion === CURRENT_TERMS_VERSION` after register.

## Premium Override

**PENDING**

Mechanism: `User.premiumOverride=true`, `premiumOverrideExpiresAt=null`, reason `"Google Play review access"` via `AdminService.setPremiumOverride` / `PATCH /admin/users/:id/premium-override`.  
Effective access via `isEffectivePremium()`.

## Connect Discovery

**PENDING**

Both accounts share Austin, TX city-level coordinates (~0.1 mile apart). No reviewer-only discovery exceptions.

## Match

**PENDING**

Intended: mutual `POST /swipes` LIKE → Match upsert. No manual Match insert.

## Chat

**PENDING**

Intended: `POST /conversations/start` + one demo message.

## Feed

**PENDING**

Intended: one OPEN post from secondary; visible to primary under normal Premium Feed rules.

---

## Google Play Review Readiness

**NOT READY**

Do **not** mark Google Play review ready until all of the following are true after a production run:

- [ ] Primary login works against production  
- [ ] Exact reviewer credentials manually tested on device  
- [ ] Reviewer can enter the app  
- [ ] Profile is complete enough for the reviewer path  
- [ ] Connect accessible; Demo Golfer discoverable / matched  
- [ ] Feed accessible with Premium  
- [ ] Matches/chat accessible  
- [ ] Premium badge / unlimited likes confirmed  

---

## Manual Steps Still Required

1. Approve production execution of `prepare:google-play-reviewers`  
2. Supply runtime passwords + admin API credentials (never commit)  
3. Run prepare script; confirm summary lines  
4. Clean-install production AAB; sign in as primary  
5. Walk the Play review path (see setup doc)  
6. Optionally add profile photos in-app  
7. Enter credentials in Play Console app access  
8. **Do not delete reviewer accounts during review**  
9. Run cleanup script only after review is completely finished  

---

## Safety guards (implemented in scripts)

- Explicit confirmation env vars required  
- Exact email allow-list for prepare/cleanup  
- Identity check (`email` + `username`) before reuse  
- Refuse overwrite on password/identity mismatch  
- Idempotent likes / demo message / feed notes matching  
- No password/token printing  
