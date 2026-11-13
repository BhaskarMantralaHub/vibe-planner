-- Follow-up to security-audit-fixes-migration.sql (S6).
-- The app stores receipts as same-site proxy paths (/storage/<bucket>/...),
-- which the https-only check rejected, so new and edited split receipts were dropped.
-- Allow those paths too; javascript:, data:, http: and protocol-relative URLs stay blocked.

CREATE OR REPLACE FUNCTION public.all_https_urls(urls TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(bool_and(
    u ~* '^https://'
    OR (u ~ '^/storage/[a-z0-9-]+/' AND u !~ '\.\.')
  ), true)
  FROM unnest(urls) AS u;
$$;

-- Verify (should return t, t, f, f, f)
SELECT public.all_https_urls(ARRAY['https://x.supabase.co/a.jpg']),
       public.all_https_urls(ARRAY['/storage/split-receipts/team/a.jpg']),
       public.all_https_urls(ARRAY['javascript:alert(1)']),
       public.all_https_urls(ARRAY['//evil.example/storage/x/a.jpg']),
       public.all_https_urls(ARRAY['/storage/split-receipts/../x']);
