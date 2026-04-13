import { create } from 'zustand';
import type {
  CricketSplit,
  CricketSplitShare,
  CricketSplitSettlement,
} from '@/types/cricket';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

function getCurrentTeamId(): string | null {
  return useAuthStore.getState().currentTeamId;
}

function requireTeamId(): string | null {
  const teamId = getCurrentTeamId();
  if (!teamId) {
    console.warn('[splits] team_id is null — data may be orphaned.');
    toast.error('Team not loaded yet. Please refresh and try again.');
  }
  return teamId;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface SplitsState {
  splits: CricketSplit[];
  shares: CricketSplitShare[];
  settlements: CricketSplitSettlement[];
  loading: boolean;

  // UI state
  showSplitForm: boolean;
  showSettleForm: boolean;
  settleTarget: { fromId: string; toId: string; amount: number } | null;
  editingSplitId: string | null;

  // Actions
  loadSplits: (seasonId: string) => Promise<void>;
  addSplit: (
    userId: string,
    seasonId: string,
    data: { paid_by: string; category: string; description: string; amount: number; split_date: string },
    playerShares: { player_id: string; share_amount: number }[],
    createdBy?: string,
  ) => void;
  updateSplit: (
    id: string,
    data: { paid_by: string; category: string; description: string; amount: number; split_date: string },
    playerShares: { player_id: string; share_amount: number }[],
  ) => void;
  deleteSplit: (id: string, deletedBy?: string) => void;
  addSplitSettlement: (
    userId: string,
    seasonId: string,
    data: { from_player: string; to_player: string; amount: number; settled_date: string },
  ) => void;
  deleteSplitSettlement: (id: string) => void;
}

export const useSplitsStore = create<SplitsState>((set, get) => ({
  splits: [],
  shares: [],
  settlements: [],
  loading: false,

  showSplitForm: false,
  showSettleForm: false,
  settleTarget: null,
  editingSplitId: null,

  loadSplits: async (seasonId: string) => {
    if (!isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = getCurrentTeamId();
    if (!teamId) return;

    set({ loading: true });

    // Load splits first, then filter shares by split IDs (no unscoped query)
    const [splitsRes, settlementsRes] = await Promise.all([
      supabase.from('cricket_splits').select('*').eq('team_id', teamId).eq('season_id', seasonId),
      supabase.from('cricket_split_settlements').select('*').eq('team_id', teamId).eq('season_id', seasonId),
    ]);

    const loadedSplits = (splitsRes.data ?? []) as CricketSplit[];
    const splitIds = loadedSplits.map((s) => s.id);

    // Only fetch shares for splits we loaded — never fetch unscoped
    const sharesRes = splitIds.length > 0
      ? await supabase.from('cricket_split_shares').select('*').in('split_id', splitIds)
      : { data: [] };

    set({
      splits: loadedSplits,
      shares: (sharesRes.data ?? []) as CricketSplitShare[],
      settlements: (settlementsRes.data ?? []) as CricketSplitSettlement[],
      loading: false,
    });
  },

  addSplit: (userId, seasonId, data, playerShares, createdBy) => {
    const now = new Date().toISOString();
    const splitId = genId();
    const teamId = requireTeamId();
    if (!teamId) return;

    const newSplit: CricketSplit = {
      id: splitId, team_id: teamId ?? '', season_id: seasonId,
      paid_by: data.paid_by, category: data.category as CricketSplit['category'],
      description: data.description, amount: data.amount,
      split_date: data.split_date, created_by: createdBy ?? null,
      deleted_at: null, deleted_by: null, created_at: now, updated_at: now,
    };

    const newShares: CricketSplitShare[] = playerShares.map((s) => ({
      id: genId(), split_id: splitId, player_id: s.player_id, share_amount: s.share_amount,
    }));

    set({
      splits: [newSplit, ...get().splits],
      shares: [...newShares, ...get().shares],
    });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      supabase.from('cricket_splits')
        .insert({
          season_id: seasonId, paid_by: data.paid_by,
          category: data.category, description: data.description,
          amount: data.amount, split_date: data.split_date,
          created_by: createdBy ?? null, team_id: teamId,
        })
        .select().single()
        .then(({ data: row, error }: { data: CricketSplit | null; error: unknown }) => {
          if (error) { console.error('[splits] addSplit failed:', error); toast.error('Couldn\'t save split.'); return; }
          if (row) {
            set({ splits: get().splits.map((s) => s.id === splitId ? row : s) });
            const dbShares = playerShares.map((s) => ({
              split_id: row.id, player_id: s.player_id, share_amount: s.share_amount,
            }));
            supabase.from('cricket_split_shares').insert(dbShares).select()
              .then(({ data: shareRows, error: shareError }: { data: CricketSplitShare[] | null; error: unknown }) => {
                if (shareError) console.error('[splits] shares insert failed:', shareError);
                if (shareRows) {
                  const localIds = new Set(newShares.map((s) => s.id));
                  set({ shares: [...shareRows, ...get().shares.filter((s) => !localIds.has(s.id))] });
                }
              });
            toast.success('Split added');
          }
        });
    }
  },

  updateSplit: (id, data, playerShares) => {
    const now = new Date().toISOString();

    // Optimistic update
    set({
      splits: get().splits.map((s) => s.id === id ? {
        ...s, paid_by: data.paid_by, category: data.category as CricketSplit['category'],
        description: data.description, amount: data.amount,
        split_date: data.split_date, updated_at: now,
      } : s),
      shares: [
        ...get().shares.filter((sh) => sh.split_id !== id),
        ...playerShares.map((s) => ({ id: genId(), split_id: id, player_id: s.player_id, share_amount: s.share_amount })),
      ],
    });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      // Update the split row
      supabase.from('cricket_splits')
        .update({ paid_by: data.paid_by, category: data.category, description: data.description, amount: data.amount, split_date: data.split_date })
        .eq('id', id)
        .then(({ error }: { error: unknown }) => {
          if (error) { console.error('[splits] update failed:', error); toast.error('Couldn\'t update split.'); return; }
          // Delete old shares and insert new ones
          supabase.from('cricket_split_shares').delete().eq('split_id', id).then(() => {
            const dbShares = playerShares.map((s) => ({ split_id: id, player_id: s.player_id, share_amount: s.share_amount }));
            supabase.from('cricket_split_shares').insert(dbShares).select()
              .then(({ data: rows, error: shErr }: { data: CricketSplitShare[] | null; error: unknown }) => {
                if (shErr) console.error('[splits] shares update failed:', shErr);
                if (rows) {
                  set({ shares: [...rows, ...get().shares.filter((sh) => sh.split_id !== id)] });
                }
              });
          });
          toast.success('Split updated');
        });
    }
  },

  deleteSplit: (id, deletedBy) => {
    const now = new Date().toISOString();
    set({
      splits: get().splits.map((s) => s.id === id ? { ...s, deleted_at: now, deleted_by: deletedBy ?? null } : s),
      shares: get().shares.filter((sh) => sh.split_id !== id),
    });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_splits').update({ deleted_at: now, deleted_by: deletedBy ?? null }).eq('id', id)
        .then(({ error }: { error: unknown }) => {
          if (error) { console.error('[splits] delete failed:', error); toast.error('Couldn\'t delete split.'); }
          else {
            supabase.from('cricket_split_shares').delete().eq('split_id', id).then(() => {});
            toast.success('Split deleted');
          }
        });
    }
  },

  addSplitSettlement: (userId, seasonId, data) => {
    const now = new Date().toISOString();
    const localId = genId();
    const teamId = requireTeamId();
    if (!teamId) return;

    const newSettlement: CricketSplitSettlement = {
      id: localId, team_id: teamId ?? '', season_id: seasonId,
      ...data, created_at: now,
    };
    set({ settlements: [newSettlement, ...get().settlements] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_split_settlements')
        .insert({ season_id: seasonId, ...data, team_id: teamId })
        .select().single()
        .then(({ data: row, error }: { data: CricketSplitSettlement | null; error: unknown }) => {
          if (error) { console.error('[splits] settlement failed:', error); toast.error('Couldn\'t save settlement.'); }
          if (row) {
            set({ settlements: get().settlements.map((s) => s.id === localId ? row : s) });
            // Toast with undo is shown by the SplitSettleDrawer component
          }
        });
    }
  },

  deleteSplitSettlement: (id) => {
    set({ settlements: get().settlements.filter((s) => s.id !== id) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_split_settlements').delete().eq('id', id)
        .then(({ error }: { error: unknown }) => {
          if (error) { console.error('[splits] delete settlement failed:', error); toast.error('Couldn\'t delete settlement.'); }
          else toast.success('Settlement deleted');
        });
    }
  },
}));
