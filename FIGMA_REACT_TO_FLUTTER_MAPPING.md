# Figma React to Flutter mapping

This mapping is extracted from the current React route file and aligned to backend APIs.

| React route | Flutter route constant | Primary backend endpoint(s) |
|---|---|---|
| `/` | `AppRoutes.welcome` | N/A |
| `/login` | `AppRoutes.login` | `POST /api/v1/auth/login` |
| `/register` | `AppRoutes.register` | `POST /api/v1/auth/register` |
| `/forgot-password` | `AppRoutes.forgotPassword` | `POST /api/v1/auth/forgot-password` |
| `/reset-password` | `AppRoutes.resetPassword` | `POST /api/v1/auth/reset-password` |
| `/onboarding/basic` | `AppRoutes.onboardingBasic` | `PATCH /api/v1/users/me`, `PATCH /api/v1/profiles/me` |
| `/onboarding/golf` | `AppRoutes.onboardingGolf` | `PATCH /api/v1/profiles/me` |
| `/onboarding/preferences` | `AppRoutes.onboardingPreferences` | `PATCH /api/v1/profiles/me` |
| `/onboarding/photos` | `AppRoutes.onboardingPhotos` | `POST/DELETE/PATCH /api/v1/profiles/me/photos*` |
| `/app/home` | `AppRoutes.home` | `GET /api/v1/users/me`, `GET /api/v1/subscriptions/me`, `GET /api/v1/notifications` |
| `/app/discover` | `AppRoutes.discover` | `GET /api/v1/discovery/candidates` |
| `/app/ghinder` | `AppRoutes.ghinder` | `GET /api/v1/discovery/candidates`, `POST /api/v1/swipes` |
| `/app/matches` | `AppRoutes.matches` | `GET /api/v1/matches` |
| `/app/messages` | `AppRoutes.messages` | `GET /api/v1/conversations` |
| `/app/messages/:id` | `AppRoutes.chatThread` | `GET /api/v1/conversations/:id/messages`, `POST /api/v1/conversations/:id/messages` |
| `/app/profile` | `AppRoutes.profile` | `GET /api/v1/users/me`, `GET /api/v1/profiles/:userId` |
| `/app/profile/edit` | `AppRoutes.editProfile` | `PATCH /api/v1/profiles/me` |
| `/app/profile/:id` | `AppRoutes.viewProfile` | `GET /api/v1/profiles/:userId` |
| `/app/membership` | `AppRoutes.membership` | `GET /api/v1/subscriptions/me` |
| `/checkout` | `AppRoutes.checkout` | `POST /api/v1/subscriptions/checkout-session` |
| `/payment-success` | `AppRoutes.paymentSuccess` | `GET /api/v1/subscriptions/me` |
| `/payment-failed` | `AppRoutes.paymentFailed` | `GET /api/v1/subscriptions/me` |
| `/app/notifications` | `AppRoutes.notifications` | `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:id/read` |
| `/app/verification` | `AppRoutes.ghinVerification` | `GET /api/v1/ghin-verification/me`, `POST /api/v1/ghin-verification/request` |
| `/app/settings` | `AppRoutes.settings` | `GET/PATCH /api/v1/users/me`, `GET/PATCH /api/v1/privacy-settings/me` |
| `/app/privacy-settings` | `AppRoutes.privacySettings` | `GET/PATCH /api/v1/privacy-settings/me` |
| `/app/blocked-users` | `AppRoutes.blockedUsers` | `GET /api/v1/blocks`, `DELETE /api/v1/blocks/:blockedUserId` |
| `/app/report-user` | `AppRoutes.reportUser` | `POST /api/v1/reports` |
| `/app/block-user` | `AppRoutes.blockUser` | `POST /api/v1/blocks` |
| `/app/change-password` | `AppRoutes.changePassword` | `POST /api/v1/auth/change-password` |
| `/app/delete-account` | `AppRoutes.deleteAccount` | `POST /api/v1/account/delete-request` |
| `/app/location-permission` | `AppRoutes.locationPermission` | `GET /api/v1/discovery/candidates` fallback modes |
| `/app/notification-permission` | `AppRoutes.notificationPermission` | `POST /api/v1/devices/register-token` |
| `/app/no-connection` | `AppRoutes.noConnection` | N/A |
| `/app/error` | `AppRoutes.error` | N/A |
| `/app/account-suspended` | `AppRoutes.accountSuspended` | `GET /api/v1/auth/me` (lifecycle handling) |
| `/app/subscription-expired` | `AppRoutes.subscriptionExpired` | `GET /api/v1/subscriptions/me` |
