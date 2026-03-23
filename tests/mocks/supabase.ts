import { vi } from 'vitest';

/* ── Chainable query builder mock ── */
function createQueryBuilder(resolveData: unknown = null, resolveError: unknown = null) {
  const builder: Record<string, unknown> = {};
  const chainMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
    'in', 'is', 'order', 'limit', 'range', 'single', 'maybeSingle',
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal: .then() for async resolution
  builder.then = vi.fn((resolve: (val: unknown) => void) => {
    resolve({ data: resolveData, error: resolveError });
    return builder;
  });

  return builder;
}

/* ── Storage mock ── */
function createStorageMock() {
  return {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test/photo.jpg' }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/photo.jpg' } }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
}

/* ── Auth mock ── */
function createAuthMock() {
  return {
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com', user_metadata: { full_name: 'Test User' } }, session: { access_token: 'token' } },
      error: null,
    }),
    signUp: vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
}

/* ── Main mock client ── */
export function createMockSupabaseClient() {
  const client = {
    from: vi.fn().mockReturnValue(createQueryBuilder()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: createStorageMock(),
    auth: createAuthMock(),
  };
  return client;
}

/* ── Configure .from() to return specific data per table ── */
export function mockTableData(client: ReturnType<typeof createMockSupabaseClient>, table: string, data: unknown, error: unknown = null) {
  const builder = createQueryBuilder(data, error);
  const originalFrom = client.from;
  client.from = vi.fn().mockImplementation((t: string) => {
    if (t === table) return builder;
    return originalFrom(t);
  });
  return builder;
}

/* ── Mock the module ── */
export function setupSupabaseMock(client?: ReturnType<typeof createMockSupabaseClient>) {
  const mockClient = client ?? createMockSupabaseClient();

  vi.mock('@/lib/supabase/client', () => ({
    getSupabaseClient: () => mockClient,
    isCloudMode: () => true,
  }));

  return mockClient;
}
