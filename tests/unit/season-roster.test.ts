import { describe, it, expect } from 'vitest';
import { seasonRoster, billableRoster } from '@/app/(tools)/cricket/lib/season-roster';
import type { CricketPlayer, CricketSeasonPlayer } from '@/types/cricket';

const player = (id: string, over: Partial<CricketPlayer> = {}): CricketPlayer => ({
  id, user_id: null, name: `Player ${id}`, jersey_number: null, phone: null,
  player_role: null, batting_style: null, bowling_style: null, cricclub_id: null,
  shirt_size: null, email: null, designation: null, photo_url: null,
  is_active: true, is_guest: false,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

const row = (seasonId: string, playerId: string, over: Partial<CricketSeasonPlayer> = {}): CricketSeasonPlayer => ({
  season_id: seasonId, player_id: playerId, team_id: 'team-1',
  is_guest: false, left_at: null,
  joined_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
  ...over,
});

const SPRING = 'spring';
const FALL = 'fall';

describe('seasonRoster', () => {
  const players = [player('a'), player('b'), player('c')];

  it('returns only the players enrolled in that season', () => {
    const rows = [row(SPRING, 'a'), row(SPRING, 'b'), row(FALL, 'c')];

    expect(seasonRoster(players, rows, SPRING).players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(seasonRoster(players, rows, FALL).players.map((p) => p.id)).toEqual(['c']);
  });

  it('keeps seasons independent — removing from Fall does not touch Spring', () => {
    // The whole reason the table exists.
    const before = [row(SPRING, 'a'), row(FALL, 'a')];
    const after = before.filter((r) => r.season_id !== FALL);

    expect(seasonRoster(players, after, SPRING).players.map((p) => p.id)).toEqual(['a']);
    expect(seasonRoster(players, after, FALL).isFallback).toBe(true);
  });

  it('excludes somebody who left partway through the season', () => {
    // Their fees and duties stay in the season's history; they just drop out of
    // the current roster.
    const rows = [row(SPRING, 'a'), row(SPRING, 'b', { left_at: '2026-06-01T00:00:00Z' })];
    expect(seasonRoster(players, rows, SPRING).players.map((p) => p.id)).toEqual(['a']);
  });

  it('excludes a deactivated player even when the roster row survives', () => {
    // is_active means "associated with the club at all" — it outranks a row.
    const withInactive = [player('a'), player('b', { is_active: false })];
    const rows = [row(SPRING, 'a'), row(SPRING, 'b')];
    expect(seasonRoster(withInactive, rows, SPRING).players.map((p) => p.id)).toEqual(['a']);
  });

  it('skips a roster row whose player record is missing', () => {
    // Mid-load, or removed from another device — must not render a blank tile.
    const rows = [row(SPRING, 'a'), row(SPRING, 'ghost')];
    expect(seasonRoster(players, rows, SPRING).players.map((p) => p.id)).toEqual(['a']);
  });

  describe('season-level guest flag', () => {
    it('reads the JOIN row, not the player record', () => {
      // Somebody can guest one season and be a regular the next. The player
      // record still says guest (no email, no account) — the season says
      // otherwise, and the season is what decides fees and duty targets.
      const squad = [player('a', { is_guest: true })];
      const rows = [row(SPRING, 'a', { is_guest: true }), row(FALL, 'a', { is_guest: false })];

      expect(seasonRoster(squad, rows, SPRING).isGuest('a')).toBe(true);
      expect(seasonRoster(squad, rows, FALL).isGuest('a')).toBe(false);
    });
  });

  describe('empty-roster fallback', () => {
    it('falls back to the team-wide list, so an un-seeded season is not blank', () => {
      const r = seasonRoster(players, [], SPRING);
      expect(r.players.map((p) => p.id)).toEqual(['a', 'b', 'c']);
      expect(r.isFallback).toBe(true);
    });

    it('falls back when no season is selected at all', () => {
      expect(seasonRoster(players, [row(SPRING, 'a')], null).isFallback).toBe(true);
    });

    it('excludes deactivated players from the fallback too', () => {
      const withInactive = [player('a'), player('b', { is_active: false })];
      expect(seasonRoster(withInactive, [], SPRING).players.map((p) => p.id)).toEqual(['a']);
    });

    it('uses the record-level guest flag when falling back', () => {
      // There is no season row to read, so the only guest fact available is the
      // one on the player — which is exactly today's behaviour.
      const squad = [player('a', { is_guest: true })];
      expect(seasonRoster(squad, [], SPRING).isGuest('a')).toBe(true);
    });

    it('is NOT a fallback once the season has even one row', () => {
      const r = seasonRoster(players, [row(SPRING, 'a')], SPRING);
      expect(r.isFallback).toBe(false);
      expect(r.players).toHaveLength(1);
    });
  });
});

describe('billableRoster', () => {
  it('drops season guests from the fee and duty denominator', () => {
    const players = [player('a'), player('b'), player('c')];
    const rows = [row(SPRING, 'a'), row(SPRING, 'b', { is_guest: true }), row(SPRING, 'c')];

    expect(billableRoster(seasonRoster(players, rows, SPRING)).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('counts a player who guested LAST season but is a regular this one', () => {
    const players = [player('a', { is_guest: true })];
    const rows = [row(SPRING, 'a', { is_guest: true }), row(FALL, 'a', { is_guest: false })];

    expect(billableRoster(seasonRoster(players, rows, SPRING))).toHaveLength(0);
    expect(billableRoster(seasonRoster(players, rows, FALL))).toHaveLength(1);
  });

  it('is empty when every member of the season is a guest', () => {
    const players = [player('a')];
    const rows = [row(SPRING, 'a', { is_guest: true })];
    expect(billableRoster(seasonRoster(players, rows, SPRING))).toEqual([]);
  });
});
