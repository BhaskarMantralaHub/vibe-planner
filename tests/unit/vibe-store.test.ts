import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVibeStore } from '@/stores/vibe-store';

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => null,
  isCloudMode: () => false,
}));

// Mock storage
vi.mock('@/lib/storage', () => ({
  localLoad: vi.fn(() => []),
  localSave: vi.fn(),
  loadTrash: vi.fn(() => []),
  saveTrash: vi.fn(),
}));

// Mock genId to return predictable IDs
let idCounter = 0;
vi.mock('@/app/(tools)/vibe-planner/lib/utils', () => ({
  genId: () => `mock-id-${++idCounter}`,
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const USER_ID = 'user-123';

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

describe('vibe-store', () => {
  beforeEach(() => {
    idCounter = 0;
    resetStore();
    vi.clearAllMocks();
  });

  // ─── addItem ──────────────────────────────────────────────────────

  describe('addItem', () => {
    it('creates a vibe with status spark and correct text', () => {
      const store = useVibeStore.getState();
      useVibeStore.setState({ newText: 'Build dashboard' });
      useVibeStore.getState().addItem(USER_ID);

      const items = useVibeStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].text).toBe('Build dashboard');
      expect(items[0].status).toBe('spark');
      expect(items[0].user_id).toBe(USER_ID);
      expect(items[0].category).toBeNull();
      expect(items[0].time_spent).toBe(0);
      expect(items[0].notes).toBe('');
      expect(items[0].due_date).toBeNull();
      expect(items[0].completed_at).toBeNull();
      expect(items[0].deleted_at).toBeNull();
      expect(items[0].position).toBe(0);
    });

    it('clears newText after adding', () => {
      useVibeStore.setState({ newText: 'Something' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().newText).toBe('');
    });

    it('trims whitespace from text', () => {
      useVibeStore.setState({ newText: '  Trimmed task  ' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().items[0].text).toBe('Trimmed task');
    });

    it('does not add item with empty text', () => {
      useVibeStore.setState({ newText: '' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().items).toHaveLength(0);
    });

    it('does not add item with whitespace-only text', () => {
      useVibeStore.setState({ newText: '   ' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().items).toHaveLength(0);
    });

    it('prevents duplicate items (case-insensitive)', () => {
      useVibeStore.setState({ newText: 'Task One' });
      useVibeStore.getState().addItem(USER_ID);
      useVibeStore.setState({ newText: 'task one' });
      useVibeStore.getState().addItem(USER_ID);
      expect(useVibeStore.getState().items).toHaveLength(1);
    });

    it('assigns incrementing positions', () => {
      useVibeStore.setState({ newText: 'First' });
      useVibeStore.getState().addItem(USER_ID);
      useVibeStore.setState({ newText: 'Second' });
      useVibeStore.getState().addItem(USER_ID);

      const items = useVibeStore.getState().items;
      expect(items[0].position).toBe(0);
      expect(items[1].position).toBe(1);
    });
  });

  // ─── updateItem ───────────────────────────────────────────────────

  describe('updateItem', () => {
    function addTestItem(text = 'Test task') {
      useVibeStore.setState({ newText: text });
      useVibeStore.getState().addItem(USER_ID);
      return useVibeStore.getState().items[useVibeStore.getState().items.length - 1];
    }

    it('updates status', () => {
      const item = addTestItem();
      useVibeStore.getState().updateItem(item.id, { status: 'in_progress' });
      expect(useVibeStore.getState().items[0].status).toBe('in_progress');
    });

    it('updates category', () => {
      const item = addTestItem();
      useVibeStore.getState().updateItem(item.id, { category: 'Work' });
      expect(useVibeStore.getState().items[0].category).toBe('Work');
    });

    it('updates notes', () => {
      const item = addTestItem();
      useVibeStore.getState().updateItem(item.id, { notes: 'Important notes' });
      expect(useVibeStore.getState().items[0].notes).toBe('Important notes');
    });

    it('updates due_date', () => {
      const item = addTestItem();
      useVibeStore.getState().updateItem(item.id, { due_date: '2026-04-01' });
      expect(useVibeStore.getState().items[0].due_date).toBe('2026-04-01');
    });

    it('updates time_spent', () => {
      const item = addTestItem();
      useVibeStore.getState().updateItem(item.id, { time_spent: 45 });
      expect(useVibeStore.getState().items[0].time_spent).toBe(45);
    });

    it('sets completed_at when status becomes done', () => {
      const item = addTestItem();
      useVibeStore.getState().updateItem(item.id, { status: 'done' });
      expect(useVibeStore.getState().items[0].completed_at).not.toBeNull();
    });

    it('clears completed_at when status changes from done', () => {
      const item = addTestItem();
      useVibeStore.getState().updateItem(item.id, { status: 'done' });
      expect(useVibeStore.getState().items[0].completed_at).not.toBeNull();

      useVibeStore.getState().updateItem(item.id, { status: 'spark' });
      expect(useVibeStore.getState().items[0].completed_at).toBeNull();
    });

    it('does not crash when updating non-existent id', () => {
      addTestItem();
      useVibeStore.getState().updateItem('non-existent', { status: 'done' });
      // original item should be unchanged
      expect(useVibeStore.getState().items[0].status).toBe('spark');
    });
  });

  // ─── deleteItem (soft delete) ─────────────────────────────────────

  describe('deleteItem', () => {
    it('sets deleted_at on the item', () => {
      useVibeStore.setState({ newText: 'Delete me' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().deleteItem(id);
      expect(useVibeStore.getState().items[0].deleted_at).not.toBeNull();
    });

    it('clears openMenu after delete', () => {
      useVibeStore.setState({ newText: 'Delete me' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;
      useVibeStore.setState({ openMenu: id });

      useVibeStore.getState().deleteItem(id);
      expect(useVibeStore.getState().openMenu).toBeNull();
    });

    it('stops timer if active on deleted item', () => {
      useVibeStore.setState({ newText: 'Timed task' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;
      useVibeStore.getState().startTimer(id);
      expect(useVibeStore.getState().activeTimer).toBe(id);

      useVibeStore.getState().deleteItem(id);
      expect(useVibeStore.getState().activeTimer).toBeNull();
    });

    it('deleting already-deleted item sets a new deleted_at', () => {
      useVibeStore.setState({ newText: 'Double delete' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().deleteItem(id);
      const firstDeletedAt = useVibeStore.getState().items[0].deleted_at;

      // small delay to ensure different timestamp
      useVibeStore.getState().deleteItem(id);
      const secondDeletedAt = useVibeStore.getState().items[0].deleted_at;

      expect(secondDeletedAt).not.toBeNull();
      // Both should be valid ISO strings
      expect(new Date(secondDeletedAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(firstDeletedAt!).getTime()
      );
    });
  });

  // ─── restoreItem ──────────────────────────────────────────────────

  describe('restoreItem', () => {
    it('clears deleted_at and resets status to spark', () => {
      useVibeStore.setState({ newText: 'Restore me' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      // Set to in_progress, then delete
      useVibeStore.getState().updateItem(id, { status: 'in_progress' });
      useVibeStore.getState().deleteItem(id);
      expect(useVibeStore.getState().items[0].deleted_at).not.toBeNull();

      useVibeStore.getState().restoreItem(id);
      expect(useVibeStore.getState().items[0].deleted_at).toBeNull();
      expect(useVibeStore.getState().items[0].status).toBe('spark');
    });

    it('restoring a non-deleted item resets status to spark', () => {
      useVibeStore.setState({ newText: 'Not deleted' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;
      useVibeStore.getState().updateItem(id, { status: 'done' });

      useVibeStore.getState().restoreItem(id);
      expect(useVibeStore.getState().items[0].status).toBe('spark');
      expect(useVibeStore.getState().items[0].deleted_at).toBeNull();
    });
  });

  // ─── permanentlyDelete ────────────────────────────────────────────

  describe('permanentlyDelete', () => {
    it('removes item from the array entirely', () => {
      useVibeStore.setState({ newText: 'Permanent' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().permanentlyDelete(id);
      expect(useVibeStore.getState().items).toHaveLength(0);
    });

    it('does not affect other items', () => {
      useVibeStore.setState({ newText: 'Keep' });
      useVibeStore.getState().addItem(USER_ID);
      useVibeStore.setState({ newText: 'Remove' });
      useVibeStore.getState().addItem(USER_ID);

      const removeId = useVibeStore.getState().items[1].id;
      useVibeStore.getState().permanentlyDelete(removeId);
      expect(useVibeStore.getState().items).toHaveLength(1);
      expect(useVibeStore.getState().items[0].text).toBe('Keep');
    });
  });

  // ─── clearTrash ───────────────────────────────────────────────────

  describe('clearTrash', () => {
    it('removes all items with deleted_at set', () => {
      useVibeStore.setState({ newText: 'Active' });
      useVibeStore.getState().addItem(USER_ID);
      useVibeStore.setState({ newText: 'Trash1' });
      useVibeStore.getState().addItem(USER_ID);
      useVibeStore.setState({ newText: 'Trash2' });
      useVibeStore.getState().addItem(USER_ID);

      const items = useVibeStore.getState().items;
      useVibeStore.getState().deleteItem(items[1].id);
      useVibeStore.getState().deleteItem(items[2].id);

      useVibeStore.getState().clearTrash();
      const remaining = useVibeStore.getState().items;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].text).toBe('Active');
    });

    it('does nothing when trash is empty', () => {
      useVibeStore.setState({ newText: 'Active' });
      useVibeStore.getState().addItem(USER_ID);

      useVibeStore.getState().clearTrash();
      expect(useVibeStore.getState().items).toHaveLength(1);
    });
  });

  // ─── activeItems / trashedItems ───────────────────────────────────

  describe('activeItems and trashedItems', () => {
    it('activeItems filters out deleted items', () => {
      useVibeStore.setState({ newText: 'Active one' });
      useVibeStore.getState().addItem(USER_ID);
      useVibeStore.setState({ newText: 'Deleted one' });
      useVibeStore.getState().addItem(USER_ID);

      const deletedId = useVibeStore.getState().items[1].id;
      useVibeStore.getState().deleteItem(deletedId);

      const active = useVibeStore.getState().activeItems();
      expect(active).toHaveLength(1);
      expect(active[0].text).toBe('Active one');
    });

    it('trashedItems returns only deleted items', () => {
      useVibeStore.setState({ newText: 'Active' });
      useVibeStore.getState().addItem(USER_ID);
      useVibeStore.setState({ newText: 'Trashed' });
      useVibeStore.getState().addItem(USER_ID);

      const trashedId = useVibeStore.getState().items[1].id;
      useVibeStore.getState().deleteItem(trashedId);

      const trashed = useVibeStore.getState().trashedItems();
      expect(trashed).toHaveLength(1);
      expect(trashed[0].text).toBe('Trashed');
    });

    it('both return empty arrays when no items exist', () => {
      expect(useVibeStore.getState().activeItems()).toHaveLength(0);
      expect(useVibeStore.getState().trashedItems()).toHaveLength(0);
    });
  });

  // ─── Simple setters ──────────────────────────────────────────────

  describe('simple setters', () => {
    it('setView changes view', () => {
      useVibeStore.getState().setView('timeline');
      expect(useVibeStore.getState().view).toBe('timeline');
      useVibeStore.getState().setView('list');
      expect(useVibeStore.getState().view).toBe('list');
      useVibeStore.getState().setView('board');
      expect(useVibeStore.getState().view).toBe('board');
    });

    it('setNewText changes newText', () => {
      useVibeStore.getState().setNewText('hello');
      expect(useVibeStore.getState().newText).toBe('hello');
    });

    it('setWeekOffset changes weekOffset', () => {
      useVibeStore.getState().setWeekOffset(3);
      expect(useVibeStore.getState().weekOffset).toBe(3);
      useVibeStore.getState().setWeekOffset(-1);
      expect(useVibeStore.getState().weekOffset).toBe(-1);
    });

    it('setFilter changes filter', () => {
      useVibeStore.getState().setFilter('Work');
      expect(useVibeStore.getState().filter).toBe('Work');
    });

    it('setOpenMenu changes openMenu', () => {
      useVibeStore.getState().setOpenMenu('menu-1');
      expect(useVibeStore.getState().openMenu).toBe('menu-1');
      useVibeStore.getState().setOpenMenu(null);
      expect(useVibeStore.getState().openMenu).toBeNull();
    });

    it('setEditingCard with id sets editingCard and editText', () => {
      useVibeStore.getState().setEditingCard('card-1', 'some text');
      expect(useVibeStore.getState().editingCard).toBe('card-1');
      expect(useVibeStore.getState().editText).toBe('some text');
    });

    it('setEditingCard with null clears editingCard and editText', () => {
      useVibeStore.getState().setEditingCard('card-1', 'text');
      useVibeStore.getState().setEditingCard(null);
      expect(useVibeStore.getState().editingCard).toBeNull();
      expect(useVibeStore.getState().editText).toBe('');
    });

    it('setEditingCard without text defaults to empty string', () => {
      useVibeStore.getState().setEditingCard('card-1');
      expect(useVibeStore.getState().editText).toBe('');
    });

    it('setExpandedNotes changes expandedNotes', () => {
      useVibeStore.getState().setExpandedNotes('note-1');
      expect(useVibeStore.getState().expandedNotes).toBe('note-1');
      useVibeStore.getState().setExpandedNotes(null);
      expect(useVibeStore.getState().expandedNotes).toBeNull();
    });

    it('setDragId changes dragId', () => {
      useVibeStore.getState().setDragId('drag-1');
      expect(useVibeStore.getState().dragId).toBe('drag-1');
      useVibeStore.getState().setDragId(null);
      expect(useVibeStore.getState().dragId).toBeNull();
    });

    it('setShowTrash changes showTrash', () => {
      useVibeStore.getState().setShowTrash(true);
      expect(useVibeStore.getState().showTrash).toBe(true);
      useVibeStore.getState().setShowTrash(false);
      expect(useVibeStore.getState().showTrash).toBe(false);
    });
  });

  // ─── Timer ────────────────────────────────────────────────────────

  describe('timer', () => {
    it('startTimer sets activeTimer and timerStart', () => {
      useVibeStore.setState({ newText: 'Timer task' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().startTimer(id);
      expect(useVibeStore.getState().activeTimer).toBe(id);
      expect(useVibeStore.getState().timerStart).not.toBeNull();
      expect(useVibeStore.getState().elapsed).toBe(0);
    });

    it('startTimer toggles off when same id is passed', () => {
      useVibeStore.setState({ newText: 'Toggle task' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().startTimer(id);
      expect(useVibeStore.getState().activeTimer).toBe(id);

      useVibeStore.getState().startTimer(id);
      expect(useVibeStore.getState().activeTimer).toBeNull();
    });

    it('startTimer stops existing timer before starting new one', () => {
      useVibeStore.setState({ newText: 'Task A' });
      useVibeStore.getState().addItem(USER_ID);
      useVibeStore.setState({ newText: 'Task B' });
      useVibeStore.getState().addItem(USER_ID);

      const idA = useVibeStore.getState().items[0].id;
      const idB = useVibeStore.getState().items[1].id;

      useVibeStore.getState().startTimer(idA);
      expect(useVibeStore.getState().activeTimer).toBe(idA);

      useVibeStore.getState().startTimer(idB);
      expect(useVibeStore.getState().activeTimer).toBe(idB);
    });

    it('stopTimer clears timer state', () => {
      useVibeStore.setState({ newText: 'Stop task' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().startTimer(id);
      useVibeStore.getState().stopTimer();

      expect(useVibeStore.getState().activeTimer).toBeNull();
      expect(useVibeStore.getState().timerStart).toBeNull();
      expect(useVibeStore.getState().elapsed).toBe(0);
    });

    it('stopTimer adds elapsed time to item time_spent', () => {
      useVibeStore.setState({ newText: 'Elapsed task' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().startTimer(id);
      // Simulate 120 seconds elapsed
      useVibeStore.setState({ elapsed: 120 });
      useVibeStore.getState().stopTimer();

      // 120 seconds = 2 minutes
      expect(useVibeStore.getState().items[0].time_spent).toBe(2);
    });

    it('stopTimer rounds up to minimum 1 minute when elapsed > 0', () => {
      useVibeStore.setState({ newText: 'Short task' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().startTimer(id);
      // Simulate 10 seconds elapsed
      useVibeStore.setState({ elapsed: 10 });
      useVibeStore.getState().stopTimer();

      expect(useVibeStore.getState().items[0].time_spent).toBe(1);
    });

    it('stopTimer does not add time when elapsed is 0', () => {
      useVibeStore.setState({ newText: 'Zero task' });
      useVibeStore.getState().addItem(USER_ID);
      const id = useVibeStore.getState().items[0].id;

      useVibeStore.getState().startTimer(id);
      useVibeStore.getState().stopTimer();

      expect(useVibeStore.getState().items[0].time_spent).toBe(0);
    });

    it('tick updates elapsed based on timerStart', () => {
      const now = Date.now();
      useVibeStore.setState({ timerStart: now - 5000 }); // 5 seconds ago
      useVibeStore.getState().tick();
      expect(useVibeStore.getState().elapsed).toBeGreaterThanOrEqual(4);
    });

    it('tick does nothing when timerStart is null', () => {
      useVibeStore.setState({ elapsed: 42, timerStart: null });
      useVibeStore.getState().tick();
      expect(useVibeStore.getState().elapsed).toBe(42);
    });
  });
});
