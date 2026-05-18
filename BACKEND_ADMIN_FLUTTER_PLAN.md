# ConnectGHIN implementation blueprint

## 1) Full backend architecture summary

- Stack: NestJS + TypeScript + Prisma + PostgreSQL + Redis (optional cache/session) + Stripe + websocket-ready gateway layer.
- API style: versioned REST under `/api/v1`, strict DTO validation, centralized error format, role-based guards, request-scoped auth context.
- Layers per module:
  - `controller`: transport and response shaping
  - `service`: business logic and policy enforcement
  - `repository`: Prisma data access and query composition
  - `dto`: input contracts and validation
  - `policies/guards`: authz, suspended user block, premium checks, block checks
- Cross-cutting:
  - `AuthGuard` + `AdminGuard` + `SuspendedUserGuard`
  - `AuditLogService` for all admin mutations
  - `AppSettingsService` to resolve feature flags at runtime
  - background queue hooks for notifications and async tasks

## 2) Full Prisma schema

- See `backend/prisma/schema.prisma`.
- Includes all requested entities, enums, relations, indexes, unique constraints, refresh token versioning, soft-delete lifecycle fields, swipe/match uniqueness, verification lifecycle, and app settings.

## 3) Recommended folder structure

```txt
backend/
  src/
    main.ts
    app.module.ts
    common/
      filters/
      interceptors/
      guards/
      decorators/
      dto/
      utils/
    config/
    prisma/
      prisma.module.ts
      prisma.service.ts
    auth/
    users/
    profiles/
    discovery/
    swipes/
    matches/
    conversations/
    notifications/
    ghin-verification/
    subscriptions/
    privacy-safety/
    settings/
    admin/
      auth/
      dashboard/
      users/
      ghin/
      reports/
      subscriptions/
      app-settings/
      audit-logs/
```

```txt
admin/
  src/
    app/
      (auth)/login/page.tsx
      (protected)/dashboard/page.tsx
      (protected)/users/page.tsx
      (protected)/users/[id]/page.tsx
      (protected)/ghin/page.tsx
      (protected)/ghin/[id]/page.tsx
      (protected)/reports/page.tsx
      (protected)/reports/[id]/page.tsx
      (protected)/subscriptions/page.tsx
      (protected)/app-settings/page.tsx
      (protected)/audit-logs/page.tsx
    components/
    lib/
      api/
      auth/
      types/
      guards/
```

```txt
connectghin_flutter/
  lib/
    app/
      routes/
      theme/
      constants/
    core/
      api/
      network/
      storage/
      utils/
    features/
      auth/
      onboarding/
      home/
      discover/
      ghinder/
      matches/
      messages/
      notifications/
      subscription/
      verification/
      settings/
      privacy_safety/
      profile/
```

## 4) API module map

- Auth: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`, `/auth/me`
- Users/Profiles: `/users/me`, `/profiles/:userId`, `/profiles/me`, `/profiles/me/photos*`
- Discovery: `/discovery/candidates`
- Swipes/Matches: `/swipes`, `/matches`, `/matches/:id`
- Conversations: `/conversations`, `/conversations/start`, `/conversations/:id/messages`, `/conversations/:id/read`
- Notifications: `/notifications*`, `/devices/register-token`
- GHIN: `/ghin-verification/me`, `/ghin-verification/request`, `/ghin-verification/appeal`
- Subscriptions: `/subscriptions/me`, `/subscriptions/checkout-session`, `/subscriptions/customer-portal`, `/subscriptions/cancel`, `/subscriptions/webhook`
- Safety/Privacy: `/privacy-settings/me`, `/reports`, `/blocks`, `/account/delete-request`
- Admin: `/admin/*` endpoints listed in your requirements

## 5) Backend module implementation plan

### Phase 1 (foundation)
- Prisma migration baseline from `schema.prisma`
- Auth module (JWT access+refresh, rotation via token version)
- Users + Profiles + photo management + profile completion service
- common response/error format and guards

### Phase 2 (core social)
- Discovery filtering with privacy, block, and swipe exclusions
- Swipes with duplicate prevention + reciprocal match creation
- Matches list/detail/unmatch

### Phase 3 (messaging)
- Conversations, messages, read states, unread counts
- Permission enforcement (free requires match; premium DM via app setting)
- Notification generation for new message/new match

### Phase 4 (trust and safety)
- GHIN verification request/review lifecycle
- Privacy settings + block/unblock + reports
- Account deletion request workflow

### Phase 5 (billing)
- Stripe checkout + portal + cancel endpoint
- Webhook source-of-truth sync for membership state
- Payment events persistence and failure handling

### Phase 6 (admin)
- Admin auth + protected pages
- Dashboard stats
- User moderation
- GHIN queue moderation
- Reports moderation
- Subscriptions oversight
- App settings editor + audit logs

## 6) Admin panel pages and data requirements

- Login: admin session issuance.
- Dashboard: aggregate cards + trends (users, premium, verified, pending GHIN, open reports, match/message counts).
- Users:
  - table with filters (membership, lifecycle, verification)
  - detail with profile/photos/privacy/subscription snapshots
  - actions (suspend/restore/delete-request handling)
- GHIN:
  - pending queue + detail view
  - approve/reject/appeal review with note capture
- Reports:
  - open/reviewed/resolved filter
  - moderation action form writes audit logs
- Subscriptions:
  - status filters and stripe sync metadata
- App settings:
  - free swipe limit, premium DM toggle, trial days, support contact, maintenance flags
- Audit logs:
  - actor, action type, target user, metadata, timestamp

## 7) First production-ready code files to initialize backend project

- `backend/prisma/schema.prisma` (created)
- Next backend bootstrap files to add next:
  - `backend/src/main.ts`
  - `backend/src/app.module.ts`
  - `backend/src/config/env.validation.ts`
  - `backend/src/prisma/prisma.service.ts`
  - `backend/src/common/filters/http-exception.filter.ts`
  - `backend/src/common/guards/jwt-auth.guard.ts`
  - `backend/src/auth/*` initial register/login/refresh/logout/me

## 8) Continue module by module

- Use your phase order as implementation order.
- Each module ships with:
  - DTOs + validation
  - repository
  - service with business rules
  - controller endpoints
  - module tests (service + e2e smoke)
  - admin hooks where relevant
