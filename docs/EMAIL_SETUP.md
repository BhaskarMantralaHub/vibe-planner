# Email (Resend + Supabase SMTP)

Transactional emails (signup confirmation, password reset) are sent via **Resend** as the custom SMTP provider for Supabase Auth.

## Setup
1. **Resend account** — resend.com (free tier: 3,000 emails/month, no credit card)
2. **Domain verified** — `viberstoolkit.com` with SPF/DKIM/DMARC DNS records (auto-configured via Cloudflare)
3. **Supabase SMTP config** — Dashboard → Authentication → Email (SMTP Settings):
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: Resend API key (`re_...`)
   - Sender: `noreply@viberstoolkit.com`
   - Sender name: `Viber's Toolkit`

## How It Works
- Supabase Auth composes emails using templates in `docs/email-templates/`
- Resend delivers them via SMTP — it's a transport layer only
- Resend **never sees passwords** — only the rendered HTML with reset/confirm links
- Emails from `noreply@viberstoolkit.com` (not `noreply@mail.supabase.io`)

## Troubleshooting
- **Rate limit**: Supabase has 60-second minimum interval per user
- **Spam folder**: New domains start with low reputation — ask users to mark as "Not spam" and add `noreply@viberstoolkit.com` to contacts
- **Delivery status**: Check Resend dashboard → Emails tab for sent/delivered/bounced
- **Cache-busting**: If changing email templates, Supabase caches them — wait a few minutes or restart project

## Email Templates

Branded email templates are in `docs/email-templates/`:
- `reset-password.html` — Password reset (uses `{{ .RedirectTo }}` + `{{ .TokenHash }}` for cross-browser support)
- `confirm-signup.html` — Signup confirmation
- `password-changed.html` — Password change notification (for future custom SMTP)

Configure in Supabase Dashboard > Authentication > Email Templates.
