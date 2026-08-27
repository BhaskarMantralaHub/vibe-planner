import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildDutyShareText, buildRosterSummaryText } from '@/lib/duty-share';
import type { CricketUmpiringDuty } from '@/types/cricket';

let seq = 0;
const duty = (over: Partial<CricketUmpiringDuty> = {}): CricketUmpiringDuty => ({
  id: `d-${++seq}`,
  team_id: 'team-1',
  season_id: 'season-1',
  cricclubs_fixture_id: 6000 + seq,
  role_slot: 1,
  match_date: '2026-08-29',
  match_time: '10:45',
  venue: 'Hansen Park',
  team_a: 'MTCA California Super Kings',
  team_b: 'MTCA Oakwood Mavericks',
  match_type: 'league',
  umpire_team_cricclubs_id: 1014,
  umpire_team_raw: 'MTCA Sunrisers Manteca',
  source: 'mtca',
  swap_team: null,
  assigned_player_id: null,
  assigned_player_name: null,
  assigned_by: null,
  assigned_at: null,
  status: 'open',
  cancelled_reason: null,
  completed_by: null,
  completed_at: null,
  notes: null,
  mtca_removed_at: null,
  deleted_at: null,
  deleted_by: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...over,
});

const TODAY = '2026-08-27';

describe('buildDutyShareText', () => {
  it('returns null when there is nothing worth pasting', () => {
    expect(buildDutyShareText([], { today: TODAY })).toBeNull();
  });

  it('strips the MTCA prefix, which is noise in every team name', () => {
    const text = buildDutyShareText([duty()], { today: TODAY })!;
    expect(text).toContain('California Super Kings v Oakwood Mavericks');
    expect(text).not.toContain('MTCA');
  });

  it('marks an open slot prominently and a taken one with the name', () => {
    const text = buildDutyShareText(
      [
        duty({ status: 'open' }),
        duty({
          status: 'claimed', match_time: '11:30',
          assigned_player_name: 'Bhaskar Baachi',
          team_a: 'MTCA Vintage Warriors', team_b: 'MTCA Hillview Eagles',
          venue: 'Altamont Park - BaseBall',
        }),
      ],
      { today: TODAY },
    )!;
    expect(text).toContain('🙏 *Umpire needed — can anyone cover this?*');
    expect(text).toContain('✅ Bhaskar Baachi');
    expect(text).toContain('✅ Bhaskar Baachi — thank you!');
    // One match needs an umpire, so no aggregate total — it would restate
    // the line directly above it.
    expect(text).not.toContain('still needed');
  });

  it('keeps the ground name verbatim — the number distinguishes two pitches', () => {
    const text = buildDutyShareText(
      [duty({ venue: 'Hansen School - BaseBall 2' })],
      { today: TODAY },
    )!;
    expect(text).toContain('Hansen School - BaseBall 2');
  });

  it('warns when DIFFERENT matches clash at the same time', () => {
    // The real 2026-04-26 case: three matches at 7:15 AM at three grounds.
    const text = buildDutyShareText(
      [
        duty({ cricclubs_fixture_id: 101, match_date: '2026-09-05', match_time: '07:15', venue: 'Altamont Park', team_a: 'MTCA A', team_b: 'MTCA B' }),
        duty({ cricclubs_fixture_id: 102, match_date: '2026-09-05', match_time: '07:15', venue: 'Cordes Park', team_a: 'MTCA C', team_b: 'MTCA D' }),
        duty({ cricclubs_fixture_id: 103, match_date: '2026-09-05', match_time: '07:15', venue: 'Hansen Park', team_a: 'MTCA E', team_b: 'MTCA F' }),
      ],
      { today: TODAY },
    )!;
    expect(text).toContain('⚠️ 3 matches at 7:15 AM — needs 3 different people');
  });

  it('never prints the same match twice when we owe two umpires on it', () => {
    // After an offline swap, two of our people cover one fixture. Printing the
    // fixture once per slot reads as duplicated data.
    const text = buildDutyShareText(
      [
        duty({ cricclubs_fixture_id: 5944, role_slot: 1, status: 'claimed', assigned_player_name: 'Bhaskar Baachi', team_a: 'MTCA Vintage Warriors', team_b: 'MTCA Hillview Eagles', venue: 'Altamont Park - BaseBall', match_time: '11:30' }),
        duty({ cricclubs_fixture_id: 5944, role_slot: 2, status: 'open', team_a: 'MTCA Vintage Warriors', team_b: 'MTCA Hillview Eagles', venue: 'Altamont Park - BaseBall', match_time: '11:30' }),
      ],
      { today: TODAY },
    )!;
    const occurrences = text.split('Vintage Warriors v Hillview Eagles').length - 1;
    expect(occurrences).toBe(1);
    expect(text).toContain('✅ Bhaskar Baachi — thank you!');
    expect(text).toContain('🙏 *1 more umpire needed*');
    // Two slots on ONE match is not a clash.
    expect(text).not.toContain('different people');
  });

  it('asks for both when a match needs two and nobody has signed up', () => {
    const text = buildDutyShareText(
      [
        duty({ cricclubs_fixture_id: 7777, role_slot: 1, status: 'open' }),
        duty({ cricclubs_fixture_id: 7777, role_slot: 2, status: 'open' }),
      ],
      { today: TODAY },
    )!;
    expect(text).toContain('🙏 *2 umpires needed — can anyone cover?*');
    // Both open slots are on ONE match, so no aggregate line.
    expect(text).not.toContain('still needed');
  });

  it('excludes duties in the past, handed away, and already closed out', () => {
    const text = buildDutyShareText(
      [
        duty({ match_date: '2026-08-01' }),                                  // past
        duty({ deleted_at: '2026-08-02T00:00:00Z' }),                        // handed away
        duty({ status: 'completed', completed_at: 'x', assigned_player_name: 'X' }),
        duty({ status: 'cancelled', cancelled_reason: 'admin' }),
        duty({ match_time: '14:00' }),                                       // the only keeper
      ],
      { today: TODAY },
    )!;
    expect(text).toContain('2:00 PM');
    expect(text).toContain('Add your name');
    expect(text).not.toContain('2026-08-01');
  });

  it('includes a duty on today itself', () => {
    const text = buildDutyShareText([duty({ match_date: TODAY })], { today: TODAY });
    expect(text).not.toBeNull();
  });

  it('shows a grand total only when SEVERAL matches need umpires', () => {
    const two = buildDutyShareText(
      [
        duty({ cricclubs_fixture_id: 301, status: 'open', team_a: 'MTCA A', team_b: 'MTCA B' }),
        duty({ cricclubs_fixture_id: 302, status: 'open', match_time: '14:00', team_a: 'MTCA C', team_b: 'MTCA D' }),
      ],
      { today: TODAY },
    )!;
    expect(two).toContain('🙏 *2 umpires still needed — please help.*');

    const one = buildDutyShareText([duty({ status: 'open' })], { today: TODAY })!;
    expect(one).not.toContain('still needed');
  });

  it('offers a reply-in-chat path alongside the link', () => {
    const text = buildDutyShareText([duty({ status: 'open' })], { today: TODAY })!;
    expect(text).toContain('Add your name');
    expect(text).toContain("Or just reply here and I'll add you.");
  });

  it('celebrates rather than nagging when everything is covered', () => {
    const text = buildDutyShareText(
      [duty({ status: 'claimed', assigned_player_name: 'Ashok' })],
      { today: TODAY },
    )!;
    expect(text).toContain('*All duties covered — thank you all!* 🙌');
    expect(text).not.toContain('Add your name');
  });

  it('groups by date with a heading per day', () => {
    const text = buildDutyShareText(
      [
        duty({ match_date: '2026-08-29' }),
        duty({ match_date: '2026-09-05', match_time: '09:00' }),
      ],
      { today: TODAY },
    )!;
    expect(text).toContain('_Saturday, Aug 29_');
    expect(text).toContain('_Saturday, Sep 5_');
  });

  it('handles a null match_time without producing "null"', () => {
    const text = buildDutyShareText([duty({ match_time: null })], { today: TODAY })!;
    expect(text).toContain('TBD');
    expect(text).not.toContain('null');
  });

  it('keeps every line short enough for a phone screen', () => {
    const text = buildDutyShareText(
      [duty(), duty({ status: 'claimed', assigned_player_name: 'Ashok Reddy Donti Reddy', match_time: '11:30' })],
      { today: TODAY },
    )!;
    for (const line of text.split('\n')) {
      expect(line.length, `too long: ${line}`).toBeLessThanOrEqual(60);
    }
  });

  it('renders the real season summary as pasteable text', () => {
    const summary = buildRosterSummaryText(
      [
        { name: 'Adi Jesta', completed: 1, booked: 0 },
        { name: 'Ashok Reddy Donti Reddy', completed: 2, booked: 0 },
        { name: 'Bhaskar Baachi', completed: 0, booked: 1 },
        { name: 'Akash Prasun', completed: 0, booked: 0 },
        { name: 'Venkat Gudala (Kittu)', completed: 0, booked: 0 },
      ],
      { teamName: 'Sunrisers Manteca', target: 1, openSlots: 1 },
    )!;
    writeFileSync(
      '/private/tmp/claude-502/-Users-bmantrala-vibe-planner-repo/c3368503-ab6c-4ca7-a228-2e04af1def1f/summary.txt',
      summary,
    );
    expect(summary).toContain('2 of 5 have stood at least once');
  });

  it('renders the real Aug 29 duties as pasteable text', () => {
    const text = buildDutyShareText(
      [
        duty({
          status: 'open', match_time: '10:45', venue: 'Hansen Park',
          team_a: 'MTCA California Super Kings', team_b: 'MTCA Oakwood Mavericks',
        }),
        duty({
          status: 'claimed', match_time: '11:30', venue: 'Altamont Park - BaseBall',
          team_a: 'MTCA Vintage Warriors', team_b: 'MTCA Hillview Eagles',
          assigned_player_name: 'Bhaskar Baachi',
        }),
      ],
      { today: TODAY },
    )!;
    writeFileSync(
      '/private/tmp/claude-502/-Users-bmantrala-vibe-planner-repo/c3368503-ab6c-4ca7-a228-2e04af1def1f/scratchpad/sample.txt',
      text,
    );
    expect(text.split('\n')[0]).toBe('🏏 *Sunrisers — Umpiring Duties*');
  });
});

describe('buildRosterSummaryText', () => {
  const rows = [
    { name: 'Adi Jesta', completed: 1, booked: 0 },
    { name: 'Ashok Reddy Donti Reddy', completed: 2, booked: 0 },
    { name: 'Bhaskar Baachi', completed: 0, booked: 1 },
    { name: 'Akash Prasun', completed: 0, booked: 0 },
  ];

  it('returns null with nobody on the roster', () => {
    expect(buildRosterSummaryText([])).toBeNull();
  });

  it('leads with who HAS stood, not who has not', () => {
    // A message listing only the outstanding people reads as a public
    // telling-off. Opening with everyone who turned up reads as progress.
    const t = buildRosterSummaryText(rows, { openSlots: 1 })!;
    const stoodAt = t.indexOf('Stood (2)');
    const yetAt = t.indexOf('Yet to umpire');
    expect(stoodAt).toBeGreaterThan(-1);
    expect(stoodAt).toBeLessThan(yetAt);
  });

  it('splits the roster into stood / booked / yet to umpire', () => {
    const t = buildRosterSummaryText(rows, { openSlots: 1 })!;
    expect(t).toContain('✅ *Stood (2)*');
    expect(t).toContain('🕐 *Upcoming (1)*');
    expect(t).toContain('⏳ *Yet to umpire (1)*');
    expect(t).toContain('2 of 4 have stood at least once');
  });

  it('marks repeat umpires so extra effort is visible by name', () => {
    const t = buildRosterSummaryText(rows, { openSlots: 1 })!;
    expect(t).toContain('Ashok Reddy Donti Reddy (×2)');
    expect(t).toContain('Adi Jesta,');
  });

  it('counts somebody as booked only when they have not already stood', () => {
    const t = buildRosterSummaryText(
      [{ name: 'Both', completed: 1, booked: 1 }],
      { openSlots: 0 },
    )!;
    expect(t).toContain('Stood (1)');
    expect(t).not.toContain('Upcoming (');
  });

  it('asks for help only when there is something to claim', () => {
    const withOpen = buildRosterSummaryText(rows, { openSlots: 2 })!;
    expect(withOpen).toContain('🙏 *2 umpiring spots still open — please help.*');
    expect(withOpen).toContain('Add your name');

    // Nagging about duties that do not exist yet is pure noise.
    const noOpen = buildRosterSummaryText(rows, { openSlots: 0 })!;
    expect(noOpen).toContain('*Every duty is covered for now — thank you!* 🙌');
    expect(noOpen).not.toContain('Add your name');
  });

  it('counts SPOTS, not duties or matches, and gets singular right', () => {
    // "1 duty needs an umpire" is circular; "1 match needs someone" is wrong
    // when a match already has one umpire or needs two.
    const one = buildRosterSummaryText(rows, { openSlots: 1 })!;
    expect(one).toContain('🙏 *1 umpiring spot still open — please help.*');
    expect(one).not.toContain('needs an umpire');

    const many = buildRosterSummaryText(rows, { openSlots: 3 })!;
    expect(many).toContain('🙏 *3 umpiring spots still open — please help.*');
  });

  it('offers a reply-in-chat path for people who avoid the app', () => {
    // The link needs a login, which is a dead end for anyone who never
    // registered. An admin can assign on their behalf, so replying is a
    // complete route — but only if the message says so.
    const t = buildRosterSummaryText(rows, { openSlots: 1 })!;
    expect(t).toContain("Or just reply here and I'll add you.");
  });

  it('keeps the reply line free of markup and curly quotes', () => {
    // This is the line that matters most to the people least likely to act, so
    // it must not depend on WhatsApp rendering markup — a failed italic leaves
    // literal underscores and the sentence reads as broken.
    const t = buildRosterSummaryText(rows, { openSlots: 1 })!;
    const line = t.split('\n').find((l) => l.startsWith('Or just reply'))!;
    expect(line).toBeDefined();
    expect(line).not.toContain('_');
    expect(line).not.toContain('*');
    expect(line).not.toContain('\u2019');
  });

  it('credits an extra booking by someone who has already stood', () => {
    // Otherwise a player who stood once and then volunteered again vanishes
    // into the Stood list and gets no credit for the second duty.
    const t = buildRosterSummaryText(
      [
        { name: 'Madhu G', completed: 1, booked: 1 },
        { name: 'Akash Prasun', completed: 0, booked: 0 },
      ],
      { openSlots: 0 },
    )!;
    expect(t).toContain('Madhu G (+1 coming)');
  });

  it('does not contradict itself when nothing is claimable', () => {
    // "No duties open" sitting under "Yet to umpire (7)" reads as a
    // contradiction, even though both are true.
    const t = buildRosterSummaryText(
      [
        { name: 'Done Person', completed: 1, booked: 0 },
        { name: 'Waiting Person', completed: 0, booked: 0 },
      ],
      { openSlots: 0 },
    )!;
    expect(t).toContain('Yet to umpire (1)');
    expect(t).toContain('Every duty is covered for now');
    expect(t).not.toContain('No duties open');
  });

  it('celebrates when the whole squad has stood', () => {
    const t = buildRosterSummaryText(
      [{ name: 'A', completed: 1, booked: 0 }, { name: 'B', completed: 1, booked: 0 }],
      { openSlots: 0 },
    )!;
    expect(t).toContain('*Everyone has stood — thank you all!* 🙌');
    expect(t).not.toContain('Yet to umpire');
  });

  it('respects a raised target', () => {
    const t = buildRosterSummaryText(
      [{ name: 'One', completed: 1, booked: 0 }, { name: 'Two', completed: 2, booked: 0 }],
      { target: 2, openSlots: 0 },
    )!;
    // Only the player with 2 counts as done when the target is 2.
    expect(t).toContain('✅ *Stood (1)*');
    expect(t).toContain('⏳ *Yet to umpire (1)*');
  });

  it('sorts names alphabetically within each group', () => {
    const t = buildRosterSummaryText(
      [
        { name: 'Zara', completed: 1, booked: 0 },
        { name: 'Amit', completed: 1, booked: 0 },
      ],
      { openSlots: 0 },
    )!;
    expect(t).toContain('Amit, Zara');
  });
});
