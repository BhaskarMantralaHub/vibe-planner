# Supabase Setup Guide

## Step 1 — Create a Supabase Account (Free)

1. Go to [supabase.com](https://supabase.com) and click "Start your project"
2. Sign up with your GitHub account (easiest)
3. Create a new project:
   - Name: `vibe-planner`
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
  scheduled_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
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
```

## Step 2b — Migration: Add Notes Column

If you already have the `vibes` table, run this to add the `notes` column:

```sql
-- Add notes column for URLs, justifications, and comments per vibe
ALTER TABLE vibes ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
```

## Step 2c — Migration: Remove Deferred Status

If you have vibes with the old "deferred" status, migrate them to "spark":

```sql
-- Migrate old "deferred" vibes to "spark" (Future status was removed)
UPDATE vibes SET status = 'spark' WHERE status = 'deferred';
```

## Step 3 — Get Your API Keys

1. Go to **Settings** → **API** in the sidebar
2. Copy these two values:
   - **Project URL** (looks like `https://xyzcompany.supabase.co`)
   - **anon / public key** (a long string starting with `eyJ...`)

## Step 4 — Add Keys to Your App

Open `vibe-planner/index.html` and replace these two lines near the top:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

With your actual values.

## Step 5 — Configure Auth (Optional)

By default, Supabase requires email confirmation. To disable for easier testing:

1. Go to **Authentication** → **Providers** → **Email**
2. Toggle OFF "Confirm email"

## Step 6 — Deploy

Push to GitHub, Cloudflare auto-deploys. Done!

## Security Note

The `anon` key is safe to expose in frontend code. Row Level Security (RLS) ensures each user can only access their own data. The key only allows operations that pass the RLS policies.
