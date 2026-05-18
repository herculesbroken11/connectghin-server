# ConnectGHIN Admin (Next.js)

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env`
3. Make sure backend is running at `NEXT_PUBLIC_API_BASE_URL`
4. Start admin app:
   - `npm run dev`

## Login

- Endpoint used: `POST /api/v1/admin/auth/login`
- The app stores `accessToken` and `refreshToken` in local storage.
- Protected screens call backend admin endpoints with `Authorization: Bearer <token>`.

## Routes

- `/login`
- `/dashboard`
- `/users`, `/users/[id]`
- `/ghin`, `/ghin/[id]`
- `/reports`, `/reports/[id]`
- `/subscriptions`
- `/app-settings`
- `/audit-logs`

## Environment

- `NEXT_PUBLIC_API_BASE_URL` defaults to `http://localhost:3000/api/v1` in `src/lib/api.ts`
