import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the module with different env var combinations.
// Each test re-imports the module fresh by resetting the module registry.

describe('lib/supabase/client', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Clear env vars
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('getSupabaseClient returns null when URL is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'some-key';
    // URL not set

    const { getSupabaseClient } = await import('@/lib/supabase/client');
    expect(getSupabaseClient()).toBeNull();
  });

  it('getSupabaseClient returns null when KEY is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    // KEY not set

    const { getSupabaseClient } = await import('@/lib/supabase/client');
    expect(getSupabaseClient()).toBeNull();
  });

  it('getSupabaseClient returns null when URL is placeholder YOUR_SUPABASE_URL', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'YOUR_SUPABASE_URL';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'some-key';

    const { getSupabaseClient } = await import('@/lib/supabase/client');
    expect(getSupabaseClient()).toBeNull();
  });

  it('getSupabaseClient returns null when both URL and KEY are missing', async () => {
    // Neither set
    const { getSupabaseClient } = await import('@/lib/supabase/client');
    expect(getSupabaseClient()).toBeNull();
  });

  it('isCloudMode returns false when client is null (no URL)', async () => {
    // Neither env var set
    const { isCloudMode } = await import('@/lib/supabase/client');
    expect(isCloudMode()).toBe(false);
  });

  it('isCloudMode returns false when client is null (no KEY)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';

    const { isCloudMode } = await import('@/lib/supabase/client');
    expect(isCloudMode()).toBe(false);
  });

  it('isCloudMode returns false when URL is placeholder', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'YOUR_SUPABASE_URL';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'some-key';

    const { isCloudMode } = await import('@/lib/supabase/client');
    expect(isCloudMode()).toBe(false);
  });

  it('getSupabaseClient returns null when URL is empty string', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'some-key';

    const { getSupabaseClient } = await import('@/lib/supabase/client');
    expect(getSupabaseClient()).toBeNull();
  });

  it('getSupabaseClient returns null when KEY is empty string', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';

    const { getSupabaseClient } = await import('@/lib/supabase/client');
    expect(getSupabaseClient()).toBeNull();
  });
});
