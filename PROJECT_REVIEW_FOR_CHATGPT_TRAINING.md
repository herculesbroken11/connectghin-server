# ConnectGHIN / Golf App Project Review

## 1. Executive Summary

This project is a mobile app, backend API, and admin dashboard for a golf-focused social matching application named ConnectGHIN in the seed data and UI copy.

The product appears to help golfers create profiles, verify golf identity/handicap details through GHIN, discover other golfers, swipe to match, chat with matches, manage subscriptions, receive notifications, report/block unsafe users, and rate other players after rounds.

The repository currently contains three main applications:

- `backend`: A NestJS API server using Prisma and PostgreSQL.
- `admin`: A Next.js admin panel for staff moderation, verification, reporting, subscriptions, audit logs, users, and settings.
- `connectghin_flutter`: A Flutter mobile client for golfers.

There is also a separate `Golf mobile app design` folder, which appears to be a Vite/React design prototype. The actual mobile app source is `connectghin_flutter`, not the design prototype.

## 2. What I Reviewed

I reviewed the source code structure, package configuration, backend modules, Prisma database schema, main API controllers/services, admin dashboard routes, Flutter mobile client, and seed data.

Important areas reviewed:

- Backend application startup and module wiring.
- Authentication and authorization.
- User profiles and profile photos.
- Discovery and swipe matching.
- Matches, conversations, and real-time chat.
- GHIN verification flow.
- Player rating/review flow.
- Subscriptions and in-app purchase integration.
- Notifications and Firebase push support.
- Privacy and safety features.
- Admin dashboard pages and API client.
- Flutter mobile app routing, session storage, API wrappers, chat socket client, onboarding, membership, settings, and feature screens.
- Prisma schema and demo seed data.

Generated folders such as `node_modules`, `.next`, and `dist` were not treated as source code.

## 3. Technology Stack

### Backend

- Framework: NestJS 10.
- Language: TypeScript.
- Database ORM: Prisma 5.
- Database: PostgreSQL.
- Authentication: JWT access/refresh tokens.
- Password hashing: Argon2.
- OAuth login: Google and Apple.
- Real-time messaging: Socket.IO through NestJS WebSocket Gateway.
- Push notifications: Firebase Admin / FCM.
- Email: Nodemailer SMTP.
- File upload: Multer for profile photos.
- Validation: `class-validator`, NestJS global `ValidationPipe`.

### Admin Frontend

- Framework: Next.js 15.
- UI library: React 18.
- Styling: Tailwind CSS.
- Icons: Lucide React.
- State: Local React state/context.
- API access: Browser `fetch` wrapper in `admin/src/lib/api.ts`.

### Mobile Client

- Framework: Flutter.
- Language: Dart.
- Navigation: `go_router`.
- State/session: `provider` and `shared_preferences`.
- API access: `http` through a shared `ApiClient`.
- Realtime chat: `socket_io_client`.
- Local config: `flutter_dotenv` and `--dart-define`.
- Image upload: `image_picker` plus multipart upload.
- Location: `geolocator`.
- In-app purchases: `in_app_purchase`.
- OAuth sign-in: `google_sign_in` and `sign_in_with_apple`.

## 4. High-Level Architecture

The project uses a mobile-client, backend-API, and admin-dashboard architecture.

The backend exposes REST endpoints under:

```text
/api/v1
```

The admin frontend talks to the backend using:

```text
NEXT_PUBLIC_API_BASE_URL
```

If no environment variable is set, the admin frontend defaults to:

```text
http://localhost:3000/api/v1
```

The Flutter app talks to the same backend using `API_BASE_URL`. Its documented local defaults are:

```text
Android emulator: http://10.0.2.2:3000/api/v1
iOS simulator / desktop: http://localhost:3000/api/v1
Physical device: http://<LAN-IP>:3000/api/v1
```

The Flutter app derives the Socket.IO chat URL from the API origin and connects to:

```text
/chat
```

The database schema is managed with Prisma migrations under:

```text
backend/prisma/migrations
```

Demo data is created through:

```text
backend/prisma/seed.ts
```

The backend module layout is domain-oriented:

- `auth`: registration, login, OAuth, refresh, logout, forgot password, magic link.
- `users`: current user account data.
- `profiles`: user profile and profile photos.
- `discovery`: candidate list for browsing golfers.
- `swipes`: like/pass logic and match creation.
- `matches`: active matches and match details.
- `conversations`: message threads and REST message APIs.
- `chat`: Socket.IO real-time chat events.
- `notifications`: in-app notifications and device tokens.
- `ghin-verification`: user GHIN verification requests and appeals.
- `subscriptions`: Apple/Google subscription and entitlement sync.
- `privacy-safety`: privacy settings, reports, blocks, account deletion requests.
- `player-ratings`: post-round golfer reviews.
- `admin`: admin-only operational APIs.
- `settings`: user notification settings.
- `uploads`: serving uploaded profile photos.

The mobile app structure is feature-oriented:

- `app/router`: route graph and app paths.
- `app/session`: token/session persistence.
- `app/config`: API and socket URL configuration.
- `core/network`: shared HTTP client and API error handling.
- `features/auth`: login, register, Google/Apple sign-in, password recovery, magic link.
- `features/onboarding`: profile setup and photo onboarding.
- `features/home`: main landing/home screen.
- `features/discover`: profile browsing.
- `features/ghinder`: swipe-style golf matching experience.
- `features/swipes`: swipe API and daily quota model.
- `features/matches`: matched golfers.
- `features/messages`: conversation list, chat thread, real-time socket connections.
- `features/profile`: own profile, edit profile, and public profile view.
- `features/verification`: GHIN verification request/appeal UI.
- `features/membership` and `features/subscriptions`: premium membership and store purchase flows.
- `features/player_ratings`: submit and view player ratings.
- `features/settings`: account, privacy, blocked users, photos, help, delete account.
- `features/location`: device location permission and profile location update.
- `features/notifications`: in-app notification list and device token registration wrapper.

## 5. Product Purpose

This project is for building a trusted golf partner discovery app.

The intended user experience is:

1. A golfer creates an account with email/password, Google, or Apple.
2. The golfer completes a profile with display name, bio, location, handicap, home course, skill/preferences, and photos.
3. The golfer can request GHIN verification to prove golf identity or handicap status.
4. The golfer browses discovery candidates and can filter by handicap or GHIN verification.
5. The golfer swipes `LIKE` or `PASS` on other profiles.
6. A mutual `LIKE` creates a match.
7. Matched users can start conversations and chat in real time.
8. Premium subscriptions unlock higher-value behavior such as unlimited swipes or premium direct messaging depending on app settings.
9. Users can receive push/in-app notifications for matches, messages, GHIN results, and subscription events.
10. Users can report, block, and request account deletion.
11. Admin staff can moderate users, reports, GHIN verification, subscriptions, player reviews, settings, and audit logs.

## 6. Mobile App Review

The production mobile client is the Flutter app in `connectghin_flutter`.

It is not just a mockup. It connects to the backend API and implements the main golfer-facing product flows.

Key mobile app behavior:

- Starts in `lib/main.dart`, loads `AuthSession`, creates the `GoRouter`, and wraps the app in providers.
- Uses `SharedPreferences` to persist access token, refresh token, current user id, and last sign-in method.
- Uses a shared `ApiClient` that automatically retries authenticated requests after a refresh-token call when it receives `401`.
- Uses `go_router` for guest routes, onboarding routes, protected `/app` routes, and full-screen detail routes.
- Uses a bottom navigation shell with five main tabs: Home, Discover, GHINder, Matches, and Profile.
- Uses `API_BASE_URL` to connect to the backend and derives the `/chat` Socket.IO URL from the same origin.
- Supports email/password login, registration, Google sign-in, Apple sign-in, password reset, and magic link login.
- Supports onboarding screens for basic profile, golf details, preferences, and photos.
- Supports profile editing, public profile viewing, photo upload, photo ordering, and primary photo selection.
- Supports discovery candidate browsing and GHINder-style swiping.
- Supports match list and message inbox.
- Supports real-time chat thread updates through Socket.IO `message`, `inbox`, and `messagesRead` events.
- Supports GHIN verification request and appeal screens.
- Supports premium membership UI and Apple/Google in-app purchase verification through backend subscription endpoints.
- Supports player rating submission and player rating history.
- Supports privacy settings, blocked users, reports, account deletion request, password change, username change, and help/support screens.
- Supports location permission and saving device coordinates to the profile.

The separate `Golf mobile app design` folder is better understood as a visual/design prototype. The Flutter app is the actual mobile client that should be included in project context.

## 7. Main User Workflows

### Account Creation and Login

The backend supports:

- Email/password registration.
- Email/password login.
- Google ID token login.
- Apple ID token login.
- JWT refresh tokens.
- Logout by incrementing a refresh-token version.
- Forgot password.
- Password reset.
- Magic link request and consume.
- Change password.

Passwords are hashed using Argon2. JWT access tokens expire after 15 minutes and refresh tokens after 30 days.

### Profile Management

Users can manage:

- Display name.
- Bio.
- Age.
- Address/city/state/country.
- Latitude/longitude.
- Handicap.
- Home course.
- Looking-for preference.
- Drinking/smoking/music preferences.
- Gender, skill level, play frequency.
- Profile completion percentage.
- Profile photos, including upload, delete, reorder, and primary photo selection.

### Discovery

The discovery service returns golfer profiles for the current viewer.

It excludes:

- The current user.
- Blocked users in either direction.
- Already-swiped users, unless the query allows them.
- Suspended, inactive, or deleted users.
- Users who opted out of discovery.

It supports:

- Pagination.
- Handicap min/max filtering.
- Verified-only filtering.
- Distance calculation using latitude/longitude.

### Swiping and Matching

Users can `LIKE` or `PASS` another user.

Free users have a daily swipe limit in code. Premium users are treated as unlimited.

If two users both `LIKE` each other, the backend creates or reactivates a match and sends in-app/push notifications to both users.

### Matches

Users can list active matches, see peer profile details, see chat preview data, see unread message counts, and unmatch from another user.

### Conversations and Chat

The app supports both REST message APIs and real-time Socket.IO events.

Conversations are allowed when:

- Users are matched, or
- Premium direct messaging is enabled by app setting and the sender is premium.

The chat gateway supports:

- JWT-authenticated WebSocket connection.
- Joining a conversation room.
- Leaving a conversation room.
- Typing events.
- New message broadcasts.
- Inbox update events.
- Read receipt events.

### GHIN Verification

Users can submit a GHIN verification request with:

- GHIN number.
- Optional first name.
- Optional last name.

The current flow is manual. Requests stay pending until an admin approves or rejects them.

The code contains notes for future official GHIN API integration, but auto-verification is not enabled.

### Player Ratings

Users can review other golfers after a round.

Ratings include:

- Round date.
- Course.
- Overall rating.
- Handicap accuracy.
- Sportsmanship.
- Pace of play.
- Would-play-again flag.
- Comment.

New reviews start as `PENDING`. Admins can approve, flag, hide, remove, adjust, or add notes to reviews.

### Privacy and Safety

Users can:

- Update privacy settings.
- Report another user.
- Block another user.
- List blocked users.
- Unblock users.
- Request account deletion.

Blocking affects discovery and conversation creation.

### Subscriptions

The subscription system supports:

- Apple App Store provider.
- Google Play provider.
- Monthly and yearly billing cycles.
- Trialing, active, past-due, canceled, incomplete, unpaid states.
- Payment event records.
- User membership synchronization to `FREE` or `PREMIUM`.
- App Store / Google notification endpoints.

The code includes verification services for Apple/Google purchase validation and server notifications.

## 8. Admin Dashboard

The admin app is a Next.js dashboard for operational control of the platform.

Admin navigation includes:

- Dashboard.
- Users.
- GHIN Verification.
- Reports.
- Player Ratings.
- Subscriptions.
- App Settings.
- Audit Logs.

### Admin Authentication

Admins log in through:

```text
/login
```

The frontend stores access and refresh tokens in `localStorage`.

Admin backend routes are protected by:

- `JwtAuthGuard`.
- `AdminGuard`.

The admin guard allows users with role:

- `ADMIN`
- `SUPER_ADMIN`

### Admin Capabilities

Admins can:

- View dashboard statistics and activity.
- Search across admin data.
- View and manage users.
- Suspend users.
- Restore users.
- Archive/delete users.
- Review GHIN requests.
- Approve GHIN requests.
- Reject GHIN requests with a reason.
- View report queues.
- Review/resolve/dismiss reports.
- View player rating summaries.
- Moderate player rating reviews.
- Adjust player rating review data.
- Save internal player rating notes.
- View subscriptions and subscription summaries.
- View audit log summaries and detailed audit logs.
- Update app settings.

Admin actions create audit log entries for traceability.

## 9. Database Model Summary

The Prisma schema models the app as a social platform with moderation and billing.

Important models:

- `User`: account identity, login provider, role, membership, lifecycle status.
- `Profile`: public golfer profile, handicap, location, preferences, GHIN status.
- `ProfilePhoto`: profile image records.
- `GHINVerificationRequest`: manual verification workflow.
- `Swipe`: user like/pass actions.
- `Match`: mutual-like relationship.
- `Conversation`: message thread.
- `ConversationParticipant`: users in a conversation.
- `Message`: chat messages.
- `Subscription`: premium subscription state.
- `PaymentEvent`: billing event/audit history.
- `Notification`: in-app notifications.
- `DeviceToken`: push notification tokens.
- `Report`: user safety reports.
- `PlayerRatingReview`: golfer review and moderation state.
- `Block`: user block relationships.
- `PrivacySettings`: discovery and visibility preferences.
- `UserSettings`: push/email/marketing preferences.
- `AdminAuditLog`: administrative action history.
- `AppSettings`: configurable app/admin settings.
- `AccountDeletionRequest`: user account deletion requests.
- `ForgotPasswordToken`: password reset and magic link tokens.

Important enums:

- `UserRole`: `USER`, `ADMIN`, `SUPER_ADMIN`.
- `MembershipType`: `FREE`, `PREMIUM`.
- `MembershipStatus`: `NONE`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED`.
- `VerificationStatus`: `NOT_STARTED`, `PENDING`, `VERIFIED`, `REJECTED`, `APPEAL`.
- `SwipeAction`: `LIKE`, `PASS`.
- `SubscriptionProvider`: `APPLE_APP_STORE`, `GOOGLE_PLAY`.
- `ReportStatus`: `OPEN`, `REVIEWED`, `RESOLVED`, `DISMISSED`.
- `PlayerRatingStatus`: `PENDING`, `APPROVED`, `FLAGGED`, `REMOVED`.

## 10. API Surface Summary

All backend REST routes use:

```text
/api/v1
```

Major route groups:

- `/auth`: registration, login, OAuth, token refresh, logout, password reset, magic link, current user.
- `/users`: username availability and current user updates.
- `/profiles`: current profile, public profile, profile photo management.
- `/uploads`: profile photo file serving.
- `/discovery`: candidate profiles.
- `/swipes`: daily swipe status and swipe actions.
- `/matches`: match list, detail, unmatch.
- `/conversations`: conversation list, messages, start conversation, send message, mark read.
- `/notifications`: notification list and read actions.
- `/devices/register-token`: device token registration/removal.
- `/ghin-verification`: user verification state, request, appeal.
- `/player-ratings`: create/list/detail player ratings.
- `/subscriptions`: current subscription, entitlement sync, Apple/Google verify, cancel.
- `/subscriptions/notifications`: Apple/Google server notification webhooks.
- `/privacy-settings`: privacy settings.
- `/reports`: report user.
- `/blocks`: block management.
- `/account/delete-request`: account deletion request.
- `/settings`: user notification settings.
- `/admin`: admin-only operations.

## 11. Configuration and Environment Variables

Important environment variables inferred from the code:

- `DATABASE_URL`: PostgreSQL connection string.
- `PORT`: backend port, defaults to `3000`.
- `CORS_ORIGIN`: comma-separated allowed origins.
- `JWT_ACCESS_SECRET`: JWT access token signing secret.
- `JWT_REFRESH_SECRET`: JWT refresh token signing secret.
- `GOOGLE_OAUTH_CLIENT_ID`: Google OAuth audience.
- `APPLE_OAUTH_AUDIENCE`: Apple login audience.
- `APPLE_IAP_BUNDLE_ID`: Apple bundle ID, also used as fallback audience.
- `APP_WEB_URL`: web frontend URL for password reset.
- `APP_MOBILE_URL`: mobile deep link base URL for magic login.
- `APP_PUBLIC_URL`: public app URL fallback.
- `EMAIL_DEV_EXPOSE_RESET_TOKEN`: exposes reset/magic token in API response when email cannot send; should only be used in development.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`: email SMTP settings.
- `MAIL_FROM`: sender email.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service account credentials.
- `NEXT_PUBLIC_API_BASE_URL`: admin frontend API base URL.
- `API_BASE_URL`: Flutter mobile API base URL, via `.env` or `--dart-define`.

## 12. Demo Data

The seed script creates demo users under:

```text
demo.connectghin.com
```

Primary demo user:

```text
john@demo.connectghin.com / Password123!
```

Admin demo user:

```text
admin@demo.connectghin.com / Password123!
```

The seed data includes:

- Sample golfer profiles.
- A John/Sarah match.
- A sample conversation.
- GHIN verification requests.
- Subscriptions.
- Reports.
- Player rating reviews.
- App settings.
- Admin audit log entries.

## 13. What Is Already Good

- The backend is organized by clear feature modules.
- Prisma schema is comprehensive and matches the intended product.
- Authentication includes access and refresh token separation.
- Passwords use Argon2 rather than plain hashing.
- Admin APIs are protected server-side by role guard.
- Suspended/deleted users are blocked from protected user workflows.
- Discovery considers blocks, privacy settings, suspension, and swiped users.
- Real-time chat validates conversation membership before joining rooms.
- The Flutter app implements the real user-facing client flows and is wired to the backend contracts.
- The Flutter API client has token refresh retry behavior, which improves mobile session continuity.
- Admin actions are logged in audit logs.
- The admin panel covers the major operational needs of a social marketplace app.
- The seed data is useful for demos and UI testing.

## 14. Risks, Gaps, and Recommended Fixes

### High Priority

1. The endpoint `/subscriptions/entitlements/sync` appears to accept subscription status data from an authenticated user and then updates membership. If this route is callable by clients without store receipt verification, a user may be able to grant themselves premium access. Prefer requiring Apple/Google receipt validation or making this an internal/admin-only path.

2. Admin access tokens are stored in `localStorage`. This is common for prototypes, but it increases exposure if any XSS occurs. For production, consider httpOnly secure cookies or a stronger token storage/refresh strategy.

3. There is no obvious rate limiting on login, password reset, magic link, swipe, report, or message endpoints. Production APIs should add throttling to reduce abuse.

4. `EMAIL_DEV_EXPOSE_RESET_TOKEN` can return reset or magic login tokens through API responses when email is not sent. This must be disabled outside development.

### Medium Priority

1. The code constant for free daily swipes is `10`, while seed app settings include `free_swipe_daily_limit` as `25`. This can confuse admin operators because the setting may not actually control the runtime swipe limit.

2. GHIN verification is currently manual. The code has comments for future official GHIN integration, but actual automated verification is not enabled.

3. Some privacy/safety methods are simple and may need stricter validation, such as preventing self-report/self-block and enforcing reason length or category policies.

4. Generated folders such as `dist`, `.next`, and `node_modules` exist in the workspace. They should generally not be committed to source control.

5. Admin frontend route protection is client-side redirect based on token presence. Backend APIs are protected, but frontend UX can still briefly render protected layout before redirect.

6. The Flutter README says `.env` is supported, and `ApiConfig` reads `flutter_dotenv`, but `main.dart` does not visibly call `dotenv.load()`. Unless this is loaded elsewhere or by platform setup, `.env` may not actually be read and `--dart-define` or the hardcoded fallback will be used.

### Lower Priority

1. There is limited visible automated test coverage from the reviewed files. Backend e2e tooling exists, but critical flows should have focused tests.

2. Some public API return types are `unknown`, which makes client contracts less clear.

3. Mobile push token registration exists as an API wrapper, but I did not see full Firebase Messaging client setup in the reviewed Flutter files. Push may require additional mobile-side integration.

## 15. Recommended Next Steps

1. Secure subscription entitlement sync before production.
2. Add rate limiting and abuse controls.
3. Decide whether admin auth should move away from `localStorage`.
4. Connect GHIN official verification or document the manual process clearly.
5. Make app settings actually drive runtime feature limits where intended.
6. Add tests for authentication, subscription verification, swiping/matching, conversations, Flutter client API flows, and admin moderation.
7. Remove generated folders from source control if they are currently tracked.
8. Fix or confirm Flutter `.env` loading with `dotenv.load()` during app startup.
9. Add a project README with setup instructions, environment variables, and local run steps.

## 16. Training Context Version

The following summary can be pasted into ChatGPT or another AI tool as project context.

```text
This repository is for ConnectGHIN, a golf-focused social matching app. It contains a Flutter mobile client, a NestJS backend, and a Next.js admin dashboard. The backend uses PostgreSQL through Prisma and exposes REST APIs under /api/v1. It supports user registration/login, Google/Apple OAuth, JWT access/refresh tokens, profiles, profile photos, discovery, swipes, matches, conversations, Socket.IO real-time chat, notifications, Firebase push, GHIN verification requests, subscriptions through Apple App Store and Google Play, privacy settings, reports, blocks, account deletion requests, player ratings, app settings, and admin audit logs.

The Flutter app lives in connectghin_flutter. It is the actual mobile client, while Golf mobile app design appears to be a Vite/React visual prototype. The Flutter app uses go_router, provider, shared_preferences, http, socket_io_client, image_picker, geolocator, in_app_purchase, google_sign_in, and sign_in_with_apple. Its main tabs are Home, Discover, GHINder, Matches, and Profile. It implements auth, onboarding, profile editing/photos, discovery/swipes, matches, chat, GHIN verification, membership/IAP, notifications, privacy/safety, player ratings, and account settings.

The admin dashboard is a Next.js/Tailwind app for platform staff. It supports login, dashboard stats, users, GHIN verification queue, reports, player rating moderation, subscriptions, app settings, and audit logs. Admin routes call backend /admin APIs and require JWT plus ADMIN or SUPER_ADMIN role server-side.

The database schema includes User, Profile, ProfilePhoto, GHINVerificationRequest, Swipe, Match, Conversation, ConversationParticipant, Message, Subscription, PaymentEvent, Notification, DeviceToken, Report, PlayerRatingReview, Block, PrivacySettings, UserSettings, AdminAuditLog, AppSettings, AccountDeletionRequest, and ForgotPasswordToken.

The core product flow is: a golfer signs up, completes a profile, optionally requests GHIN verification, discovers other golfers, swipes like/pass, forms a match when likes are mutual, chats with matches, receives notifications, can subscribe to premium, can report/block users, and can rate other players after rounds. Admin staff moderate users, verification requests, reports, player ratings, subscriptions, settings, and audit logs.

Important risks to keep in mind: subscription entitlement sync should not trust client-provided premium status without store verification, admin tokens are stored in localStorage, there is no obvious API rate limiting, dev reset/magic tokens must not be exposed in production, the free swipe limit exists both as a code constant and as an app setting with different values, and Flutter .env support should be verified because ApiConfig reads flutter_dotenv but main.dart does not visibly call dotenv.load().
```

