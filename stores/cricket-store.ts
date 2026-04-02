import { create } from 'zustand';
import type {
  CricketPlayer,
  CricketSeason,
  CricketExpense,
  CricketExpenseSplit,
  CricketSettlement,
  CricketSeasonFee,
  CricketSponsorship,
  GalleryPost,
  GalleryTag,
  GalleryComment,
  GalleryLike,
  CommentReaction,
  GalleryNotification,
} from '@/types/cricket';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { computeSplitAmounts } from '@/app/(tools)/cricket/lib/utils';

const LOCAL_KEY = 'cricket_data';
const GALLERY_PAGE_SIZE = 20;

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
  sponsorships: CricketSponsorship[];
  gallery: GalleryPost[];
  galleryTags: GalleryTag[];
  galleryComments: GalleryComment[];
  galleryLikes: GalleryLike[];
  commentReactions: CommentReaction[];
  notifications: GalleryNotification[];
  loading: boolean;
  loadingMoreGallery: boolean;
  hasMoreGallery: boolean;
  galleryOffset: number;
  selectedSeasonId: string | null;

  // UI state
  showPlayerForm: boolean;
  showExpenseForm: boolean;
  showSettleForm: boolean;
  editingPlayer: string | null;

  // Actions
  loadAll: (userId: string) => Promise<void>;
  loadMoments: (userId: string) => Promise<void>;
  loadMoreGallery: () => Promise<void>;

  // Players
  addPlayer: (userId: string, data: { name: string; jersey_number: number | null; phone: string | null; player_role: string | null; batting_style: string | null; bowling_style: string | null; cricclub_id: string | null; shirt_size: string | null; email: string | null; designation: string | null; photo_url?: string | null; is_guest?: boolean }) => void;
  updatePlayer: (id: string, updates: Partial<CricketPlayer>) => void;
  removePlayer: (id: string) => void;
  restorePlayer: (id: string) => void;

  // Seasons
  addSeason: (userId: string, data: { name: string; year: number; season_type: string }) => void;
  updateSeason: (id: string, updates: Partial<CricketSeason>) => void;
  setSelectedSeason: (id: string | null) => void;

  // Expenses
  addExpense: (
    userId: string,
    seasonId: string,
    data: { category: string; description: string; amount: number; expense_date: string },
    createdBy?: string,
  ) => void;
  updateExpense: (id: string, updates: Partial<CricketExpense>, updatedBy?: string) => void;
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

  // Sponsorships
  addSponsorship: (seasonId: string, data: { sponsor_name: string; amount: number; sponsored_date: string; notes: string | null }, createdBy?: string) => void;
  updateSponsorship: (id: string, updates: Partial<CricketSponsorship>, updatedBy?: string) => void;
  deleteSponsorship: (id: string, deletedBy?: string) => void;
  restoreSponsorship: (id: string) => void;

  // Gallery
  addGalleryPost: (userId: string, seasonId: string, photoUrls: string[], caption: string | null, postedBy: string | null, tagPlayerIds: string[]) => void;
  updateGalleryPost: (id: string, caption: string | null, newTagPlayerIds: string[]) => void;
  deleteGalleryPost: (id: string) => void;
  addGalleryComment: (postId: string, userId: string, commentBy: string | null, text: string) => void;
  updateGalleryComment: (id: string, text: string) => void;
  deleteGalleryComment: (id: string) => void;
  toggleGalleryLike: (postId: string, userId: string, likerName?: string) => void;
  toggleCommentReaction: (commentId: string, userId: string, emoji: string) => void;
  createNotifications: (postId: string, recipientUserIds: string[], type: 'tag' | 'comment' | 'like', message: string) => void;
  markNotificationsRead: () => void;
  clearNotifications: () => void;

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
  sponsorships: [],
  gallery: [],
  galleryTags: [],
  galleryComments: [],
  galleryLikes: [],
  commentReactions: [],
  notifications: [],
  loading: true,
  loadingMoreGallery: false,
  hasMoreGallery: false,
  galleryOffset: 0,
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
      const [playersRes, seasonsRes, expensesRes, splitsRes, settlementsRes, feesRes, sponsorsRes, galleryRes, galleryTagsRes, galleryCommentsRes, galleryLikesRes, commentReactionsRes, notificationsRes] = await Promise.all([
        supabase.from('cricket_players').select('*').order('created_at'),
        supabase.from('cricket_seasons').select('*').order('year', { ascending: false }),
        supabase.from('cricket_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('cricket_expense_splits').select('*'),
        supabase.from('cricket_settlements').select('*').order('settled_date', { ascending: false }),
        supabase.from('cricket_season_fees').select('*').order('created_at'),
        supabase.from('cricket_sponsorships').select('*').order('created_at'),
        supabase.from('cricket_gallery').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(GALLERY_PAGE_SIZE),
        supabase.from('cricket_gallery_tags').select('*'),
        supabase.from('cricket_gallery_comments').select('*').order('created_at'),
        supabase.from('cricket_gallery_likes').select('*'),
        supabase.from('cricket_comment_reactions').select('*'),
        supabase.from('cricket_notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      ]);

      const players = (playersRes.data ?? []) as CricketPlayer[];
      const seasons = (seasonsRes.data ?? []) as CricketSeason[];
      const expenses = (expensesRes.data ?? []) as CricketExpense[];
      const splits = ((splitsRes.data ?? []) as (CricketExpenseSplit & { cricket_expenses?: unknown })[]).map(
        ({ cricket_expenses: _, ...s }) => s as CricketExpenseSplit,
      );
      const settlements = (settlementsRes.data ?? []) as CricketSettlement[];
      const fees = (feesRes.data ?? []) as CricketSeasonFee[];
      const sponsorships = (sponsorsRes.data ?? []) as CricketSponsorship[];
      const gallery = (galleryRes.data ?? []) as GalleryPost[];
      const galleryTags = (galleryTagsRes.data ?? []) as GalleryTag[];
      const galleryComments = (galleryCommentsRes.data ?? []) as GalleryComment[];
      const galleryLikes = (galleryLikesRes.data ?? []) as GalleryLike[];
      const commentReactions = (commentReactionsRes.data ?? []) as CommentReaction[];
      const notifications = (notificationsRes.data ?? []) as GalleryNotification[];

      const selectedSeasonId = pickCurrentSeason(seasons);
      const hasMoreGallery = gallery.length === GALLERY_PAGE_SIZE;
      set({ players, seasons, expenses, splits, settlements, fees, sponsorships, gallery, galleryTags, galleryComments, galleryLikes, commentReactions, notifications, selectedSeasonId, hasMoreGallery, galleryOffset: gallery.length, loading: false });
    } else {
      const data = localLoad();
      const selectedSeasonId = pickCurrentSeason(data.seasons);
      set({ ...data, fees: [], selectedSeasonId, hasMoreGallery: false, galleryOffset: 0, loading: false });
    }
  },

  loadMoments: async (userId: string) => {
    set({ loading: true });

    if (!isCloudMode()) {
      const data = localLoad();
      const selectedSeasonId = pickCurrentSeason(data.seasons);
      set({ ...data, fees: [], selectedSeasonId, hasMoreGallery: false, galleryOffset: 0, loading: false });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) { set({ loading: false }); return; }

    // Batch 1: Gallery posts + essential context only (4 queries instead of 13)
    const [playersRes, seasonsRes, galleryRes, notificationsRes] = await Promise.all([
      supabase.from('cricket_players').select('*').order('created_at'),
      supabase.from('cricket_seasons').select('*').order('year', { ascending: false }),
      supabase.from('cricket_gallery').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(GALLERY_PAGE_SIZE),
      supabase.from('cricket_notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    ]);

    const players = (playersRes.data ?? []) as CricketPlayer[];
    const seasons = (seasonsRes.data ?? []) as CricketSeason[];
    const gallery = (galleryRes.data ?? []) as GalleryPost[];
    const notifications = (notificationsRes.data ?? []) as GalleryNotification[];
    const selectedSeasonId = pickCurrentSeason(seasons);
    const hasMoreGallery = gallery.length === GALLERY_PAGE_SIZE;
    const postIds = gallery.map((p) => p.id);

    if (postIds.length === 0) {
      set({ players, seasons, gallery, galleryTags: [], galleryComments: [], galleryLikes: [], commentReactions: [], notifications, selectedSeasonId, hasMoreGallery: false, galleryOffset: 0, loading: false });
      return;
    }

    // Batch 2: Related data scoped to loaded post IDs only
    const [tagsRes, commentsRes, likesRes, reactionsRes] = await Promise.all([
      supabase.from('cricket_gallery_tags').select('*').in('post_id', postIds),
      supabase.from('cricket_gallery_comments').select('*').in('post_id', postIds).order('created_at'),
      supabase.from('cricket_gallery_likes').select('*').in('post_id', postIds),
      supabase.from('cricket_comment_reactions').select('*'),
    ]);

    const galleryTags = (tagsRes.data ?? []) as GalleryTag[];
    const galleryComments = (commentsRes.data ?? []) as GalleryComment[];
    const galleryLikes = (likesRes.data ?? []) as GalleryLike[];
    const commentReactions = (reactionsRes.data ?? []) as CommentReaction[];

    set({ players, seasons, gallery, galleryTags, galleryComments, galleryLikes, commentReactions, notifications, selectedSeasonId, hasMoreGallery, galleryOffset: gallery.length, loading: false });
  },

  loadMoreGallery: async () => {
    const { hasMoreGallery, galleryOffset, loadingMoreGallery } = get();
    if (!hasMoreGallery || loadingMoreGallery) return;

    if (!isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    set({ loadingMoreGallery: true });

    const { data, error } = await supabase
      .from('cricket_gallery')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(galleryOffset, galleryOffset + GALLERY_PAGE_SIZE - 1);

    if (error) {
      console.error('[cricket] loadMoreGallery failed:', error);
      set({ loadingMoreGallery: false });
      return;
    }

    const newPosts = (data ?? []) as GalleryPost[];
    const hasMore = newPosts.length === GALLERY_PAGE_SIZE;
    const postIds = newPosts.map((p) => p.id);

    // Load related data for newly loaded posts
    if (postIds.length > 0) {
      const [tagsRes, commentsRes, likesRes] = await Promise.all([
        supabase.from('cricket_gallery_tags').select('*').in('post_id', postIds),
        supabase.from('cricket_gallery_comments').select('*').in('post_id', postIds).order('created_at'),
        supabase.from('cricket_gallery_likes').select('*').in('post_id', postIds),
      ]);

      const prev = get();
      set({
        gallery: [...prev.gallery, ...newPosts],
        galleryTags: [...prev.galleryTags, ...((tagsRes.data ?? []) as GalleryTag[])],
        galleryComments: [...prev.galleryComments, ...((commentsRes.data ?? []) as GalleryComment[])],
        galleryLikes: [...prev.galleryLikes, ...((likesRes.data ?? []) as GalleryLike[])],
        galleryOffset: galleryOffset + newPosts.length,
        hasMoreGallery: hasMore,
        loadingMoreGallery: false,
      });
    } else {
      set({
        galleryOffset: galleryOffset + newPosts.length,
        hasMoreGallery: hasMore,
        loadingMoreGallery: false,
      });
    }
  },

  // ── Players ──────────────────────────────────────────────────────────

  addPlayer: (userId, data) => {
    const now = new Date().toISOString();
    const localId = genId();
    // user_id is null for admin-created players — linked later when the player signs up
    const newPlayer: CricketPlayer = {
      id: localId, user_id: null, ...data,
      player_role: data.player_role as CricketPlayer['player_role'],
      batting_style: data.batting_style as CricketPlayer['batting_style'],
      bowling_style: data.bowling_style as CricketPlayer['bowling_style'],
      cricclub_id: data.cricclub_id,
      shirt_size: data.shirt_size,
      email: data.email,
      designation: data.designation as CricketPlayer['designation'],
      photo_url: data.photo_url ?? null,
      is_active: true, is_guest: data.is_guest ?? false, created_at: now, updated_at: now,
    };
    set({ players: [...get().players, newPlayer] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_players')
        .insert({
          name: data.name, jersey_number: data.jersey_number,
          phone: data.phone, player_role: data.player_role,
          batting_style: data.batting_style, bowling_style: data.bowling_style,
          cricclub_id: data.cricclub_id, shirt_size: data.shirt_size, email: data.email, designation: data.designation,
          photo_url: data.photo_url ?? null,
          is_guest: data.is_guest ?? false,
        })
        .select().single()
        .then(({ data: row, error }: { data: CricketPlayer | null; error: unknown }) => {
          if (error) { console.error('[cricket] addPlayer failed:', error); toast.error('Couldn\'t add player. Check your connection and try again.'); }
          if (row) { set({ players: get().players.map((p) => p.id === localId ? row : p) }); toast.success('Player added'); }
        });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  updatePlayer: (id, updates) => {
    const originalPlayer = get().players.find((p) => p.id === id);
    set({ players: get().players.map((p) => p.id === id ? { ...p, ...updates } : p) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_players').update(updates).eq('id', id).select().then(({ data, error }: { data: CricketPlayer[] | null; error: unknown }) => {
        if (error) {
          console.error('[cricket] updatePlayer failed:', error);
          if (originalPlayer) set({ players: get().players.map((p) => p.id === id ? originalPlayer : p) });
          toast.error('Couldn\'t save changes. Check your connection and try again.');
        } else if (!data || data.length === 0) {
          console.error('[cricket] updatePlayer: 0 rows updated — possible RLS restriction');
          if (originalPlayer) set({ players: get().players.map((p) => p.id === id ? originalPlayer : p) });
          toast.error('Update failed — the player may have been removed or your permissions changed.');
        } else {
          set({ players: get().players.map((p) => p.id === id ? { ...p, ...data[0] } : p) });
          // Name sync to profiles.full_name is handled by DB trigger (sync_player_name_to_profile)
          toast.success('Player updated');
        }
      });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  removePlayer: (id) => {
    set({ players: get().players.map((p) => p.id === id ? { ...p, is_active: false, designation: null } : p) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_players').update({ is_active: false, designation: null }).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) { console.error('[cricket] removePlayer failed:', error); toast.error('Couldn\'t remove player. Check your connection and try again.'); }
        else toast.success('Player removed');
      });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  restorePlayer: (id) => {
    set({ players: get().players.map((p) => p.id === id ? { ...p, is_active: true, designation: null } : p) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_players').update({ is_active: true, designation: null }).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) { console.error('[cricket] restorePlayer failed:', error); toast.error('Couldn\'t restore player. Check your connection and try again.'); }
        else toast.success('Player restored');
      });
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

  addExpense: (userId, seasonId, data, createdBy) => {
    const now = new Date().toISOString();
    const expenseId = genId();
    const newExpense: CricketExpense = {
      id: expenseId, user_id: userId, season_id: seasonId,
      paid_by: userId, category: data.category as CricketExpense['category'],
      description: data.description, amount: data.amount,
      expense_date: data.expense_date, created_by: createdBy ?? null, updated_by: null,
      deleted_at: null, deleted_by: null, created_at: now, updated_at: now,
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
          created_by: createdBy ?? null,
        })
        .select().single()
        .then(({ data: row, error }: { data: CricketExpense | null; error: unknown }) => {
          if (error) { console.error('[cricket] addExpense failed:', error); toast.error('Couldn\'t save expense. Check your connection and try again.'); }
          if (row) { set({ expenses: get().expenses.map((e) => e.id === expenseId ? row : e) }); toast.success('Expense added'); }
        });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  updateExpense: (id, updates, updatedBy) => {
    const merged = { ...updates, updated_by: updatedBy ?? null };
    set({ expenses: get().expenses.map((e) => e.id === id ? { ...e, ...merged } : e) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_expenses').update(merged).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) { console.error('[cricket] updateExpense failed:', error); toast.error('Couldn\'t update expense. Check your connection and try again.'); }
        else toast.success('Expense updated');
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
      supabase?.from('cricket_expenses').update({ deleted_at: now, deleted_by: deletedBy ?? null }).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) { console.error('[cricket] deleteExpense failed:', error); toast.error('Couldn\'t delete expense. Check your connection and try again.'); }
        else toast.success('Expense deleted');
      });
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
        .then(({ data: row, error }: { data: CricketSettlement | null; error: unknown }) => {
          if (error) { console.error('[cricket] addSettlement failed:', error); toast.error('Couldn\'t save settlement. Check your connection and try again.'); }
          if (row) { set({ settlements: get().settlements.map((s) => s.id === localId ? row : s) }); toast.success('Settlement recorded'); }
        });
    } else {
      localSave({ players: get().players, seasons: get().seasons, expenses: get().expenses, splits: get().splits, settlements: get().settlements });
    }
  },

  deleteSettlement: (id) => {
    set({ settlements: get().settlements.filter((s) => s.id !== id) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_settlements').delete().eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) { console.error('[cricket] deleteSettlement failed:', error); toast.error('Couldn\'t delete settlement. Check your connection and try again.'); }
        else toast.success('Settlement deleted');
      });
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

  // ── Sponsorships ──────────────────────────────────────────────────────

  addSponsorship: (seasonId, data, createdBy) => {
    const localId = genId();
    const now = new Date().toISOString();
    const newSponsorship: CricketSponsorship = {
      id: localId, season_id: seasonId, ...data,
      created_by: createdBy ?? null, updated_by: null,
      deleted_at: null, deleted_by: null,
      created_at: now, updated_at: now,
    };
    set({ sponsorships: [...get().sponsorships, newSponsorship] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_sponsorships')
        .insert({ season_id: seasonId, ...data, created_by: createdBy ?? null })
        .select().single()
        .then(({ data: row }: { data: CricketSponsorship | null }) => {
          if (row) set({ sponsorships: get().sponsorships.map((s) => s.id === localId ? row : s) });
        });
    }
  },

  updateSponsorship: (id, updates, updatedBy) => {
    const merged = { ...updates, updated_by: updatedBy ?? null };
    set({ sponsorships: get().sponsorships.map((s) => s.id === id ? { ...s, ...merged } : s) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_sponsorships').update(merged).eq('id', id).then(() => {});
    }
  },

  deleteSponsorship: (id, deletedBy) => {
    const now = new Date().toISOString();
    set({ sponsorships: get().sponsorships.map((s) => s.id === id ? { ...s, deleted_at: now, deleted_by: deletedBy ?? null } : s) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_sponsorships').update({ deleted_at: now, deleted_by: deletedBy ?? null }).eq('id', id).then(() => {});
    }
  },

  restoreSponsorship: (id) => {
    set({ sponsorships: get().sponsorships.map((s) => s.id === id ? { ...s, deleted_at: null, deleted_by: null } : s) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_sponsorships').update({ deleted_at: null, deleted_by: null }).eq('id', id).then(() => {});
    }
  },

  // ── Gallery ─────────────────────────────────────────────────────────

  addGalleryPost: (userId, seasonId, photoUrls, caption, postedBy, tagPlayerIds) => {
    const localId = genId();
    const now = new Date().toISOString();
    const newPost: GalleryPost = {
      id: localId, season_id: seasonId, user_id: userId,
      photo_url: photoUrls[0] ?? null, photo_urls: photoUrls.length > 0 ? photoUrls : null,
      caption, posted_by: postedBy,
      deleted_at: null, created_at: now,
    };
    const newTags: GalleryTag[] = tagPlayerIds.map((pid) => ({
      id: genId(), post_id: localId, player_id: pid,
    }));
    set({ gallery: [newPost, ...get().gallery], galleryTags: [...get().galleryTags, ...newTags] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      supabase.from('cricket_gallery')
        .insert({ user_id: userId, season_id: seasonId, photo_url: photoUrls[0] ?? null, photo_urls: photoUrls.length > 0 ? photoUrls : null, caption, posted_by: postedBy })
        .select().single()
        .then(({ data: row, error }: { data: GalleryPost | null; error: unknown }) => {
          if (error) { console.error('[cricket] addGalleryPost failed:', error); toast.error('Couldn\'t create post. Check your connection and try again.'); }
          if (row) {
            set({ gallery: get().gallery.map((p) => p.id === localId ? row : p) });
            toast.success('Post created');
            // Update tags with real post_id and insert
            if (tagPlayerIds.length > 0) {
              const tagRows = tagPlayerIds.map((pid) => ({ post_id: row.id, player_id: pid }));
              supabase.from('cricket_gallery_tags').insert(tagRows).select()
                .then(({ data: realTags }: { data: GalleryTag[] | null }) => {
                  if (realTags) {
                    const optimisticIds = new Set(newTags.map((t) => t.id));
                    set({ galleryTags: [...get().galleryTags.filter((t) => !optimisticIds.has(t.id)), ...realTags] });
                  }
                });
            }
            // Send notifications to tagged players (exclude self)
            const taggedUserIds = tagPlayerIds
              .map((pid) => get().players.find((p) => p.id === pid))
              .filter((p) => p?.user_id && p.user_id !== userId)
              .map((p) => p!.user_id);
            if (taggedUserIds.length > 0) {
              const notifRows = taggedUserIds.map((uid) => ({
                user_id: uid, post_id: row.id, type: 'tag', message: `${postedBy ?? 'Someone'} tagged you in a photo`, is_read: false,
              }));
              supabase.from('cricket_notifications').insert(notifRows).then(({ error }: { error: unknown }) => {
                if (error) console.error('[cricket] notifications failed:', error);
              });
            }
          }
        });
    }
  },

  updateGalleryPost: (id, caption, newTagPlayerIds) => {
    // Update caption optimistically
    set({ gallery: get().gallery.map((p) => p.id === id ? { ...p, caption } : p) });

    // Reconcile tags: diff old vs new
    const oldTags = get().galleryTags.filter((t) => t.post_id === id);
    const oldPlayerIds = new Set(oldTags.map((t) => t.player_id));
    const newPlayerIds = new Set(newTagPlayerIds);
    const toAdd = newTagPlayerIds.filter((pid) => !oldPlayerIds.has(pid));
    const toRemove = oldTags.filter((t) => !newPlayerIds.has(t.player_id));

    // Optimistic: remove old, add new
    const removedIds = new Set(toRemove.map((t) => t.id));
    const addedTags: GalleryTag[] = toAdd.map((pid) => ({ id: genId(), post_id: id, player_id: pid }));
    set({ galleryTags: [...get().galleryTags.filter((t) => !removedIds.has(t.id)), ...addedTags] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      // Update caption
      supabase.from('cricket_gallery').update({ caption }).eq('id', id).then(() => {});
      // Remove old tags
      if (toRemove.length > 0) {
        supabase.from('cricket_gallery_tags').delete().in('id', toRemove.map((t) => t.id)).then(() => {});
      }
      // Add new tags
      if (toAdd.length > 0) {
        const tagRows = toAdd.map((pid) => ({ post_id: id, player_id: pid }));
        supabase.from('cricket_gallery_tags').insert(tagRows).select()
          .then(({ data: realTags }: { data: GalleryTag[] | null }) => {
            if (realTags) {
              const optimisticIds = new Set(addedTags.map((t) => t.id));
              set({ galleryTags: [...get().galleryTags.filter((t) => !optimisticIds.has(t.id)), ...realTags] });
            }
          });
      }
    }
  },

  deleteGalleryPost: (id) => {
    const now = new Date().toISOString();
    set({ gallery: get().gallery.map((p) => p.id === id ? { ...p, deleted_at: now } : p) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_gallery').update({ deleted_at: now }).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) { console.error('[cricket] deleteGalleryPost failed:', error); toast.error('Couldn\'t delete post. Check your connection and try again.'); }
        else toast.success('Post deleted');
      });
    }
  },

  addGalleryComment: (postId, userId, commentBy, text) => {
    const localId = genId();
    const now = new Date().toISOString();
    const newComment: GalleryComment = { id: localId, post_id: postId, user_id: userId, comment_by: commentBy, text, created_at: now };
    set({ galleryComments: [...get().galleryComments, newComment] });

    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_gallery_comments')
        .insert({ post_id: postId, user_id: userId, comment_by: commentBy, text })
        .select().single()
        .then(({ data: row, error }: { data: GalleryComment | null; error: unknown }) => {
          if (error) { console.error('[cricket] addGalleryComment failed:', error); toast.error('Couldn\'t post comment. Check your connection and try again.'); }
          if (row) set({ galleryComments: get().galleryComments.map((c) => c.id === localId ? row : c) });
        });
    }
  },

  updateGalleryComment: (id, text) => {
    set({ galleryComments: get().galleryComments.map((c) => c.id === id ? { ...c, text } : c) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_gallery_comments').update({ text }).eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) console.error('[cricket] updateComment failed:', error);
      });
    }
  },

  deleteGalleryComment: (id) => {
    set({ galleryComments: get().galleryComments.filter((c) => c.id !== id) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_gallery_comments').delete().eq('id', id).then(({ error }: { error: unknown }) => {
        if (error) { console.error('[cricket] deleteGalleryComment failed:', error); toast.error('Couldn\'t delete comment. Check your connection and try again.'); }
      });
    }
  },

  toggleGalleryLike: (postId, userId, likerName) => {
    const existing = get().galleryLikes.find((l) => l.post_id === postId && l.user_id === userId);
    if (existing) {
      set({ galleryLikes: get().galleryLikes.filter((l) => l.id !== existing.id) });
      if (isCloudMode()) {
        const supabase = getSupabaseClient();
        supabase?.from('cricket_gallery_likes').delete().eq('id', existing.id).then(() => {});
      }
    } else {
      const localId = genId();
      const displayName = likerName ?? null;
      const newLike: GalleryLike = { id: localId, post_id: postId, user_id: userId, liked_by: displayName };
      set({ galleryLikes: [...get().galleryLikes, newLike] });
      if (isCloudMode()) {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        supabase.from('cricket_gallery_likes')
          .insert({ post_id: postId, user_id: userId, liked_by: displayName })
          .select().single()
          .then(({ data: row }: { data: GalleryLike | null }) => {
            if (row) set({ galleryLikes: get().galleryLikes.map((l) => l.id === localId ? row : l) });
          });
        // Notify post owner about the like (exclude self-like)
        const post = get().gallery.find((p) => p.id === postId);
        if (post && post.user_id !== userId) {
          supabase.from('cricket_notifications')
            .insert({ user_id: post.user_id, post_id: postId, type: 'like', message: `${displayName ?? 'Someone'} liked your photo`, is_read: false })
            .then(({ error }: { error: unknown }) => {
              if (error) console.error('[cricket] like notification failed:', error);
            });
        }
      }
    }
  },

  toggleCommentReaction: (commentId, userId, emoji) => {
    const existing = get().commentReactions.find((r) => r.comment_id === commentId && r.user_id === userId && r.emoji === emoji);
    if (existing) {
      set({ commentReactions: get().commentReactions.filter((r) => r.id !== existing.id) });
      if (isCloudMode()) {
        const supabase = getSupabaseClient();
        supabase?.from('cricket_comment_reactions').delete().eq('id', existing.id).then(() => {});
      }
    } else {
      const localId = genId();
      const newReaction: CommentReaction = { id: localId, comment_id: commentId, user_id: userId, emoji };
      set({ commentReactions: [...get().commentReactions, newReaction] });
      if (isCloudMode()) {
        const supabase = getSupabaseClient();
        supabase?.from('cricket_comment_reactions')
          .insert({ comment_id: commentId, user_id: userId, emoji })
          .select().single()
          .then(({ data: row, error }: { data: CommentReaction | null; error: unknown }) => {
            if (error) console.error('[cricket] comment reaction failed:', error);
            if (row) set({ commentReactions: get().commentReactions.map((r) => r.id === localId ? row : r) });
          });
      }
    }
  },

  createNotifications: (postId, recipientUserIds, type, message) => {
    if (!isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase || recipientUserIds.length === 0) return;
    const rows = recipientUserIds.map((uid) => ({
      user_id: uid, post_id: postId, type, message, is_read: false,
    }));
    supabase.from('cricket_notifications').insert(rows).then(({ error }: { error: unknown }) => {
      if (error) console.error('[cricket] notifications insert failed:', error);
    });
  },

  markNotificationsRead: () => {
    const unread = get().notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    set({ notifications: get().notifications.map((n) => ({ ...n, is_read: true })) });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_notifications')
        .update({ is_read: true })
        .in('id', unread.map((n) => n.id))
        .then(() => {});
    }
  },

  clearNotifications: () => {
    const ids = get().notifications.map((n) => n.id);
    if (ids.length === 0) return;
    set({ notifications: [] });
    if (isCloudMode()) {
      const supabase = getSupabaseClient();
      supabase?.from('cricket_notifications').delete().in('id', ids).then(() => {});
    }
  },

  // ── UI ───────────────────────────────────────────────────────────────

  setShowPlayerForm: (showPlayerForm) => set({ showPlayerForm }),
  setShowExpenseForm: (showExpenseForm) => set({ showExpenseForm }),
  setShowSettleForm: (showSettleForm) => set({ showSettleForm }),
  setEditingPlayer: (editingPlayer) => set({ editingPlayer }),
}));
