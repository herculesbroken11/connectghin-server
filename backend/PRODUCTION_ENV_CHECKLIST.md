# Production `.env` checklist

Use this when updating `backend/.env` on the server (then restart the API process).

## Google Sign-In (mobile) â€” required

| Variable | Value |
|----------|--------|
| `GOOGLE_OAUTH_CLIENT_ID` | Web client ID (`â€¦5mkjtqts7c4kpbp9bt9l4kt2tfcfcovrâ€¦`) â€” same as Flutter `GOOGLE_SERVER_CLIENT_ID` |
| `GOOGLE_ANDROID_CLIENT_ID` | Play Android client ID (`â€¦d29aauu0cg7thdpgjvcoh1njqvikva03â€¦`) |

Your production file already has both. **Google login on the Play Store build is not fixed by `.env` alone.**

### Play Store builds (critical)

If Google Sign-In works on a sideloaded APK but fails after installing from Play:

1. Open **Play Console â†’ App integrity â†’ App signing**
2. Copy **App signing key certificate â†’ SHA-1** (different from your upload keystore)
3. Add that SHA-1 in **Firebase â†’ project `connectghin-prod` â†’ Project settings â†’ Android app `com.connectghin.app`**
4. Keep the **upload key** SHA-1 registered too (for local release APKs)
5. Wait a few minutes, then update the app from Play and retry Google Sign-In
6. Production API `.env` must use the **same** Web client ID as the app (`GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_SERVER_CLIENT_ID`)

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
- Do not store production `.env` on `E:\` root or in chat â€” it contains JWT secrets, DB password, and Firebase private keys.
- Rotate secrets if this file was shared or committed anywhere public.
