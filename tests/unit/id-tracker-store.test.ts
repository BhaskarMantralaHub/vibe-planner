import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useIDTrackerStore } from '@/stores/id-tracker-store';

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => null,
  isCloudMode: () => false,
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

const USER_ID = 'user-456';

const sampleDoc = {
  id_type: 'Passport',
  country: 'US' as const,
  label: 'My Passport',
  owner_name: 'John Doe',
  description: 'US passport',
  expiry_date: '2030-06-15',
  renewal_url: 'https://travel.state.gov',
  reminder_days: [90, 30],
};

function resetStore() {
  useIDTrackerStore.setState({
    documents: [],
    loading: true,
    selectedOwner: null,
    showForm: false,
    editingDoc: null,
  });
}

describe('id-tracker-store', () => {
  beforeEach(() => {
    resetStore();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ─── addDocument ──────────────────────────────────────────────────

  describe('addDocument', () => {
    it('creates a document with correct fields', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);

      const docs = useIDTrackerStore.getState().documents;
      expect(docs).toHaveLength(1);
      expect(docs[0].user_id).toBe(USER_ID);
      expect(docs[0].id_type).toBe('Passport');
      expect(docs[0].country).toBe('US');
      expect(docs[0].label).toBe('My Passport');
      expect(docs[0].owner_name).toBe('John Doe');
      expect(docs[0].description).toBe('US passport');
      expect(docs[0].expiry_date).toBe('2030-06-15');
      expect(docs[0].renewal_url).toBe('https://travel.state.gov');
      expect(docs[0].reminder_days).toEqual([90, 30]);
    });

    it('assigns an id, created_at, and updated_at', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);

      const doc = useIDTrackerStore.getState().documents[0];
      expect(doc.id).toBeTruthy();
      expect(doc.created_at).toBeTruthy();
      expect(doc.updated_at).toBeTruthy();
      // created_at and updated_at should be valid ISO dates
      expect(new Date(doc.created_at).getTime()).not.toBeNaN();
      expect(new Date(doc.updated_at).getTime()).not.toBeNaN();
    });

    it('adds multiple documents', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      useIDTrackerStore.getState().addDocument(USER_ID, {
        ...sampleDoc,
        id_type: 'Drivers License',
        label: 'CA DL',
        country: 'US',
      });

      expect(useIDTrackerStore.getState().documents).toHaveLength(2);
    });

    it('assigns unique IDs to each document', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      useIDTrackerStore.getState().addDocument(USER_ID, {
        ...sampleDoc,
        label: 'Another doc',
      });

      const docs = useIDTrackerStore.getState().documents;
      expect(docs[0].id).not.toBe(docs[1].id);
    });

    it('saves to localStorage in offline mode', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'id_tracker_data',
        expect.any(String),
      );
    });
  });

  // ─── updateDocument ───────────────────────────────────────────────

  describe('updateDocument', () => {
    it('merges partial updates into the document', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      const id = useIDTrackerStore.getState().documents[0].id;

      useIDTrackerStore.getState().updateDocument(id, {
        label: 'Updated Passport',
        expiry_date: '2032-01-01',
      });

      const doc = useIDTrackerStore.getState().documents[0];
      expect(doc.label).toBe('Updated Passport');
      expect(doc.expiry_date).toBe('2032-01-01');
      // Other fields should remain unchanged
      expect(doc.owner_name).toBe('John Doe');
      expect(doc.country).toBe('US');
    });

    it('updates description', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      const id = useIDTrackerStore.getState().documents[0].id;

      useIDTrackerStore.getState().updateDocument(id, {
        description: 'New description',
      });
      expect(useIDTrackerStore.getState().documents[0].description).toBe('New description');
    });

    it('updates renewal_url', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      const id = useIDTrackerStore.getState().documents[0].id;

      useIDTrackerStore.getState().updateDocument(id, {
        renewal_url: 'https://new-url.com',
      });
      expect(useIDTrackerStore.getState().documents[0].renewal_url).toBe('https://new-url.com');
    });

    it('updates reminder_days', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      const id = useIDTrackerStore.getState().documents[0].id;

      useIDTrackerStore.getState().updateDocument(id, {
        reminder_days: [60, 14, 7],
      });
      expect(useIDTrackerStore.getState().documents[0].reminder_days).toEqual([60, 14, 7]);
    });

    it('does not crash when updating non-existent doc', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      // Should not throw
      useIDTrackerStore.getState().updateDocument('non-existent-id', {
        label: 'Ghost',
      });

      // Original doc is unchanged
      expect(useIDTrackerStore.getState().documents[0].label).toBe('My Passport');
    });

    it('only updates the targeted document', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      useIDTrackerStore.getState().addDocument(USER_ID, {
        ...sampleDoc,
        label: 'Second Doc',
      });

      const secondId = useIDTrackerStore.getState().documents[1].id;
      useIDTrackerStore.getState().updateDocument(secondId, { label: 'Updated Second' });

      expect(useIDTrackerStore.getState().documents[0].label).toBe('My Passport');
      expect(useIDTrackerStore.getState().documents[1].label).toBe('Updated Second');
    });
  });

  // ─── deleteDocument ───────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('removes the document from the array', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      const id = useIDTrackerStore.getState().documents[0].id;

      useIDTrackerStore.getState().deleteDocument(id);
      expect(useIDTrackerStore.getState().documents).toHaveLength(0);
    });

    it('only removes the targeted document', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      useIDTrackerStore.getState().addDocument(USER_ID, {
        ...sampleDoc,
        label: 'Keep this',
      });

      const firstId = useIDTrackerStore.getState().documents[0].id;
      useIDTrackerStore.getState().deleteDocument(firstId);

      const docs = useIDTrackerStore.getState().documents;
      expect(docs).toHaveLength(1);
      expect(docs[0].label).toBe('Keep this');
    });

    it('does not crash when deleting non-existent doc', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      useIDTrackerStore.getState().deleteDocument('non-existent-id');
      expect(useIDTrackerStore.getState().documents).toHaveLength(1);
    });

    it('saves to localStorage after delete', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      vi.clearAllMocks();

      const id = useIDTrackerStore.getState().documents[0].id;
      useIDTrackerStore.getState().deleteDocument(id);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'id_tracker_data',
        expect.any(String),
      );
    });
  });

  // ─── Simple setters ──────────────────────────────────────────────

  describe('simple setters', () => {
    it('setSelectedOwner changes selectedOwner', () => {
      useIDTrackerStore.getState().setSelectedOwner('John Doe');
      expect(useIDTrackerStore.getState().selectedOwner).toBe('John Doe');
    });

    it('setSelectedOwner can be set to null', () => {
      useIDTrackerStore.getState().setSelectedOwner('John Doe');
      useIDTrackerStore.getState().setSelectedOwner(null);
      expect(useIDTrackerStore.getState().selectedOwner).toBeNull();
    });

    it('setShowForm changes showForm', () => {
      useIDTrackerStore.getState().setShowForm(true);
      expect(useIDTrackerStore.getState().showForm).toBe(true);
      useIDTrackerStore.getState().setShowForm(false);
      expect(useIDTrackerStore.getState().showForm).toBe(false);
    });

    it('setEditingDoc changes editingDoc', () => {
      useIDTrackerStore.getState().setEditingDoc('doc-1');
      expect(useIDTrackerStore.getState().editingDoc).toBe('doc-1');
    });

    it('setEditingDoc can be set to null', () => {
      useIDTrackerStore.getState().setEditingDoc('doc-1');
      useIDTrackerStore.getState().setEditingDoc(null);
      expect(useIDTrackerStore.getState().editingDoc).toBeNull();
    });
  });

  // ─── loadDocuments ────────────────────────────────────────────────

  describe('loadDocuments', () => {
    it('sets loading to false after load in offline mode', async () => {
      expect(useIDTrackerStore.getState().loading).toBe(true);
      await useIDTrackerStore.getState().loadDocuments(USER_ID);
      expect(useIDTrackerStore.getState().loading).toBe(false);
    });

    it('loads documents from localStorage in offline mode', async () => {
      const storedDocs = [{ ...sampleDoc, id: 'stored-1', user_id: USER_ID, created_at: '2026-01-01', updated_at: '2026-01-01' }];
      localStorageMock.setItem('id_tracker_data', JSON.stringify(storedDocs));

      await useIDTrackerStore.getState().loadDocuments(USER_ID);
      expect(useIDTrackerStore.getState().documents).toEqual(storedDocs);
    });

    it('loads empty array when localStorage has no data', async () => {
      await useIDTrackerStore.getState().loadDocuments(USER_ID);
      expect(useIDTrackerStore.getState().documents).toEqual([]);
    });
  });
});
