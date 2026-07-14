# Production `.env` checklist

Use this when updating `backend/.env` on the server (then restart the API process).

## Google Sign-In (mobile) — required

| Variable | Value |
|----------|--------|
| `GOOGLE_OAUTH_CLIENT_ID` | Web client ID (`…hnngdr8u7dp29j2a9om9b7q3er5kuki6…`) — same as Flutter `GOOGLE_SERVER_CLIENT_ID` |
| `GOOGLE_ANDROID_CLIENT_ID` | Android client ID (`…1s7n7s6bhnhaovollf3k3c14vf2ntpg9…`) |

Your production file already has both. **Google login on the Play Store build is not fixed by `.env` alone.**

### Play Store builds (critical)

If Google Sign-In works on a sideloaded APK but fails after installing from Play:

1. Open **Play Console → App integrity → App signing**
2. Copy **App signing key certificate → SHA-1** (different from your upload keystore)
3. Add that SHA-1 in **Firebase → Project settings → Android app `com.connectghin.app`**
4. Keep the **upload key** SHA-1 registered too (for local release APKs)
5. Wait a few minutes, then update the app from Play and retry Google Sign-In

## Recommended additions

| Variable | Production value | Why |
|----------|------------------|-----|
| `API_PUBLIC_BASE_URL` | `https://api.connectghin.com` | Profile photos and upload URLs returned to the app |
| `APPLE_OAUTH_AUDIENCE` | Your iOS bundle ID (when Apple Sign-In ships) | Without it, `POST /auth/apple` returns 503 |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | Resend: see `SMTP_SETUP.md` | Required for forgot-password emails |
| `APP_WEB_URL` | `https://admin.connectghin.com` | Reset links go to `/reset-password?token=...` |

### Resend SMTP quick values

```env
SMTP_HOST="smtp.resend.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="resend"
SMTP_PASS="re_xxxxxxxx"
MAIL_FROM="ConnectGHIN <onboarding@resend.dev>"
```

Use a verified domain for `MAIL_FROM` in production (e.g. `noreply@connectghin.com`).


## Security

- Never commit `backend/.env` (it is gitignored).
- Do not store production `.env` on `E:\` root or in chat — it contains JWT secrets, DB password, and Firebase private keys.
- Rotate secrets if this file was shared or committed anywhere public.
