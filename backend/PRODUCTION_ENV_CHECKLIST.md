# Production `.env` checklist

Use this when updating `backend/.env` on the server (then restart the API process).

## Google Sign-In (mobile) — required

| Variable | Value |
|----------|--------|
| `GOOGLE_OAUTH_CLIENT_ID` | Web client ID (`…hnngdr8u7dp29j2a9om9b7q3er5kuki6…`) — same as Flutter `GOOGLE_SERVER_CLIENT_ID` |
| `GOOGLE_ANDROID_CLIENT_ID` | Android client ID (`…1s7n7s6bhnhaovollf3k3c14vf2ntpg9…`) |

Your production file already has both. **Google login on the phone is not fixed by `.env`** if Firebase SHA-1 is wrong — fix SHA-1 in Firebase, rebuild APK.

## Recommended additions

| Variable | Production value | Why |
|----------|------------------|-----|
| `API_PUBLIC_BASE_URL` | `https://api.connectghin.com` | Profile photos and upload URLs returned to the app |
| `APPLE_OAUTH_AUDIENCE` | Your iOS bundle ID (when Apple Sign-In ships) | Without it, `POST /auth/apple` returns 503 |

## Optional / later

- **SMTP_*** — password reset emails (currently not sent; `SMTP_HOST` is empty).
- **MAIL_FROM** — change from `noreply@example.com` when SMTP is configured.
- **APPLE_IAP_*** / **GOOGLE_PLAY_*** — in-app subscription verification.
- **ADMIN_BRAND_NAME** — admin UI branding fallback.

## Security

- Never commit `backend/.env` (it is gitignored).
- Do not store production `.env` on `E:\` root or in chat — it contains JWT secrets, DB password, and Firebase private keys.
- Rotate secrets if this file was shared or committed anywhere public.
