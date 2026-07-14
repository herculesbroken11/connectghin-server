# ConnectGHIN — SMTP setup (Resend)

Use **Resend** for password-reset / magic-link emails. It works with the existing Nodemailer code.

## Why Resend

- Free tier: ~3,000 emails/month (enough for forgot-password)
- Simple SMTP that matches our backend env vars
- Better deliverability than personal Gmail SMTP

Alternatives if you prefer: SendGrid, Postmark, Amazon SES (same env var names).

## Steps

1. Sign up: https://resend.com
2. **API Keys** → Create API Key → copy `re_...`
3. (Production) **Domains** → Add `connectghin.com` (or your domain) → add the DNS records Resend shows → wait until Verified
4. Put values into `backend/.env` (local) **and** production server `.env`:

```env
SMTP_HOST="smtp.resend.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="resend"
SMTP_PASS="re_YOUR_API_KEY_HERE"
MAIL_FROM="ConnectGHIN <onboarding@resend.dev>"
APP_WEB_URL="https://admin.connectghin.com"
```

5. After your domain is verified, change `MAIL_FROM` to something like:

```env
MAIL_FROM="ConnectGHIN <noreply@connectghin.com>"
```

6. Restart the API process (`pm2 restart ...` or equivalent).
7. Deploy/restart **admin** so `/reset-password` is live.
8. Test: open the app → Forgot Password → check inbox (and spam).

## Notes

- `SMTP_USER` must be the literal word `resend` (not your email).
- `SMTP_PASS` is the Resend API key.
- Reset link format: `https://admin.connectghin.com/reset-password?token=...`
- Google Sign-In users can still use Continue with Google; forgot password only sets an optional email password.
