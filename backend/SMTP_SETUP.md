# ConnectGHIN — email setup (Resend)

Use **Resend** for password-reset / magic-link emails.

## Important (production VPS)

Many hosts **block outbound SMTP** (ports 465/587). If
`nc -vz smtp.resend.com 587` times out, do **not** use SMTP.

This backend defaults to Resend’s **HTTPS API** (`https://api.resend.com`)
when `SMTP_PASS` / `RESEND_API_KEY` starts with `re_`. That uses port **443**.

## Steps

1. Sign up: https://resend.com
2. **API Keys** → Create → copy `re_...`
3. **Domains** → add `connectghin.com` → verify DNS → wait until Verified
4. Production `backend/.env`:

```env
# Preferred on blocked-SMTP hosts (default when key is re_...)
MAIL_TRANSPORT="resend"
RESEND_API_KEY="re_YOUR_API_KEY_HERE"
# Or reuse the key as SMTP_PASS (also works for the HTTP API):
SMTP_PASS="re_YOUR_API_KEY_HERE"
MAIL_FROM="ConnectGHIN <noreply@connectghin.com>"
APP_WEB_URL="https://admin.connectghin.com"
```

Optional SMTP vars are ignored when using the HTTP API, but you can keep them for docs:

```env
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
```

5. Deploy backend code + `pm2 restart connectghin-backend`
6. Test Forgot Password → check inbox / Resend **Logs**

## Force SMTP (only if ports are open)

```env
MAIL_TRANSPORT="smtp"
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASS="re_YOUR_API_KEY_HERE"
MAIL_FROM="ConnectGHIN <noreply@connectghin.com>"
```

## Notes

- Reset link: `https://admin.connectghin.com/reset-password?token=...`
- Google users can use Forgot Password to **set** an email password; Google Sign-In still works.
- If sends fail, check Resend Logs and `pm2 logs connectghin-backend`.
