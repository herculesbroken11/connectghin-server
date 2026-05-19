# ConnectGHIN Backend (NestJS + Prisma)

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies: `npm install`
3. Generate Prisma client: `npm run prisma:generate`
4. Run migrations: `npm run prisma:migrate` (applies schema changes such as optional `PaymentEvent.userId` for webhook idempotency)
5. Seed demo data + app settings: `npm run prisma:seed`  
   - Primary demo login: `john@demo.connectghin.com` / `Password123!`  
   - Same password for `sarah`, `michael`, `emma`, `david` @ `demo.connectghin.com`  
   - Seeds mutual John↔Sarah match, conversation, and sample messages.
6. Start dev server: `npm run start:dev`

### `.env` quick start

Typical local values in `backend/.env`:

- `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/connectghin?schema=public"`
- `JWT_ACCESS_SECRET="<generate with: openssl rand -base64 48>"`
- `JWT_REFRESH_SECRET="<generate with: openssl rand -base64 48>"`
- `APP_PUBLIC_URL="http://localhost:5173"`
- `APP_WEB_URL="http://localhost:5173"`

For Flutter clients, make sure backend CORS allows your app origin as needed via `CORS_ORIGIN` (or leave unset for local open CORS).

## API Base

- `http://localhost:3000/api/v1`

## CORS (Flutter / web clients)

- Default: allow all origins (`origin: true`).
- Optional: set `CORS_ORIGIN` to a comma-separated list, e.g. `http://localhost:5173,http://127.0.0.1:8080`.

## Stripe webhooks (production)

- Endpoint: `POST /api/v1/subscriptions/webhook` (raw body; signature header `stripe-signature`)
- Configure `STRIPE_WEBHOOK_SECRET` from the Stripe Dashboard (or CLI secret when using `stripe listen`)
- Local testing: `stripe listen --forward-to localhost:3000/api/v1/subscriptions/webhook`
- Checkout and portal require `STRIPE_PRICE_ID` and `APP_PUBLIC_URL` in `.env`

## Email (password reset)

- Configure `SMTP_*` and `MAIL_FROM` so `POST /auth/forgot-password` sends a link: `{APP_WEB_URL}/reset-password?token=...`
- If SMTP is not set, set `EMAIL_DEV_EXPOSE_RESET_TOKEN=true` **only in local dev** to receive the token in the JSON response (never enable in production).

## Push notifications (FCM)

- Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full JSON of a Firebase service account key (as a single-line string).
- iOS/Android device tokens registered via `POST /devices/register-token` receive pushes when in-app notifications are created (e.g. new chat message).

## Realtime chat (Socket.IO)

- Namespace: `/chat` (same HTTP server, default Socket.IO path).
- Connect with access token: `auth: { token: '<JWT access>' }` or query `?token=...`
- Client emits `join` with `{ conversationId }` to enter room `conv:<conversationId>`.
- Server emits `message` on new messages (same payload as REST create).
- Client emits `typing` with `{ conversationId, isTyping?: boolean }`; others receive `typing`.

## E2E tests

- Requires `DATABASE_URL` and applied migrations.
- Run: `npm run test:e2e`

## Modules Included

- Auth
- Users
- Profiles
- Discovery
- Swipes
- Matches
- Conversations
- Notifications
- GHIN verification
- Subscriptions
- Privacy/Safety
- Settings
- Admin
- Mail (global)
- Push (FCM)
- Chat (WebSocket gateway)
