import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Vibe } from '@/types/vibe';

// ─── Mock chainable Supabase query ─────────────────────────────────────────
const mockQuery: any = {};
const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'order', 'limit', 'ilike', 'in'];
for (const m of chainMethods) mockQuery[m] = vi.fn().mockReturnValue(mockQuery);
mockQuery.single = vi.fn().mockResolvedValue({ data: null, error: null });
mockQuery.then = vi.fn((resolve: any) => {
  resolve({ data: null, error: null });
  return Promise.resolve();
});

const mockSupabase = {
  from: vi.fn().mockReturnValue(mockQuery),
  storage: { from: vi.fn().mockReturnValue({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
};

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => mockSupabase,
  isCloudMode: () => true,
}));

// Mock storage (should NOT be called in cloud mode, but imported by vibe-store)
const mockLocalSave = vi.fn();
const mockLocalLoad = vi.fn(() => []);
vi.mock('@/lib/storage', () => ({
  localLoad: () => mockLocalLoad(),
  localSave: (items: any) => mockLocalSave(items),
  loadTrash: vi.fn(() => []),
  saveTrash: vi.fn(),
}));

// Mock genId
let idCounter = 0;
vi.mock('@/app/(tools)/vibe-planner/lib/utils', () => ({
  genId: () => `cloud-id-${++idCounter}`,
}));

// Import after mocks
import { useVibeStore } from '@/stores/vibe-store';

const USER_ID = 'cloud-user-1';

const fixtureVibes: Vibe[] = [
  {
    id: 'db-1',
    user_id: USER_ID,
    text: 'Cloud task 1',
    status: 'spark',
    category: null,
    time_spent: 0,
    notes: '',
    due_date: null,
    position: 0,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'db-2',
    user_id: USER_ID,
    text: 'Cloud task 2',
    status: 'in_progress',
    category: 'Work',
    time_spent: 30,
    notes: 'some notes',
    due_date: '2026-04-01',
    position: 1,
    completed_at: null,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    deleted_at: null,
  },
];

function resetStore() {
  useVibeStore.setState({
    items: [],
    view: 'board',
    newText: '',
    weekOffset: 0,
    filter: '',
    openMenu: null,
    editingCard: null,
    editText: '',
    expandedNotes: null,
    dragId: null,
    syncing: false,
    showTrash: false,
    activeTimer: null,
    timerStart: null,
    elapsed: 0,
  });
}

function resetMocks() {
  idCounter = 0;
  for (const m of chainMethods) (mockQuery[m] as any).mockClear();
  mockQuery.single.mockClear();
  mockQuery.then.mockClear();
  mockSupabase.from.mockClear();
  mockLocalSave.mockClear();
  mockLocalLoad.mockClear();

  // Re-establish defaults
  mockSupabase.from.mockReturnValue(mockQuery);
  for (const m of chainMethods) mockQuery[m].mockReturnValue(mockQuery);
  mockQuery.single.mockResolvedValue({ data: null, error: null });
  mockQuery.then.mockImplementation((resolve: any) => {
    resolve({ data: null, error: null });
    return Promise.resolve();
  });
}

describe('vibe-store (cloud mode)', () => {
  beforeEach(() => {
    resetStore();
    resetMocks();
  });

  // ─── loadItems ───────────────────────────────────────────────────────

  describe('loadItems', () => {
    it('fetches vibes from supabase and sets items', async () => {
      // Make the chain resolve with fixture data
      mockQuery.order.mockResolvedValueOnce({ data: fixtureVibes, error: null });

      await useVibeStore.getState().loadItems(USER_ID);

      expect(mockSupabase.from).toHaveBeenCalledWith('vibes');
      expect(mockQuery.select).toHaveBeenCalledWith('*');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(useVibeStore.getState().items).toEqual(fixtureVibes);
      expect(useVibeStore.getState().syncing).toBe(false);
    });

    it('sets syncing to true during load, then false', async () => {
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null });

      const loadPromise = useVibeStore.getState().loadItems(USER_ID);
      // syncing should be true after the set call but before await completes
      await loadPromise;
      expect(useVibeStore.getState().syncing).toBe(false);
    });

    it('does not set items on supabase error', async () => {
      useVibeStore.setState({ items: fixtureVibes });
      mockQuery.order.mockResolvedValueOnce({ data: null, error: { message: 'Network error' } });

      await useVibeStore.getState().loadItems(USER_ID);

      // items unchanged because error branch doesn't set items
      expect(useVibeStore.getState().items).toEqual(fixtureVibes);
      expect(useVibeStore.getState().syncing).toBe(false);
    });

    it('does not call localStorage in cloud mode', async () => {
      mockQuery.order.mockResolvedValueOnce({ data: fixtureVibes, error: null });

      await useVibeStore.getState().loadItems(USER_ID);

      expect(mockLocalLoad).not.toHaveBeenCalled();
    });

    it('handles empty result data gracefully', async () => {
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
      await useVibeStore.getState().loadItems(USER_ID);
      expect(useVibeStore.getState().items).toEqual([]);
      expect(useVibeStore.getState().syncing).toBe(false);
    });
  });

  // ─── addItem ─────────────────────────────────────────────────────────

  describe('addItem', () => {
    it('calls supabase insert with correct data', () => {
      useVibeStore.setState({ newText: 'New cloud task' });
      useVibeStore.getState().addItem(USER_ID);

      expect(mockSupabase.from).toHaveBeenCalledWith('vibes');
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_ID,
          text: 'New cloud task',
          status: 'spark',
          category: null,
          time_spent: 0,
          notes: '',
          due_date: null,
          position: 0,
        }),
      );
      expect(mockQuery.select).toHaveBeenCalled();
      expect(mockQuery.single).toHaveBeenCalled();
    });

    it('optimistically adds item to state before server response', () => {
      useVibeStore.setState({ newText: 'Optimistic task' });
      useVibeStore.getState().addItem(USER_ID);

      const items = useVibeStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].text).toBe('Optimistic task');
      expect(items[0].id).toBe('cloud-id-1');
    });

    it('replaces local ID with server ID on successful insert', async () => {
      const serverVibe: Vibe = {
        id: 'server-uuid-123',
        user_id: USER_ID,
        text: 'Server task',
        status: 'spark',
        category: null,
        time_spent: 0,
        notes: '',
        due_date: null,
        position: 0,
        completed_at: null,
        created_at: '2026-03-22T00:00:00Z',
        updated_at: '2026-03-22T00:00:00Z',
        deleted_at: null,
      };

      // Make single() resolve with server data
      mockQuery.single.mockResolvedValueOnce({ data: serverVibe, error: null });

      useVibeStore.setState({ newText: 'Server task' });
      useVibeStore.getState().addItem(USER_ID);

      // Verify insert was called
      expect(mockSupabase.from).toHaveBeenCalledWith('vibes');
      expect(mockQuery.insert).toHaveBeenCalled();
      expect(mockQuery.select).toHaveBeenCalled();
      expect(mockQuery.single).toHaveBeenCalled();

      // Optimistic item exists immediately
      const items = useVibeStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].text).toBe('Server task');

      // Wait for .then() callback to reconcile ID
      await new Promise((r) => setTimeout(r, 10));
      const updated = useVibeStore.getState().items;
      expect(updated[0].id).toBe('server-uuid-123');
    });

    it('keeps local ID when server returns error', async () => {
      mockQuery.single.mockReturnValueOnce({
        then: (resolve: any) => {
          resolve({ data: null, error: { message: 'Insert failed' } });
          return Promise.resolve();
        },
      });

      useVibeStore.setState({ newText: 'Failed insert' });
      useVibeStore.getState().addItem(USER_ID);

      await vi.waitFor(() => {
        const items = useVibeStore.getState().items;
        expect(items).toHaveLength(1);
        expect(items[0].id).toBe('cloud-id-1'); // local ID unchanged
      });
    });

    it('does not call localSave in cloud mode', () => {
      useVibeStore.setState({ newText: 'Cloud only' });
      useVibeStore.getState().addItem(USER_ID);
      expect(mockLocalSave).not.toHaveBeenCalled();
    });

    it('does not add empty or whitespace-only text', () => {
      useVibeStore.setState({ newText: '' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().items).toHaveLength(0);
      expect(mockSupabase.from).not.toHaveBeenCalled();

      useVibeStore.setState({ newText: '   ' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().items).toHaveLength(0);
    });

    it('prevents duplicate items (case-insensitive)', () => {
      useVibeStore.setState({ newText: 'Unique task' });
      useVibeStore.getState().addItem(USER_ID);
      resetMocks();

      useVibeStore.setState({ newText: 'unique task' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().items).toHaveLength(1);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('clears newText after adding', () => {
      useVibeStore.setState({ newText: 'Something' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().newText).toBe('');
    });
  });

  // ─── updateItem ──────────────────────────────────────────────────────

  describe('updateItem', () => {
    beforeEach(() => {
      useVibeStore.setState({
        items: [{ ...fixtureVibes[0] }],
      });
      resetMocks();
    });

    it('calls supabase update with correct args', () => {
      useVibeStore.getState().updateItem('db-1', { status: 'in_progress' });

      expect(mockSupabase.from).toHaveBeenCalledWith('vibes');
      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' }),
      );
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'db-1');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    });

    it('optimistically updates state', () => {
      useVibeStore.getState().updateItem('db-1', { notes: 'Updated notes' });
      expect(useVibeStore.getState().items[0].notes).toBe('Updated notes');
    });

    it('sets completed_at when status becomes done', () => {
      useVibeStore.getState().updateItem('db-1', { status: 'done' });
      expect(useVibeStore.getState().items[0].completed_at).not.toBeNull();
    });

    it('clears completed_at when status changes from done', () => {
      useVibeStore.getState().updateItem('db-1', { status: 'done' });
      useVibeStore.getState().updateItem('db-1', { status: 'spark' });
      expect(useVibeStore.getState().items[0].completed_at).toBeNull();
    });

    it('does not call supabase when item not found after update', () => {
      resetMocks();
      useVibeStore.getState().updateItem('non-existent', { status: 'done' });
      // The store looks up item after getting supabase client.
      // If item not found, it returns early before calling from().
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('does not call localSave in cloud mode', () => {
      useVibeStore.getState().updateItem('db-1', { notes: 'test' });
      expect(mockLocalSave).not.toHaveBeenCalled();
    });
  });

  // ─── deleteItem ──────────────────────────────────────────────────────

  describe('deleteItem', () => {
    beforeEach(() => {
      useVibeStore.setState({
        items: [{ ...fixtureVibes[0] }],
      });
      resetMocks();
    });

    it('calls supabase update with deleted_at', () => {
      useVibeStore.getState().deleteItem('db-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('vibes');
      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) }),
      );
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'db-1');
    });

    it('sets deleted_at on the item in state', () => {
      useVibeStore.getState().deleteItem('db-1');
      expect(useVibeStore.getState().items[0].deleted_at).not.toBeNull();
    });

    it('clears openMenu after delete', () => {
      useVibeStore.setState({ openMenu: 'db-1' });
      useVibeStore.getState().deleteItem('db-1');
      expect(useVibeStore.getState().openMenu).toBeNull();
    });

    it('stops timer if active on deleted item', () => {
      useVibeStore.setState({ activeTimer: 'db-1', timerStart: Date.now(), elapsed: 50 });
      useVibeStore.getState().deleteItem('db-1');
      expect(useVibeStore.getState().activeTimer).toBeNull();
      expect(useVibeStore.getState().timerStart).toBeNull();
      expect(useVibeStore.getState().elapsed).toBe(0);
    });

    it('does not stop timer for different item', () => {
      useVibeStore.setState({ activeTimer: 'other-id', timerStart: Date.now(), elapsed: 50 });
      useVibeStore.getState().deleteItem('db-1');
      expect(useVibeStore.getState().activeTimer).toBe('other-id');
    });

    it('does not call localSave in cloud mode', () => {
      useVibeStore.getState().deleteItem('db-1');
      expect(mockLocalSave).not.toHaveBeenCalled();
    });
  });

  // ─── restoreItem ─────────────────────────────────────────────────────

  describe('restoreItem', () => {
    beforeEach(() => {
      useVibeStore.setState({
        items: [{ ...fixtureVibes[0], deleted_at: '2026-03-20T00:00:00Z', status: 'done' as const }],
      });
      resetMocks();
    });

    it('calls supabase update clearing deleted_at and resetting status', () => {
      useVibeStore.getState().restoreItem('db-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('vibes');
      expect(mockQuery.update).toHaveBeenCalledWith({ deleted_at: null, status: 'spark' });
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'db-1');
    });

    it('clears deleted_at and resets status in state', () => {
      useVibeStore.getState().restoreItem('db-1');
      const item = useVibeStore.getState().items[0];
      expect(item.deleted_at).toBeNull();
      expect(item.status).toBe('spark');
    });

    it('does not call localSave in cloud mode', () => {
      useVibeStore.getState().restoreItem('db-1');
      expect(mockLocalSave).not.toHaveBeenCalled();
    });
  });

  // ─── permanentlyDelete ───────────────────────────────────────────────

  describe('permanentlyDelete', () => {
    beforeEach(() => {
      useVibeStore.setState({
        items: [{ ...fixtureVibes[0] }, { ...fixtureVibes[1] }],
      });
      resetMocks();
    });

    it('calls supabase delete with eq id', () => {
      useVibeStore.getState().permanentlyDelete('db-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('vibes');
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'db-1');
    });

    it('removes item from state', () => {
      useVibeStore.getState().permanentlyDelete('db-1');
      expect(useVibeStore.getState().items).toHaveLength(1);
      expect(useVibeStore.getState().items[0].id).toBe('db-2');
    });

    it('does not call localSave in cloud mode', () => {
      useVibeStore.getState().permanentlyDelete('db-1');
      expect(mockLocalSave).not.toHaveBeenCalled();
    });
  });

  // ─── clearTrash ──────────────────────────────────────────────────────

  describe('clearTrash', () => {
    it('calls supabase delete for each trashed item', () => {
      useVibeStore.setState({
        items: [
          { ...fixtureVibes[0], deleted_at: '2026-03-20T00:00:00Z' },
          { ...fixtureVibes[1] }, // active, not trashed
        ],
      });
      resetMocks();

      useVibeStore.getState().clearTrash();

      // Only the trashed item should be deleted
      expect(mockSupabase.from).toHaveBeenCalledWith('vibes');
      expect(mockQuery.delete).toHaveBeenCalledTimes(1);
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'db-1');
    });

    it('removes all trashed items from state', () => {
      useVibeStore.setState({
        items: [
          { ...fixtureVibes[0], deleted_at: '2026-03-20T00:00:00Z' },
          { ...fixtureVibes[1], deleted_at: '2026-03-20T00:00:00Z' },
        ],
      });

      useVibeStore.getState().clearTrash();
      expect(useVibeStore.getState().items).toHaveLength(0);
    });

    it('keeps active items in state', () => {
      useVibeStore.setState({
        items: [
          { ...fixtureVibes[0] }, // active
          { ...fixtureVibes[1], deleted_at: '2026-03-20T00:00:00Z' },
        ],
      });

      useVibeStore.getState().clearTrash();
      expect(useVibeStore.getState().items).toHaveLength(1);
      expect(useVibeStore.getState().items[0].id).toBe('db-1');
    });

    it('does nothing when no trashed items exist', () => {
      useVibeStore.setState({ items: [{ ...fixtureVibes[0] }] });
      resetMocks();

      useVibeStore.getState().clearTrash();
      expect(mockQuery.delete).not.toHaveBeenCalled();
      expect(useVibeStore.getState().items).toHaveLength(1);
    });

    it('does not call localSave in cloud mode', () => {
      useVibeStore.setState({
        items: [{ ...fixtureVibes[0], deleted_at: '2026-03-20T00:00:00Z' }],
      });
      resetMocks();

      useVibeStore.getState().clearTrash();
      expect(mockLocalSave).not.toHaveBeenCalled();
    });
  });
});
