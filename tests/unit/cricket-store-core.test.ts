import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => null,
  isCloudMode: () => false,
}));

vi.mock('@/app/(tools)/cricket/lib/utils', () => ({
  computeSplitAmounts: vi.fn(() => []),
}));

import { useCricketStore } from '@/stores/cricket-store';
import {
  ADMIN_USER, PLAYER_USER_1, PLAYER_USER_2,
  PLAYERS, SEASONS, EXPENSES, SPLITS, SETTLEMENTS, FEES, SPONSORSHIPS,
} from '../mocks/fixtures';

function resetStore() {
  useCricketStore.setState({
    players: structuredClone(PLAYERS),
    seasons: structuredClone(SEASONS),
    expenses: structuredClone(EXPENSES),
    splits: structuredClone(SPLITS),
    settlements: structuredClone(SETTLEMENTS),
    fees: structuredClone(FEES),
    sponsorships: structuredClone(SPONSORSHIPS),
    gallery: [],
    galleryTags: [],
    galleryComments: [],
    galleryLikes: [],
    commentReactions: [],
    notifications: [],
    loading: false,
    loadingMoreGallery: false,
    hasMoreGallery: false,
    galleryOffset: 0,
    selectedSeasonId: SEASONS[0].id,
    showPlayerForm: false,
    showExpenseForm: false,
    showSettleForm: false,
    editingPlayer: null,
  });
}

beforeEach(() => {
  resetStore();
});

// ── Players ──────────────────────────────────────────────────────────────

describe('Players', () => {
  it('addPlayer creates with correct fields and is_active=true', () => {
    const { addPlayer } = useCricketStore.getState();
    addPlayer(PLAYER_USER_1.id, {
      name: 'New Player',
      jersey_number: 42,
      phone: '555-9999',
      player_role: 'bowler',
      batting_style: 'left',
      bowling_style: 'pace',
      cricclub_id: 'cc-123',
      shirt_size: 'XL',
      email: 'new@example.com',
      designation: null,
      photo_url: 'https://example.com/photo.jpg',
    });

    const { players } = useCricketStore.getState();
    const added = players.find((p) => p.name === 'New Player');
    expect(added).toBeDefined();
    expect(added!.user_id).toBeNull();
    expect(added!.jersey_number).toBe(42);
    expect(added!.phone).toBe('555-9999');
    expect(added!.player_role).toBe('bowler');
    expect(added!.batting_style).toBe('left');
    expect(added!.bowling_style).toBe('pace');
    expect(added!.cricclub_id).toBe('cc-123');
    expect(added!.shirt_size).toBe('XL');
    expect(added!.email).toBe('new@example.com');
    expect(added!.designation).toBeNull();
    expect(added!.photo_url).toBe('https://example.com/photo.jpg');
    expect(added!.is_active).toBe(true);
    expect(added!.id).toBeTruthy();
    expect(added!.created_at).toBeTruthy();
    expect(added!.updated_at).toBeTruthy();
  });

  it('addPlayer appends to the players array', () => {
    const countBefore = useCricketStore.getState().players.length;
    useCricketStore.getState().addPlayer(ADMIN_USER.id, {
      name: 'Appended',
      jersey_number: null,
      phone: null,
      player_role: null,
      batting_style: null,
      bowling_style: null,
      cricclub_id: null,
      shirt_size: null,
      email: null,
      designation: null,
    });
    expect(useCricketStore.getState().players.length).toBe(countBefore + 1);
    const last = useCricketStore.getState().players[useCricketStore.getState().players.length - 1];
    expect(last.name).toBe('Appended');
  });

  it('addPlayer defaults photo_url to null when not provided', () => {
    useCricketStore.getState().addPlayer(ADMIN_USER.id, {
      name: 'No Photo',
      jersey_number: null,
      phone: null,
      player_role: null,
      batting_style: null,
      bowling_style: null,
      cricclub_id: null,
      shirt_size: null,
      email: null,
      designation: null,
    });
    const added = useCricketStore.getState().players.find((p) => p.name === 'No Photo');
    expect(added!.photo_url).toBeNull();
  });

  it('updatePlayer merges updates correctly', () => {
    useCricketStore.getState().updatePlayer('p1', { name: 'Updated Name', jersey_number: 99 });
    const p = useCricketStore.getState().players.find((p) => p.id === 'p1');
    expect(p!.name).toBe('Updated Name');
    expect(p!.jersey_number).toBe(99);
    // Other fields unchanged
    expect(p!.phone).toBe('555-0001');
    expect(p!.is_active).toBe(true);
  });

  it('updatePlayer on non-existent id does not crash', () => {
    expect(() => {
      useCricketStore.getState().updatePlayer('nonexistent-id', { name: 'Ghost' });
    }).not.toThrow();
    // Players array unchanged
    expect(useCricketStore.getState().players.length).toBe(PLAYERS.length);
  });

  it('removePlayer sets is_active=false and clears designation', () => {
    useCricketStore.getState().removePlayer('p1');
    const p = useCricketStore.getState().players.find((p) => p.id === 'p1');
    expect(p!.is_active).toBe(false);
    expect(p!.designation).toBeNull();
  });

  it('restorePlayer sets is_active=true and clears designation', () => {
    // p3 is inactive in fixtures
    useCricketStore.getState().restorePlayer('p3');
    const p = useCricketStore.getState().players.find((p) => p.id === 'p3');
    expect(p!.is_active).toBe(true);
    expect(p!.designation).toBeNull();
  });
});

// ── Seasons ──────────────────────────────────────────────────────────────

describe('Seasons', () => {
  it('addSeason creates with defaults (fee_amount, is_active, share_token)', () => {
    useCricketStore.getState().addSeason(ADMIN_USER.id, {
      name: 'Summer 2026',
      year: 2026,
      season_type: 'summer',
    });
    const { seasons } = useCricketStore.getState();
    const added = seasons.find((s) => s.name === 'Summer 2026');
    expect(added).toBeDefined();
    expect(added!.user_id).toBe(ADMIN_USER.id);
    expect(added!.year).toBe(2026);
    expect(added!.season_type).toBe('summer');
    expect(added!.fee_amount).toBe(60);
    expect(added!.is_active).toBe(true);
    expect(added!.share_token).toBeTruthy();
    expect(added!.created_at).toBeTruthy();
    expect(added!.updated_at).toBeTruthy();
  });

  it('addSeason prepends to seasons array', () => {
    useCricketStore.getState().addSeason(ADMIN_USER.id, {
      name: 'Prepended',
      year: 2027,
      season_type: 'fall',
    });
    const first = useCricketStore.getState().seasons[0];
    expect(first.name).toBe('Prepended');
  });

  it('addSeason sets selectedSeasonId to new season', () => {
    useCricketStore.getState().addSeason(ADMIN_USER.id, {
      name: 'Auto-Selected',
      year: 2027,
      season_type: 'spring',
    });
    const { selectedSeasonId, seasons } = useCricketStore.getState();
    const added = seasons.find((s) => s.name === 'Auto-Selected');
    expect(selectedSeasonId).toBe(added!.id);
  });

  it('multiple seasons: correct selectedSeasonId after add', () => {
    const beforeId = useCricketStore.getState().selectedSeasonId;
    expect(beforeId).toBe(SEASONS[0].id);

    useCricketStore.getState().addSeason(ADMIN_USER.id, {
      name: 'New Season',
      year: 2027,
      season_type: 'summer',
    });

    const { selectedSeasonId, seasons } = useCricketStore.getState();
    const newSeason = seasons.find((s) => s.name === 'New Season');
    expect(selectedSeasonId).toBe(newSeason!.id);
    expect(seasons.length).toBe(SEASONS.length + 1);
  });

  it('updateSeason merges updates', () => {
    useCricketStore.getState().updateSeason('season-spring-2026', { name: 'Renamed Season', fee_amount: 75 });
    const s = useCricketStore.getState().seasons.find((s) => s.id === 'season-spring-2026');
    expect(s!.name).toBe('Renamed Season');
    expect(s!.fee_amount).toBe(75);
    expect(s!.year).toBe(2026); // unchanged
  });

  it('setSelectedSeason changes selectedSeasonId', () => {
    useCricketStore.getState().setSelectedSeason('season-fall-2025');
    expect(useCricketStore.getState().selectedSeasonId).toBe('season-fall-2025');
  });

  it('setSelectedSeason accepts null', () => {
    useCricketStore.getState().setSelectedSeason(null);
    expect(useCricketStore.getState().selectedSeasonId).toBeNull();
  });
});

// ── Expenses ─────────────────────────────────────────────────────────────

describe('Expenses', () => {
  it('addExpense creates with correct fields', () => {
    useCricketStore.getState().addExpense(
      ADMIN_USER.id,
      'season-spring-2026',
      { category: 'food', description: 'Lunch', amount: 75, expense_date: '2026-04-01' },
      'Bhaskar Bachi',
    );
    const { expenses } = useCricketStore.getState();
    const added = expenses.find((e) => e.description === 'Lunch');
    expect(added).toBeDefined();
    expect(added!.user_id).toBe(ADMIN_USER.id);
    expect(added!.season_id).toBe('season-spring-2026');
    expect(added!.paid_by).toBe(ADMIN_USER.id);
    expect(added!.category).toBe('food');
    expect(added!.amount).toBe(75);
    expect(added!.expense_date).toBe('2026-04-01');
    expect(added!.created_by).toBe('Bhaskar Bachi');
    expect(added!.updated_by).toBeNull();
    expect(added!.deleted_at).toBeNull();
    expect(added!.deleted_by).toBeNull();
  });

  it('addExpense prepends to expenses array', () => {
    useCricketStore.getState().addExpense(
      ADMIN_USER.id,
      'season-spring-2026',
      { category: 'other', description: 'First', amount: 10, expense_date: '2026-04-01' },
    );
    const first = useCricketStore.getState().expenses[0];
    expect(first.description).toBe('First');
  });

  it('addExpense with no active players still creates expense', () => {
    // Remove all active players
    useCricketStore.setState({ players: [] });
    useCricketStore.getState().addExpense(
      ADMIN_USER.id,
      'season-spring-2026',
      { category: 'ground', description: 'No players expense', amount: 100, expense_date: '2026-04-01' },
    );
    const added = useCricketStore.getState().expenses.find((e) => e.description === 'No players expense');
    expect(added).toBeDefined();
    expect(added!.amount).toBe(100);
  });

  it('updateExpense merges updates including updated_by', () => {
    useCricketStore.getState().updateExpense('exp-1', { amount: 300, description: 'Updated ground' }, 'Manigopal');
    const e = useCricketStore.getState().expenses.find((e) => e.id === 'exp-1');
    expect(e!.amount).toBe(300);
    expect(e!.description).toBe('Updated ground');
    expect(e!.updated_by).toBe('Manigopal');
    // Other fields unchanged
    expect(e!.category).toBe('ground');
    expect(e!.season_id).toBe('season-spring-2026');
  });

  it('deleteExpense sets deleted_at and deleted_by', () => {
    useCricketStore.getState().deleteExpense('exp-1', 'Bhaskar Bachi');
    const e = useCricketStore.getState().expenses.find((e) => e.id === 'exp-1');
    expect(e!.deleted_at).toBeTruthy();
    expect(e!.deleted_by).toBe('Bhaskar Bachi');
  });

  it('deleteExpense on already soft-deleted expense overwrites timestamps', () => {
    // exp-2 is already soft-deleted in fixtures
    const before = useCricketStore.getState().expenses.find((e) => e.id === 'exp-2');
    expect(before!.deleted_at).toBeTruthy();
    const oldDeletedAt = before!.deleted_at;

    useCricketStore.getState().deleteExpense('exp-2', 'Admin');
    const after = useCricketStore.getState().expenses.find((e) => e.id === 'exp-2');
    expect(after!.deleted_at).toBeTruthy();
    expect(after!.deleted_by).toBe('Admin');
    // Timestamp is freshly generated, so it differs from original
    expect(after!.deleted_at).not.toBe(oldDeletedAt);
  });

  it('restoreExpense clears deleted_at and deleted_by', () => {
    // exp-2 is soft-deleted in fixtures
    useCricketStore.getState().restoreExpense('exp-2');
    const e = useCricketStore.getState().expenses.find((e) => e.id === 'exp-2');
    expect(e!.deleted_at).toBeNull();
    expect(e!.deleted_by).toBeNull();
  });

  it('restoreExpense on non-deleted expense is a no-op', () => {
    // exp-1 is not deleted
    const before = useCricketStore.getState().expenses.find((e) => e.id === 'exp-1');
    expect(before!.deleted_at).toBeNull();

    useCricketStore.getState().restoreExpense('exp-1');
    const after = useCricketStore.getState().expenses.find((e) => e.id === 'exp-1');
    expect(after!.deleted_at).toBeNull();
    expect(after!.deleted_by).toBeNull();
    // Object still has same fields
    expect(after!.amount).toBe(before!.amount);
  });
});

// ── Settlements ──────────────────────────────────────────────────────────

describe('Settlements', () => {
  it('addSettlement creates with correct fields', () => {
    useCricketStore.getState().addSettlement(
      ADMIN_USER.id,
      'season-spring-2026',
      { from_player: 'p1', to_player: 'p2', amount: 100, settled_date: '2026-04-01' },
    );
    const { settlements } = useCricketStore.getState();
    const added = settlements.find((s) => s.amount === 100 && s.from_player === 'p1' && s.to_player === 'p2');
    expect(added).toBeDefined();
    expect(added!.user_id).toBe(ADMIN_USER.id);
    expect(added!.season_id).toBe('season-spring-2026');
    expect(added!.settled_date).toBe('2026-04-01');
    expect(added!.created_at).toBeTruthy();
  });

  it('addSettlement prepends to settlements array', () => {
    useCricketStore.getState().addSettlement(
      ADMIN_USER.id,
      'season-spring-2026',
      { from_player: 'p2', to_player: 'p1', amount: 25, settled_date: '2026-04-05' },
    );
    expect(useCricketStore.getState().settlements[0].amount).toBe(25);
  });

  it('deleteSettlement removes from array (hard delete)', () => {
    const countBefore = useCricketStore.getState().settlements.length;
    useCricketStore.getState().deleteSettlement('settle-1');
    const { settlements } = useCricketStore.getState();
    expect(settlements.length).toBe(countBefore - 1);
    expect(settlements.find((s) => s.id === 'settle-1')).toBeUndefined();
  });

  it('deleteSettlement with non-existent id does nothing', () => {
    const countBefore = useCricketStore.getState().settlements.length;
    useCricketStore.getState().deleteSettlement('nonexistent-id');
    expect(useCricketStore.getState().settlements.length).toBe(countBefore);
  });
});

// ── Fees ─────────────────────────────────────────────────────────────────

describe('Fees', () => {
  it('recordFee creates new fee', () => {
    useCricketStore.getState().recordFee('season-spring-2026', 'p2', 60, 'Bhaskar Bachi');
    const { fees } = useCricketStore.getState();
    const added = fees.find((f) => f.player_id === 'p2' && f.season_id === 'season-spring-2026');
    expect(added).toBeDefined();
    expect(added!.amount_paid).toBe(60);
    expect(added!.marked_by).toBe('Bhaskar Bachi');
    expect(added!.paid_date).toBeTruthy();
    expect(added!.created_at).toBeTruthy();
  });

  it('recordFee for same player+season updates existing (no duplicate)', () => {
    // fee-1 already exists for p1 + season-spring-2026 with amount 60
    const countBefore = useCricketStore.getState().fees.length;
    useCricketStore.getState().recordFee('season-spring-2026', 'p1', 30, 'Admin');
    const { fees } = useCricketStore.getState();
    expect(fees.length).toBe(countBefore); // No new entry
    const updated = fees.find((f) => f.id === 'fee-1');
    expect(updated!.amount_paid).toBe(30);
    expect(updated!.marked_by).toBe('Admin');
  });

  it('recordFee with no markedBy sets marked_by to null', () => {
    useCricketStore.getState().recordFee('season-fall-2025', 'p2', 50);
    const fee = useCricketStore.getState().fees.find(
      (f) => f.player_id === 'p2' && f.season_id === 'season-fall-2025',
    );
    expect(fee!.marked_by).toBeNull();
  });

  it('deleteFee removes from array', () => {
    const countBefore = useCricketStore.getState().fees.length;
    useCricketStore.getState().deleteFee('fee-1');
    const { fees } = useCricketStore.getState();
    expect(fees.length).toBe(countBefore - 1);
    expect(fees.find((f) => f.id === 'fee-1')).toBeUndefined();
  });
});

// ── Sponsorships ─────────────────────────────────────────────────────────

describe('Sponsorships', () => {
  it('addSponsorship creates with correct fields', () => {
    useCricketStore.getState().addSponsorship(
      'season-spring-2026',
      { sponsor_name: 'Big Corp', amount: 1000, sponsored_date: '2026-04-01', notes: 'Banner ad' },
      'Bhaskar Bachi',
    );
    const { sponsorships } = useCricketStore.getState();
    const added = sponsorships.find((s) => s.sponsor_name === 'Big Corp');
    expect(added).toBeDefined();
    expect(added!.season_id).toBe('season-spring-2026');
    expect(added!.amount).toBe(1000);
    expect(added!.sponsored_date).toBe('2026-04-01');
    expect(added!.notes).toBe('Banner ad');
    expect(added!.created_by).toBe('Bhaskar Bachi');
    expect(added!.updated_by).toBeNull();
    expect(added!.deleted_at).toBeNull();
    expect(added!.deleted_by).toBeNull();
    expect(added!.created_at).toBeTruthy();
    expect(added!.updated_at).toBeTruthy();
  });

  it('addSponsorship appends to array', () => {
    useCricketStore.getState().addSponsorship(
      'season-spring-2026',
      { sponsor_name: 'Appended', amount: 10, sponsored_date: '2026-04-01', notes: null },
    );
    const last = useCricketStore.getState().sponsorships;
    expect(last[last.length - 1].sponsor_name).toBe('Appended');
  });

  it('updateSponsorship merges updates with updated_by', () => {
    useCricketStore.getState().updateSponsorship('sponsor-1', { amount: 750, notes: 'Updated notes' }, 'Manigopal');
    const s = useCricketStore.getState().sponsorships.find((s) => s.id === 'sponsor-1');
    expect(s!.amount).toBe(750);
    expect(s!.notes).toBe('Updated notes');
    expect(s!.updated_by).toBe('Manigopal');
    // Unchanged fields
    expect(s!.sponsor_name).toBe('Local Business');
  });

  it('deleteSponsorship sets deleted_at and deleted_by (soft delete)', () => {
    useCricketStore.getState().deleteSponsorship('sponsor-1', 'Admin');
    const s = useCricketStore.getState().sponsorships.find((s) => s.id === 'sponsor-1');
    expect(s!.deleted_at).toBeTruthy();
    expect(s!.deleted_by).toBe('Admin');
    // Still in array (soft delete, not removed)
    expect(useCricketStore.getState().sponsorships.find((sp) => sp.id === 'sponsor-1')).toBeDefined();
  });

  it('restoreSponsorship clears deleted_at and deleted_by', () => {
    // First soft-delete, then restore
    useCricketStore.getState().deleteSponsorship('sponsor-1', 'Admin');
    useCricketStore.getState().restoreSponsorship('sponsor-1');
    const s = useCricketStore.getState().sponsorships.find((s) => s.id === 'sponsor-1');
    expect(s!.deleted_at).toBeNull();
    expect(s!.deleted_by).toBeNull();
  });
});

// ── UI State ─────────────────────────────────────────────────────────────

describe('UI State', () => {
  it('setShowPlayerForm toggles showPlayerForm', () => {
    expect(useCricketStore.getState().showPlayerForm).toBe(false);
    useCricketStore.getState().setShowPlayerForm(true);
    expect(useCricketStore.getState().showPlayerForm).toBe(true);
    useCricketStore.getState().setShowPlayerForm(false);
    expect(useCricketStore.getState().showPlayerForm).toBe(false);
  });

  it('setShowExpenseForm toggles showExpenseForm', () => {
    expect(useCricketStore.getState().showExpenseForm).toBe(false);
    useCricketStore.getState().setShowExpenseForm(true);
    expect(useCricketStore.getState().showExpenseForm).toBe(true);
  });

  it('setShowSettleForm toggles showSettleForm', () => {
    expect(useCricketStore.getState().showSettleForm).toBe(false);
    useCricketStore.getState().setShowSettleForm(true);
    expect(useCricketStore.getState().showSettleForm).toBe(true);
  });

  it('setEditingPlayer sets and clears editingPlayer', () => {
    expect(useCricketStore.getState().editingPlayer).toBeNull();
    useCricketStore.getState().setEditingPlayer('p1');
    expect(useCricketStore.getState().editingPlayer).toBe('p1');
    useCricketStore.getState().setEditingPlayer(null);
    expect(useCricketStore.getState().editingPlayer).toBeNull();
  });
});
