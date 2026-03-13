# Supabase Setup Guide

## Step 1 — Create a Supabase Account (Free)

1. Go to [supabase.com](https://supabase.com) and click "Start your project"
2. Sign up with your GitHub account (easiest)
3. Create a new project:
   - Name: `vibers-toolkit`
   - Database password: choose something strong (save it somewhere)
   - Region: pick the closest to you
4. Wait ~2 minutes for the project to spin up

## Step 2 — Create the Database

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Copy-paste the entire contents of [DATABASE_SCHEMA.sql](./DATABASE_SCHEMA.sql) and click **Run**

This creates all tables, policies, functions, and triggers in one go.

## Step 3 — Get Your API Keys

1. Go to **Settings** → **API** in the sidebar
2. Copy these two values:
   - **Project URL** (looks like `https://xyzcompany.supabase.co`)
   - **anon / public key** (a long string)

## Step 4 — Configure Environment

### Local development

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_SUPER_ADMIN_EMAIL=your_admin_email
```

### Cloudflare Pages

Add these environment variables in **Settings → Environment variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` | Super admin's email address |

Build settings:
- **Build command**: `npm run build`
- **Output directory**: `out`

## Step 5 — Set Yourself as Admin

After signing up on the app, run this in Supabase SQL Editor:

```sql
UPDATE profiles SET is_admin = true WHERE email = 'your-email@example.com';
```

## Step 6 — Deploy

Push to GitHub `main` branch. Cloudflare Pages auto-deploys.

## Database Reference

See [DATABASE_SCHEMA.sql](./DATABASE_SCHEMA.sql) for the complete schema with detailed comments explaining every table, column, policy, function, and trigger.

### Tables

| Table | Purpose |
|-------|---------|
| `vibes` | Core tasks/ideas with status, categories, due dates, notes, soft delete |
| `profiles` | User info (auto-created on signup via trigger) with admin/disabled flags |
| `app_settings` | Dynamic config (max_users limit, editable from admin dashboard) |

### Key Functions

| Function | Purpose |
|----------|---------|
| `is_admin()` | Checks if current user is admin (used in RLS policies) |
| `get_user_count()` | Returns total user count (used in signup limit check) |
| `handle_new_user()` | Trigger function — auto-creates profile on signup |
| `update_updated_at()` | Trigger function — auto-updates timestamp on vibe changes |

## Security

- **Row Level Security (RLS)** on all tables — each user sees only their own data
- **Admin policies** allow admins to see all data (for the dashboard)
- **Soft delete** via `deleted_at` column — data is recoverable
- **Disabled users** blocked at login (checked on every session load)
- **Max users** enforced via `app_settings` + `get_user_count()` on signup
- The **anon key** is safe to expose — RLS prevents unauthorized access
