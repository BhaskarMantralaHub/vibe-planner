# Supabase Setup Guide

## Step 1 — Create a Supabase Account (Free)

1. Go to [supabase.com](https://supabase.com) and click "Start your project"
2. Sign up with your GitHub account (easiest)
3. Create a new project:
   - Name: `vibers-toolkit`
   - Database password: choose something strong (save it somewhere)
   - Region: pick the closest to you
4. Wait ~2 minutes for the project to spin up

## Step 2 — Create the Database Table

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Paste this SQL and click **Run**:

```sql
-- Create the vibes table
CREATE TABLE vibes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'spark',
  category TEXT,
  time_spent INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  due_date DATE,
  position INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (each user only sees their own data)
ALTER TABLE vibes ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own vibes
CREATE POLICY "Users can read own vibes"
  ON vibes FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can insert their own vibes
CREATE POLICY "Users can insert own vibes"
  ON vibes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can update their own vibes
CREATE POLICY "Users can update own vibes"
  ON vibes FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: users can delete their own vibes
CREATE POLICY "Users can delete own vibes"
  ON vibes FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_vibes_user_id ON vibes(user_id);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vibes_updated_at
  BEFORE UPDATE ON vibes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### Column Reference

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Auto-generated primary key |
| `user_id` | UUID | References auth.users, RLS enforced |
| `text` | TEXT | Vibe description (required) |
| `status` | TEXT | `spark`, `in_progress`, `scheduled`, `done` |
| `category` | TEXT | `Work`, `Personal`, `Creative`, `Learning`, `Health`, or null |
| `time_spent` | INTEGER | Minutes tracked |
| `notes` | TEXT | URLs, justifications, comments |
| `due_date` | DATE | When the vibe is due |
| `position` | INTEGER | Sort order within a column |
| `completed_at` | TIMESTAMPTZ | When status changed to done |
| `deleted_at` | TIMESTAMPTZ | Soft delete timestamp (null = active) |
| `created_at` | TIMESTAMPTZ | When the vibe was created |
| `updated_at` | TIMESTAMPTZ | Auto-updated on every change |

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
NEXT_PUBLIC_MAX_USERS=10
```

### Cloudflare Pages

Add these environment variables in **Settings → Environment variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXT_PUBLIC_MAX_USERS` | `10` |

Also set:
- **Build command**: `npm run build`
- **Output directory**: `out`

## Step 5 — Deploy

Push to GitHub `main` branch. Cloudflare Pages auto-deploys.

## Security

- The `anon` key is safe to expose in frontend code
- Row Level Security (RLS) ensures each user can only access their own data
- Signup is limited to `MAX_USERS` accounts
- Soft delete via `deleted_at` — data is recoverable
- `updated_at` auto-managed by database trigger
