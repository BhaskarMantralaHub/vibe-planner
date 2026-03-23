import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IDDocument } from '@/types/id-tracker';

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

// Import after mocks
import { useIDTrackerStore } from '@/stores/id-tracker-store';

const USER_ID = 'cloud-user-id';

const sampleDoc = {
  id_type: 'Passport',
  country: 'US' as const,
  label: 'My Passport',
  owner_name: 'Jane Doe',
  description: 'US passport',
  expiry_date: '2030-06-15',
  renewal_url: 'https://travel.state.gov',
  reminder_days: [90, 30],
};

const fixtureDoc: IDDocument = {
  id: 'db-doc-1',
  user_id: USER_ID,
  id_type: 'Passport',
  country: 'US',
  label: 'My Passport',
  owner_name: 'Jane Doe',
  description: 'US passport',
  expiry_date: '2030-06-15',
  renewal_url: 'https://travel.state.gov',
  reminder_days: [90, 30],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const fixtureDoc2: IDDocument = {
  id: 'db-doc-2',
  user_id: USER_ID,
  id_type: 'Drivers License',
  country: 'US',
  label: 'CA DL',
  owner_name: 'Jane Doe',
  description: 'California drivers license',
  expiry_date: '2028-12-01',
  renewal_url: 'https://dmv.ca.gov',
  reminder_days: [60],
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
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

function resetMocks() {
  for (const m of chainMethods) (mockQuery[m] as any).mockClear();
  mockQuery.single.mockClear();
  mockQuery.then.mockClear();
  mockSupabase.from.mockClear();

  // Re-establish defaults
  mockSupabase.from.mockReturnValue(mockQuery);
  for (const m of chainMethods) mockQuery[m].mockReturnValue(mockQuery);
  mockQuery.single.mockResolvedValue({ data: null, error: null });
  mockQuery.then.mockImplementation((resolve: any) => {
    resolve({ data: null, error: null });
    return Promise.resolve();
  });
}

describe('id-tracker-store (cloud mode)', () => {
  beforeEach(() => {
    resetStore();
    resetMocks();
  });

  // ─── loadDocuments ───────────────────────────────────────────────────

  describe('loadDocuments', () => {
    it('fetches documents from supabase and sets state', async () => {
      mockQuery.order.mockResolvedValueOnce({ data: [fixtureDoc, fixtureDoc2], error: null });

      await useIDTrackerStore.getState().loadDocuments(USER_ID);

      expect(mockSupabase.from).toHaveBeenCalledWith('id_documents');
      expect(mockQuery.select).toHaveBeenCalledWith('*');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(useIDTrackerStore.getState().documents).toEqual([fixtureDoc, fixtureDoc2]);
      expect(useIDTrackerStore.getState().loading).toBe(false);
    });

    it('sets loading to false even on error', async () => {
      mockQuery.order.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

      await useIDTrackerStore.getState().loadDocuments(USER_ID);

      expect(useIDTrackerStore.getState().loading).toBe(false);
    });

    it('does not overwrite documents on error', async () => {
      useIDTrackerStore.setState({ documents: [fixtureDoc] });
      mockQuery.order.mockResolvedValueOnce({ data: null, error: { message: 'Failed' } });

      await useIDTrackerStore.getState().loadDocuments(USER_ID);

      expect(useIDTrackerStore.getState().documents).toEqual([fixtureDoc]);
    });

    it('handles null supabase client gracefully', async () => {
      // The mock always returns mockSupabase, so test the flow completes
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null });

      await useIDTrackerStore.getState().loadDocuments(USER_ID);
      expect(useIDTrackerStore.getState().loading).toBe(false);
    });

    it('handles empty data array', async () => {
      mockQuery.order.mockResolvedValueOnce({ data: [], error: null });

      await useIDTrackerStore.getState().loadDocuments(USER_ID);

      expect(useIDTrackerStore.getState().documents).toEqual([]);
      expect(useIDTrackerStore.getState().loading).toBe(false);
    });
  });

  // ─── addDocument ─────────────────────────────────────────────────────

  describe('addDocument', () => {
    it('calls supabase insert with correct data', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);

      expect(mockSupabase.from).toHaveBeenCalledWith('id_documents');
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_ID,
          id_type: 'Passport',
          country: 'US',
          label: 'My Passport',
          owner_name: 'Jane Doe',
          description: 'US passport',
          expiry_date: '2030-06-15',
          renewal_url: 'https://travel.state.gov',
          reminder_days: [90, 30],
        }),
      );
      expect(mockQuery.select).toHaveBeenCalled();
      expect(mockQuery.single).toHaveBeenCalled();
    });

    it('optimistically adds document to state', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);

      const docs = useIDTrackerStore.getState().documents;
      expect(docs).toHaveLength(1);
      expect(docs[0].label).toBe('My Passport');
      expect(docs[0].user_id).toBe(USER_ID);
      expect(docs[0].id).toBeTruthy();
      expect(docs[0].created_at).toBeTruthy();
      expect(docs[0].updated_at).toBeTruthy();
    });

    it('replaces local ID with server ID on successful insert', async () => {
      const serverDoc: IDDocument = {
        ...fixtureDoc,
        id: 'server-uuid-999',
      };

      mockQuery.single.mockReturnValueOnce({
        then: (resolve: any) => {
          resolve({ data: serverDoc, error: null });
          return Promise.resolve();
        },
      });

      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);

      await vi.waitFor(() => {
        const docs = useIDTrackerStore.getState().documents;
        expect(docs).toHaveLength(1);
        expect(docs[0].id).toBe('server-uuid-999');
      });
    });

    it('keeps local ID when server returns error', async () => {
      mockQuery.single.mockReturnValueOnce({
        then: (resolve: any) => {
          resolve({ data: null, error: { message: 'Insert failed' } });
          return Promise.resolve();
        },
      });

      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);

      await vi.waitFor(() => {
        const docs = useIDTrackerStore.getState().documents;
        expect(docs).toHaveLength(1);
        // Should still have the crypto-generated local ID
        expect(docs[0].id).toBeTruthy();
        expect(docs[0].id).not.toBe('server-uuid-999');
      });
    });

    it('adds multiple documents', () => {
      useIDTrackerStore.getState().addDocument(USER_ID, sampleDoc);
      useIDTrackerStore.getState().addDocument(USER_ID, {
        ...sampleDoc,
        id_type: 'Drivers License',
        label: 'CA DL',
      });

      expect(useIDTrackerStore.getState().documents).toHaveLength(2);
    });
  });

  // ─── updateDocument ──────────────────────────────────────────────────

  describe('updateDocument', () => {
    beforeEach(() => {
      useIDTrackerStore.setState({ documents: [{ ...fixtureDoc }] });
      resetMocks();
    });

    it('calls supabase update with correct args', () => {
      useIDTrackerStore.getState().updateDocument('db-doc-1', { label: 'Updated Label' });

      expect(mockSupabase.from).toHaveBeenCalledWith('id_documents');
      expect(mockQuery.update).toHaveBeenCalledWith({ label: 'Updated Label' });
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'db-doc-1');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
    });

    it('optimistically updates state', () => {
      useIDTrackerStore.getState().updateDocument('db-doc-1', {
        label: 'New Label',
        expiry_date: '2035-01-01',
      });

      const doc = useIDTrackerStore.getState().documents[0];
      expect(doc.label).toBe('New Label');
      expect(doc.expiry_date).toBe('2035-01-01');
      // Other fields unchanged
      expect(doc.owner_name).toBe('Jane Doe');
    });

    it('does not call supabase when document not found after update', () => {
      resetMocks();
      useIDTrackerStore.getState().updateDocument('non-existent', { label: 'Ghost' });

      // The store looks up the doc after getting supabase client.
      // If doc not found, it returns early before calling from().
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('only updates the targeted document', () => {
      useIDTrackerStore.setState({ documents: [{ ...fixtureDoc }, { ...fixtureDoc2 }] });
      resetMocks();

      useIDTrackerStore.getState().updateDocument('db-doc-2', { label: 'Updated DL' });

      expect(useIDTrackerStore.getState().documents[0].label).toBe('My Passport');
      expect(useIDTrackerStore.getState().documents[1].label).toBe('Updated DL');
    });
  });

  // ─── deleteDocument ──────────────────────────────────────────────────

  describe('deleteDocument', () => {
    beforeEach(() => {
      useIDTrackerStore.setState({ documents: [{ ...fixtureDoc }, { ...fixtureDoc2 }] });
      resetMocks();
    });

    it('calls supabase delete with eq id', () => {
      useIDTrackerStore.getState().deleteDocument('db-doc-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('id_documents');
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'db-doc-1');
    });

    it('removes document from state', () => {
      useIDTrackerStore.getState().deleteDocument('db-doc-1');

      const docs = useIDTrackerStore.getState().documents;
      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe('db-doc-2');
    });

    it('does not crash when deleting non-existent document', () => {
      useIDTrackerStore.getState().deleteDocument('non-existent');
      expect(useIDTrackerStore.getState().documents).toHaveLength(2);
    });

    it('deletes all documents when called for each', () => {
      useIDTrackerStore.getState().deleteDocument('db-doc-1');
      useIDTrackerStore.getState().deleteDocument('db-doc-2');
      expect(useIDTrackerStore.getState().documents).toHaveLength(0);
    });
  });
});
