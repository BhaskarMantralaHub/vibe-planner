import { create } from 'zustand';
import type { Vibe } from '@/types/vibe';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { localLoad, localSave } from '@/lib/storage';
import { genId } from '@/app/(tools)/vibe-planner/lib/utils';
import { toast } from 'sonner';

interface VibeState {
  items: Vibe[];
  newText: string;
  weekOffset: number;
  filter: string;
  openMenu: string | null;
  editingCard: string | null;
  editText: string;
  expandedNotes: string | null;
  dragId: string | null;
  syncing: boolean;
  showTrash: boolean;

  // Timer
  activeTimer: string | null;
  timerStart: number | null;
  elapsed: number;

  // Computed
  activeItems: () => Vibe[];
  trashedItems: () => Vibe[];

  // Actions
  loadItems: (userId: string) => Promise<void>;
  addItem: (userId: string) => void;
  updateItem: (id: string, updates: Partial<Vibe>) => void;
  deleteItem: (id: string) => void;
  restoreItem: (id: string) => void;
  permanentlyDelete: (id: string) => void;
  clearTrash: () => void;
  setShowTrash: (show: boolean) => void;
  setNewText: (text: string) => void;
  setWeekOffset: (offset: number) => void;
  setFilter: (filter: string) => void;
  setOpenMenu: (id: string | null) => void;
  setEditingCard: (id: string | null, text?: string) => void;
  setExpandedNotes: (id: string | null) => void;
  setDragId: (id: string | null) => void;
  startTimer: (id: string) => void;
  stopTimer: () => void;
  tick: () => void;
}

export const useVibeStore = create<VibeState>((set, get) => ({
  items: [],
  showTrash: false,

  activeItems: () => get().items.filter((i) => !i.deleted_at),
  trashedItems: () => get().items.filter((i) => i.deleted_at),
  newText: '',
  weekOffset: 0,
  filter: '',
  openMenu: null,
  editingCard: null,
  editText: '',
  expandedNotes: null,
  dragId: null,
  syncing: false,

  activeTimer: null,
  timerStart: null,
  elapsed: 0,

  loadItems: async (userId: string) => {
    set({ syncing: true });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        set({ syncing: false });
        return;
      }

      const { data, error } = await supabase
        .from('vibes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        set({ items: data as Vibe[] });
      }
    } else {
      set({ items: localLoad() });
    }

    set({ syncing: false });
  },

  addItem: (userId: string) => {
    const { items, newText } = get();
    const trimmed = newText.trim();

    if (!trimmed) return;

    const isDuplicate = items.some(
      (i) => i.text.toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) return;

    const localId = genId();
    const now = new Date().toISOString();
    const newItem: Vibe = {
      id: localId,
      user_id: userId,
      text: trimmed,
      status: 'spark',
      category: null,
      time_spent: 0,
      notes: '',
      due_date: null,
      position: items.length,
      completed_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    set({ items: [...items, newItem], newText: '' });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const insertData = {
        user_id: newItem.user_id,
        text: newItem.text,
        status: newItem.status,
        category: newItem.category,
        time_spent: newItem.time_spent,
        notes: newItem.notes,
        due_date: newItem.due_date,
        position: newItem.position,
      };

      supabase
        .from('vibes')
        .insert(insertData)
        .select()
        .single()
        .then(({ data, error }: { data: Vibe | null; error: unknown }) => {
          if (!error && data) {
            set({
              items: get().items.map((i) =>
                i.id === localId ? data : i,
              ),
            });
          } else if (error) {
            toast.error('Couldn\'t save vibe. Check your connection and try again.');
          }
        });
    } else {
      localSave(get().items);
    }
  },

  updateItem: (id: string, updates: Partial<Vibe>) => {
    // Auto-manage completed_at
    if (updates.status) {
      if (updates.status === 'done') {
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_at = null;
      }
    }

    set({
      items: get().items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const item = get().items.find((i) => i.id === id);
      if (!item) return;

      supabase
        .from('vibes')
        .update(updates)
        .eq('id', id)
        .eq('user_id', item.user_id)
        .then(() => {
          // Optimistic update already applied
        });
    } else {
      localSave(get().items);
    }
  },

  deleteItem: (id: string) => {
    const { activeTimer } = get();
    if (activeTimer === id) {
      set({ activeTimer: null, timerStart: null, elapsed: 0 });
    }

    // Soft delete — set deleted_at timestamp
    const now = new Date().toISOString();
    set({
      items: get().items.map((i) => i.id === id ? { ...i, deleted_at: now } : i),
      openMenu: null,
    });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('vibes').update({ deleted_at: now }).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) toast.error('Couldn\'t delete. Check your connection and try again.');
        else toast('Moved to trash', { action: { label: 'Undo', onClick: () => get().restoreItem(id) } });
      });
    } else {
      localSave(get().items);
    }
  },

  restoreItem: (id: string) => {
    // Clear deleted_at and reset status to spark
    set({
      items: get().items.map((i) => i.id === id ? { ...i, deleted_at: null, status: 'spark' as const } : i),
    });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('vibes').update({ deleted_at: null, status: 'spark' }).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) toast.error('Couldn\'t restore. Check your connection and try again.');
        else toast.success('Vibe restored');
      });
    } else {
      localSave(get().items);
    }
  },

  permanentlyDelete: (id: string) => {
    set({ items: get().items.filter((i) => i.id !== id) });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('vibes').delete().eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) toast.error('Couldn\'t delete permanently. Check your connection and try again.');
      });
    } else {
      localSave(get().items);
    }
  },

  clearTrash: () => {
    const trashed = get().items.filter((i) => i.deleted_at);
    const ids = trashed.map((i) => i.id);
    set({ items: get().items.filter((i) => !i.deleted_at) });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      ids.forEach((id) => supabase?.from('vibes').delete().eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) toast.error('Couldn\'t empty trash. Check your connection and try again.');
      }));
      toast.success('Trash emptied');
    } else {
      localSave(get().items);
    }
  },

  setShowTrash: (showTrash: boolean) => set({ showTrash }),

  setNewText: (newText) => set({ newText }),
  setWeekOffset: (weekOffset) => set({ weekOffset }),
  setFilter: (filter) => set({ filter }),
  setOpenMenu: (openMenu) => set({ openMenu }),

  setEditingCard: (id, text) => {
    if (id === null) {
      set({ editingCard: null, editText: '' });
    } else {
      set({ editingCard: id, editText: text ?? '' });
    }
  },

  setExpandedNotes: (expandedNotes) => set({ expandedNotes }),
  setDragId: (dragId) => set({ dragId }),

  startTimer: (id: string) => {
    const { activeTimer } = get();

    // Toggle off if same timer
    if (activeTimer === id) {
      get().stopTimer();
      return;
    }

    // Stop existing timer first
    if (activeTimer) {
      get().stopTimer();
    }

    set({ activeTimer: id, timerStart: Date.now(), elapsed: 0 });
  },

  stopTimer: () => {
    const { activeTimer, elapsed, items } = get();

    if (activeTimer && elapsed > 0) {
      const minutes = Math.max(1, Math.round(elapsed / 60));
      const item = items.find((i) => i.id === activeTimer);

      if (item) {
        get().updateItem(activeTimer, {
          time_spent: item.time_spent + minutes,
        });
      }
    }

    set({ activeTimer: null, timerStart: null, elapsed: 0 });
  },

  tick: () => {
    const { timerStart } = get();
    if (!timerStart) return;

    set({ elapsed: Math.floor((Date.now() - timerStart) / 1000) });
  },
}));
