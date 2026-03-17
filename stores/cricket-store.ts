import { create } from 'zustand';
import type {
  CricketPlayer,
  CricketSeason,
  CricketExpense,
  CricketExpenseSplit,
  CricketSettlement,
  CricketSeasonFee,
} from '@/types/cricket';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { computeSplitAmounts } from '@/app/(tools)/cricket/lib/utils';

const LOCAL_KEY = 'cricket_data';

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function pickCurrentSeason(seasons: CricketSeason[]): string | null {
  if (seasons.length === 0) return null;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  // Map months to season types: Mar-May=spring, Jun-Sep=summer, Oct-Feb=fall
  const currentType = month >= 2 && month <= 4 ? 'spring'
    : month >= 5 && month <= 8 ? 'summer' : 'fall';

  // Try exact match: current type + current year
  const exact = seasons.find((s) => s.season_type === currentType && s.year === year);
  if (exact) return exact.id;

  // Try current year, any type
  const sameYear = seasons.find((s) => s.year === year);
  if (sameYear) return sameYear.id;

  // Fallback: most recent season
  const sorted = [...seasons].sort((a, b) => b.year - a.year);
  return sorted[0]?.id ?? null;
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
  fees: CricketSeasonFee[];
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
  addPlayer: (userId: string, data: { name: string; jersey_number: number | null; phone: string | null; player_role: string | null; batting_style: string | null; bowling_style: string | null; cricclub_id: string | null; shirt_size: string | null; email: string | null; designation: string | null }) => void;
  updatePlayer: (id: string, updates: Partial<CricketPlayer>) => void;
  removePlayer: (id: string) => void;

  // Seasons
  addSeason: (userId: string, data: { name: string; year: number; season_type: string }) => void;
  updateSeason: (id: string, updates: Partial<CricketSeason>) => void;
  setSelectedSeason: (id: string | null) => void;

  // Expenses
  addExpense: (
    userId: string,
    seasonId: string,
    data: { category: string; description: string; amount: number; expense_date: string },
  ) => void;
  updateExpense: (id: string, updates: Partial<CricketExpense>) => void;
  deleteExpense: (id: string, deletedBy?: string) => void;
  restoreExpense: (id: string) => void;

  // Settlements
  addSettlement: (
    userId: string,
    seasonId: string,
    data: { from_player: string; to_player: string; amount: number; settled_date: string },
  ) => void;
  deleteSettlement: (id: string) => void;

  // Fees
  recordFee: (seasonId: string, playerId: string, amountPaid: number, markedBy?: string) => void;
  deleteFee: (id: string) => void;

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
  fees: [],
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

      // Load ALL team data — not filtered by user_id (shared team data)
      const [playersRes, seasonsRes, expensesRes, splitsRes, settlementsRes, feesRes] = await Promise.all([
        supabase.from('cricket_players').select('*').order('created_at'),
        supabase.from('cricket_seasons').select('*').order('year', { ascending: false }),
        supabase.from('cricket_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('cricket_expense_splits').select('*'),
        supabase.from('cricket_settlements').select('*').order('settled_date', { ascending: false }),
        supabase.from('cricket_season_fees').select('*').order('created_at'),
      ]);

      const players = (playersRes.data ?? []) as CricketPlayer[];
      const seasons = (seasonsRes.data ?? []) as CricketSeason[];
      const expenses = (expensesRes.data ?? []) as CricketExpense[];
      const splits = ((splitsRes.data ?? []) as (CricketExpenseSplit & { cricket_expenses?: unknown })[]).map(
        ({ cricket_expenses: _, ...s }) => s as CricketExpenseSplit,
      );
      const settlements = (settlementsRes.data ?? []) as CricketSettlement[];
      const fees = (feesRes.data ?? []) as CricketSeasonFee[];

      const selectedSeasonId = pickCurrentSeason(seasons);
      set({ players, seasons, expenses, splits, settlements, fees, selectedSeasonId, loading: false });
    } else {
      const data = localLoad();
      const selectedSeasonId = pickCurrentSeason(data.seasons);
      set({ ...data, fees: [], selectedSeasonId, loading: false });
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
      cricclub_id: data.cricclub_id,
      shirt_size: data.shirt_size,
      email: data.email,
      designation: data.designation as CricketPlayer['designation'],
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
          cricclub_id: data.cricclub_id, shirt_size: data.shirt_size, email: data.email, designation: data.designation,
        })
        .select().single()
        .then(({ data: row, error }: { data: CricketPlayer | null; error: unknown }) => {
          if (error) console.error('[cricket] addPlayer failed:', error);
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
      share_token: genId(), fee_amount: 60, is_active: true, created_at: now, updated_at: now,
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

  updateSeason: (id, updates) => {
    set({ seasons: get().seasons.map((s) => s.id === id ? { ...s, ...updates } : s) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_seasons').update(updates).eq('id', id).then(() => {});
    }
  },

  setSelectedSeason: (id) => set({ selectedSeasonId: id }),

  // ── Expenses ─────────────────────────────────────────────────────────

  addExpense: (userId, seasonId, data) => {
    const now = new Date().toISOString();
    const expenseId = genId();
    const newExpense: CricketExpense = {
      id: expenseId, user_id: userId, season_id: seasonId,
      paid_by: userId, category: data.category as CricketExpense['category'],
      description: data.description, amount: data.amount,
      expense_date: data.expense_date, created_at: now, updated_at: now,
    };

    set({ expenses: [newExpense, ...get().expenses] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      supabase.from('cricket_expenses')
        .insert({
          user_id: userId, season_id: seasonId,
          category: data.category, description: data.description,
          amount: data.amount, expense_date: data.expense_date,
        })
        .select().single()
        .then(({ data: row, error }: { data: CricketExpense | null; error: unknown }) => {
          if (error) console.error('[cricket] addExpense failed:', error);
          if (row) set({ expenses: get().expenses.map((e) => e.id === expenseId ? row : e) });
        });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  updateExpense: (id, updates) => {
    set({ expenses: get().expenses.map((e) => e.id === id ? { ...e, ...updates } : e) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_expenses').update(updates).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) console.error('[cricket] updateExpense failed:', error);
      });
    }
  },

  deleteExpense: (id, deletedBy) => {
    const now = new Date().toISOString();
    set({
      expenses: get().expenses.map((e) => e.id === id ? { ...e, deleted_at: now, deleted_by: deletedBy ?? null } : e),
    });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_expenses').update({ deleted_at: now, deleted_by: deletedBy ?? null }).eq('id', id).then(() => {});
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  restoreExpense: (id) => {
    set({
      expenses: get().expenses.map((e) => e.id === id ? { ...e, deleted_at: null, deleted_by: null } : e),
    });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_expenses').update({ deleted_at: null, deleted_by: null }).eq('id', id).then(() => {});
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

  // ── Fees ──────────────────────────────────────────────────────────────

  recordFee: (seasonId, playerId, amountPaid, markedBy) => {
    const localId = genId();
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const by = markedBy ?? null;

    // Check if fee already exists for this player+season — update it
    const existing = get().fees.find((f) => f.season_id === seasonId && f.player_id === playerId);
    if (existing) {
      set({ fees: get().fees.map((f) => f.id === existing.id ? { ...f, amount_paid: amountPaid, paid_date: today, marked_by: by } : f) });
      if (isCloudMode()) {
        const supabase = getSupabaseClient();
        supabase?.from('cricket_season_fees').update({ amount_paid: amountPaid, paid_date: today, marked_by: by }).eq('id', existing.id).then(() => {});
      }
      return;
    }

    const newFee: CricketSeasonFee = { id: localId, season_id: seasonId, player_id: playerId, amount_paid: amountPaid, paid_date: today, marked_by: by, created_at: now };
    set({ fees: [...get().fees, newFee] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_season_fees')
        .insert({ season_id: seasonId, player_id: playerId, amount_paid: amountPaid, paid_date: today, marked_by: by })
        .select().single()
        .then(({ data: row }: { data: CricketSeasonFee | null }) => {
          if (row) set({ fees: get().fees.map((f) => f.id === localId ? row : f) });
        });
    }
  },

  deleteFee: (id) => {
    set({ fees: get().fees.filter((f) => f.id !== id) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_season_fees').delete().eq('id', id).then(() => {});
    }
  },

  // ── UI ───────────────────────────────────────────────────────────────

  setShowPlayerForm: (showPlayerForm) => set({ showPlayerForm }),
  setShowExpenseForm: (showExpenseForm) => set({ showExpenseForm }),
  setShowSettleForm: (showSettleForm) => set({ showSettleForm }),
  setEditingPlayer: (editingPlayer) => set({ editingPlayer }),
}));
