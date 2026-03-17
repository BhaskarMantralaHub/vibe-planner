import { create } from 'zustand';
import type {
  CricketPlayer,
  CricketSeason,
  CricketExpense,
  CricketExpenseSplit,
  CricketSettlement,
} from '@/types/cricket';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { computeSplitAmounts } from '@/app/(tools)/cricket/lib/utils';

const LOCAL_KEY = 'cricket_data';

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface LocalData {
  players: CricketPlayer[];
  seasons: CricketSeason[];
  expenses: CricketExpense[];
  splits: CricketExpenseSplit[];
  settlements: CricketSettlement[];
}

function localLoad(): LocalData {
  if (typeof window === 'undefined') return { players: [], seasons: [], expenses: [], splits: [], settlements: [] };
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { players: [], seasons: [], expenses: [], splits: [], settlements: [] };
    return JSON.parse(raw) as LocalData;
  } catch {
    return { players: [], seasons: [], expenses: [], splits: [], settlements: [] };
  }
}

function localSave(data: LocalData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    // Storage full
  }
}

interface CricketState {
  players: CricketPlayer[];
  seasons: CricketSeason[];
  expenses: CricketExpense[];
  splits: CricketExpenseSplit[];
  settlements: CricketSettlement[];
  loading: boolean;
  selectedSeasonId: string | null;

  // UI state
  showPlayerForm: boolean;
  showExpenseForm: boolean;
  showSettleForm: boolean;
  editingPlayer: string | null;

  // Actions
  loadAll: (userId: string) => Promise<void>;

  // Players
  addPlayer: (userId: string, data: { name: string; jersey_number: number | null; phone: string | null; player_role: string | null; batting_style: string | null; bowling_style: string | null }) => void;
  updatePlayer: (id: string, updates: Partial<CricketPlayer>) => void;
  removePlayer: (id: string) => void;

  // Seasons
  addSeason: (userId: string, data: { name: string; year: number; season_type: string }) => void;
  setSelectedSeason: (id: string | null) => void;

  // Expenses
  addExpense: (
    userId: string,
    seasonId: string,
    data: { paid_by: string; category: string; description: string; amount: number; expense_date: string },
    splitPlayerIds: string[],
  ) => void;
  deleteExpense: (id: string) => void;

  // Settlements
  addSettlement: (
    userId: string,
    seasonId: string,
    data: { from_player: string; to_player: string; amount: number; settled_date: string },
  ) => void;
  deleteSettlement: (id: string) => void;

  // UI
  setShowPlayerForm: (show: boolean) => void;
  setShowExpenseForm: (show: boolean) => void;
  setShowSettleForm: (show: boolean) => void;
  setEditingPlayer: (id: string | null) => void;
}

export const useCricketStore = create<CricketState>((set, get) => ({
  players: [],
  seasons: [],
  expenses: [],
  splits: [],
  settlements: [],
  loading: true,
  selectedSeasonId: null,

  showPlayerForm: false,
  showExpenseForm: false,
  showSettleForm: false,
  editingPlayer: null,

  loadAll: async (userId: string) => {
    set({ loading: true });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) { set({ loading: false }); return; }

      const [playersRes, seasonsRes, expensesRes, splitsRes, settlementsRes] = await Promise.all([
        supabase.from('cricket_players').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('cricket_seasons').select('*').eq('user_id', userId).order('year', { ascending: false }),
        supabase.from('cricket_expenses').select('*').eq('user_id', userId).order('expense_date', { ascending: false }),
        supabase.from('cricket_expense_splits').select('*, cricket_expenses!inner(user_id)').eq('cricket_expenses.user_id', userId),
        supabase.from('cricket_settlements').select('*').eq('user_id', userId).order('settled_date', { ascending: false }),
      ]);

      const players = (playersRes.data ?? []) as CricketPlayer[];
      const seasons = (seasonsRes.data ?? []) as CricketSeason[];
      const expenses = (expensesRes.data ?? []) as CricketExpense[];
      const splits = ((splitsRes.data ?? []) as (CricketExpenseSplit & { cricket_expenses?: unknown })[]).map(
        ({ cricket_expenses: _, ...s }) => s as CricketExpenseSplit,
      );
      const settlements = (settlementsRes.data ?? []) as CricketSettlement[];

      // Auto-select first active season
      const selectedSeasonId = seasons.find((s) => s.is_active)?.id ?? seasons[0]?.id ?? null;
      set({ players, seasons, expenses, splits, settlements, selectedSeasonId, loading: false });
    } else {
      const data = localLoad();
      const selectedSeasonId = data.seasons[0]?.id ?? null;
      set({ ...data, selectedSeasonId, loading: false });
    }
  },

  // ── Players ──────────────────────────────────────────────────────────

  addPlayer: (userId, data) => {
    const now = new Date().toISOString();
    const localId = genId();
    const newPlayer: CricketPlayer = {
      id: localId, user_id: userId, ...data,
      player_role: data.player_role as CricketPlayer['player_role'],
      batting_style: data.batting_style as CricketPlayer['batting_style'],
      bowling_style: data.bowling_style as CricketPlayer['bowling_style'],
      is_active: true, created_at: now, updated_at: now,
    };
    set({ players: [...get().players, newPlayer] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_players')
        .insert({
          user_id: userId, name: data.name, jersey_number: data.jersey_number,
          phone: data.phone, player_role: data.player_role,
          batting_style: data.batting_style, bowling_style: data.bowling_style,
        })
        .select().single()
        .then(({ data: row }: { data: CricketPlayer | null }) => {
          if (row) set({ players: get().players.map((p) => p.id === localId ? row : p) });
        });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  updatePlayer: (id, updates) => {
    set({ players: get().players.map((p) => p.id === id ? { ...p, ...updates } : p) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_players').update(updates).eq('id', id).then(() => {});
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  removePlayer: (id) => {
    // Soft deactivate
    set({ players: get().players.map((p) => p.id === id ? { ...p, is_active: false } : p) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_players').update({ is_active: false }).eq('id', id).then(() => {});
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  // ── Seasons ──────────────────────────────────────────────────────────

  addSeason: (userId, data) => {
    const now = new Date().toISOString();
    const localId = genId();
    const newSeason: CricketSeason = {
      id: localId, user_id: userId, ...data, season_type: data.season_type as CricketSeason['season_type'],
      share_token: genId(), is_active: true, created_at: now, updated_at: now,
    };
    set({ seasons: [newSeason, ...get().seasons], selectedSeasonId: localId });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_seasons')
        .insert({ user_id: userId, name: data.name, year: data.year, season_type: data.season_type })
        .select().single()
        .then(({ data: row }: { data: CricketSeason | null }) => {
          if (row) {
            set({
              seasons: get().seasons.map((s) => s.id === localId ? row : s),
              selectedSeasonId: get().selectedSeasonId === localId ? row.id : get().selectedSeasonId,
            });
          }
        });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  setSelectedSeason: (id) => set({ selectedSeasonId: id }),

  // ── Expenses ─────────────────────────────────────────────────────────

  addExpense: (userId, seasonId, data, splitPlayerIds) => {
    const now = new Date().toISOString();
    const expenseId = genId();
    const newExpense: CricketExpense = {
      id: expenseId, user_id: userId, season_id: seasonId,
      paid_by: data.paid_by, category: data.category as CricketExpense['category'],
      description: data.description, amount: data.amount,
      expense_date: data.expense_date, created_at: now, updated_at: now,
    };

    const amounts = computeSplitAmounts(data.amount, splitPlayerIds.length);
    const newSplits: CricketExpenseSplit[] = splitPlayerIds.map((playerId, i) => ({
      id: genId(), expense_id: expenseId, player_id: playerId, share_amount: amounts[i],
    }));

    set({
      expenses: [newExpense, ...get().expenses],
      splits: [...get().splits, ...newSplits],
    });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      supabase.from('cricket_expenses')
        .insert({
          user_id: userId, season_id: seasonId, paid_by: data.paid_by,
          category: data.category, description: data.description,
          amount: data.amount, expense_date: data.expense_date,
        })
        .select().single()
        .then(({ data: row }: { data: CricketExpense | null }) => {
          if (!row) return;
          // Update local expense with real ID
          set({ expenses: get().expenses.map((e) => e.id === expenseId ? row : e) });

          // Insert splits with real expense ID
          const splitInserts = splitPlayerIds.map((playerId, i) => ({
            expense_id: row.id, player_id: playerId, share_amount: amounts[i],
          }));
          supabase.from('cricket_expense_splits').insert(splitInserts).select()
            .then(({ data: rows }: { data: CricketExpenseSplit[] | null }) => {
              if (rows) {
                // Replace local splits for this expense with real ones
                set({
                  splits: [
                    ...get().splits.filter((s) => s.expense_id !== expenseId),
                    ...rows,
                  ],
                });
              }
            });
        });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  deleteExpense: (id) => {
    set({
      expenses: get().expenses.filter((e) => e.id !== id),
      splits: get().splits.filter((s) => s.expense_id !== id),
    });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_expenses').delete().eq('id', id).then(() => {});
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  // ── Settlements ──────────────────────────────────────────────────────

  addSettlement: (userId, seasonId, data) => {
    const now = new Date().toISOString();
    const localId = genId();
    const newSettlement: CricketSettlement = {
      id: localId, user_id: userId, season_id: seasonId, ...data, created_at: now,
    };
    set({ settlements: [newSettlement, ...get().settlements] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_settlements')
        .insert({ user_id: userId, season_id: seasonId, ...data })
        .select().single()
        .then(({ data: row }: { data: CricketSettlement | null }) => {
          if (row) set({ settlements: get().settlements.map((s) => s.id === localId ? row : s) });
        });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  deleteSettlement: (id) => {
    set({ settlements: get().settlements.filter((s) => s.id !== id) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_settlements').delete().eq('id', id).then(() => {});
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  // ── UI ───────────────────────────────────────────────────────────────

  setShowPlayerForm: (showPlayerForm) => set({ showPlayerForm }),
  setShowExpenseForm: (showExpenseForm) => set({ showExpenseForm }),
  setShowSettleForm: (showSettleForm) => set({ showSettleForm }),
  setEditingPlayer: (editingPlayer) => set({ editingPlayer }),
}));
