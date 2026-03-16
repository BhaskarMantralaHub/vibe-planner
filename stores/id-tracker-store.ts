import { create } from 'zustand';
import type { IDDocument } from '@/types/id-tracker';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';

const LOCAL_KEY = 'id_tracker_data';

function localLoad(): IDDocument[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as IDDocument[];
  } catch {
    return [];
  }
}

function localSave(items: IDDocument[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch {
    // Storage full or unavailable
  }
}

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface IDTrackerState {
  documents: IDDocument[];
  loading: boolean;
  selectedOwner: string | null;
  showForm: boolean;
  editingDoc: string | null;

  loadDocuments: (userId: string) => Promise<void>;
  addDocument: (userId: string, doc: Omit<IDDocument, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => void;
  updateDocument: (id: string, updates: Partial<IDDocument>) => void;
  deleteDocument: (id: string) => void;
  setSelectedOwner: (owner: string | null) => void;
  setShowForm: (show: boolean) => void;
  setEditingDoc: (id: string | null) => void;
}

export const useIDTrackerStore = create<IDTrackerState>((set, get) => ({
  documents: [],
  loading: true,
  selectedOwner: null,
  showForm: false,
  editingDoc: null,

  loadDocuments: async (userId: string) => {
    set({ loading: true });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        set({ loading: false });
        return;
      }

      const { data, error } = await supabase
        .from('id_documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        set({ documents: data as IDDocument[] });
      }
    } else {
      set({ documents: localLoad() });
    }

    set({ loading: false });
  },

  addDocument: (userId: string, doc: Omit<IDDocument, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const localId = genId();
    const now = new Date().toISOString();
    const newDoc: IDDocument = {
      id: localId,
      user_id: userId,
      ...doc,
      created_at: now,
      updated_at: now,
    };

    set({ documents: [...get().documents, newDoc] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const insertData = {
        user_id: userId,
        id_type: doc.id_type,
        country: doc.country,
        label: doc.label,
        owner_name: doc.owner_name,
        description: doc.description,
        expiry_date: doc.expiry_date,
        renewal_url: doc.renewal_url,
        reminder_days: doc.reminder_days,
      };

      supabase
        .from('id_documents')
        .insert(insertData)
        .select()
        .single()
        .then(({ data, error }: { data: IDDocument | null; error: unknown }) => {
          if (!error && data) {
            set({
              documents: get().documents.map((d) =>
                d.id === localId ? data : d,
              ),
            });
          }
        });
    } else {
      localSave(get().documents);
    }
  },

  updateDocument: (id: string, updates: Partial<IDDocument>) => {
    set({
      documents: get().documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const doc = get().documents.find((d) => d.id === id);
      if (!doc) return;

      supabase
        .from('id_documents')
        .update(updates)
        .eq('id', id)
        .eq('user_id', doc.user_id)
        .then(() => {
          // Optimistic update already applied
        });
    } else {
      localSave(get().documents);
    }
  },

  deleteDocument: (id: string) => {
    set({
      documents: get().documents.filter((d) => d.id !== id),
    });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('id_documents').delete().eq('id', id).then(() => {});
    } else {
      localSave(get().documents);
    }
  },

  setSelectedOwner: (selectedOwner: string | null) => set({ selectedOwner }),
  setShowForm: (showForm: boolean) => set({ showForm }),
  setEditingDoc: (editingDoc: string | null) => set({ editingDoc }),
}));
