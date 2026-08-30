import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
  buildAssignedReminderText, buildDutyShareText, buildPlayerMessageText,
  buildRosterSummaryText, buildThanksText, whatsappShareUrl,
} from '@/lib/duty-share';
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
    expect(text).toContain('*Need an umpire here, can anyone cover?*');
    expect(text).toContain('Bhaskar Baachi is standing, thanks');
    // One match needs an umpire, so no aggregate total — it would restate
    // the line directly above it.
    expect(text).not.toContain('Still need');
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
    expect(text).toContain('Note: 3 matches at 7:15 AM, so we need 3 different people.');
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
    expect(text).toContain('Bhaskar Baachi is standing, thanks');
    expect(text).toContain('*1 more umpire needed*');
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
    expect(text).toContain('*Need 2 umpires here, can anyone cover?*');
    // Both open slots are on ONE match, so no aggregate line.
    expect(text).not.toContain('Still need');
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
    expect(two).toContain('*Still need 2 umpires. Please help if you can.*');

    const one = buildDutyShareText([duty({ status: 'open' })], { today: TODAY })!;
    expect(one).not.toContain('Still need');
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
    expect(text).toContain('*All duties covered. Thanks everyone.*');
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
    expect(text.split('\n')[0]).toBe('*Sunrisers umpiring duties*');
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
    expect(t).toContain('*Stood (2)*');
    expect(t).toContain('*Upcoming (1)*');
    expect(t).toContain('*Yet to umpire (1)*');
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
    expect(withOpen).toContain('*2 umpiring spots are still open. Please help if you can.*');
    expect(withOpen).toContain('Add your name');

    // Nagging about duties that do not exist yet is pure noise.
    const noOpen = buildRosterSummaryText(rows, { openSlots: 0 })!;
    expect(noOpen).toContain('*Everything is covered for now, thanks.*');
    expect(noOpen).not.toContain('Add your name');
  });

  it('counts SPOTS, not duties or matches, and gets singular right', () => {
    // "1 duty needs an umpire" is circular; "1 match needs someone" is wrong
    // when a match already has one umpire or needs two.
    const one = buildRosterSummaryText(rows, { openSlots: 1 })!;
    expect(one).toContain('*1 umpiring spot is still open. Please help if you can.*');
    expect(one).not.toContain('needs an umpire');

    const many = buildRosterSummaryText(rows, { openSlots: 3 })!;
    expect(many).toContain('*3 umpiring spots are still open. Please help if you can.*');
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
    expect(t).toContain('Everything is covered for now');
    expect(t).not.toContain('No duties open');
  });

  it('celebrates when the whole squad has stood', () => {
    const t = buildRosterSummaryText(
      [{ name: 'A', completed: 1, booked: 0 }, { name: 'B', completed: 1, booked: 0 }],
      { openSlots: 0 },
    )!;
    expect(t).toContain('*Everyone has stood at least once. Thanks all.*');
    expect(t).not.toContain('Yet to umpire');
  });

  it('respects a raised target', () => {
    const t = buildRosterSummaryText(
      [{ name: 'One', completed: 1, booked: 0 }, { name: 'Two', completed: 2, booked: 0 }],
      { target: 2, openSlots: 0 },
    )!;
    // Only the player with 2 counts as done when the target is 2.
    expect(t).toContain('*Stood (1)*');
    expect(t).toContain('*Yet to umpire (1)*');
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

describe('buildPlayerMessageText', () => {
  it('reminds them about a duty coming up, with the details', () => {
    const text = buildPlayerMessageText(
      'Kittu',
      [duty({ status: 'claimed', assigned_player_id: 'p1', match_date: '2026-08-29' })],
      { today: TODAY },
    )!;
    expect(text).toContain('Kittu');
    expect(text).toContain('California Super Kings v Oakwood Mavericks');
    expect(text).toContain('10:45 AM');
    expect(text).toContain('Hansen Park');
    expect(text).not.toContain('MTCA');
  });

  it('mentions further duties only when there is more than one', () => {
    const one = buildPlayerMessageText(
      'Kittu',
      [duty({ status: 'claimed', match_date: '2026-08-29' })],
      { today: TODAY },
    )!;
    expect(one).not.toContain('more coming up');

    const two = buildPlayerMessageText(
      'Kittu',
      [
        duty({ status: 'claimed', match_date: '2026-08-29' }),
        duty({ status: 'claimed', match_date: '2026-09-05' }),
      ],
      { today: TODAY },
    )!;
    expect(two).toContain('1 more coming up');
    // The reminder must name the SOONEST one.
    expect(two).toContain('Saturday, Aug 29');
  });

  it('asks when they have never stood and spots are open', () => {
    const text = buildPlayerMessageText('Srinivas', [], { today: TODAY, openSlots: 2 })!;
    expect(text).toContain('2 spots are still open');
    expect(text).toContain('Could you take one?');
    expect(text).toContain('viberstoolkit.com/cricket/umpiring');
    expect(text).toContain("reply here and I'll add you");
  });

  it('leads the ask with the rule, not with what they have not done', () => {
    // Tone is the point: a volunteer rota message that opens by naming the
    // person's omission does not get replies.
    const text = buildPlayerMessageText('Srinivas', [], { today: TODAY, openSlots: 1 })!;
    expect(text).toContain('Every player stands as umpire at least once');
    expect(text).not.toMatch(/you (have not|haven't|still owe)/i);
    expect(text).toContain('1 spot is still open');
  });

  it('returns null when they have never stood and nothing is open', () => {
    // There is no honest message here — we cannot ask for a spot that does not
    // exist, and "you still owe one" with no way to act is just a complaint.
    expect(buildPlayerMessageText('Srinivas', [], { today: TODAY, openSlots: 0 })).toBeNull();
  });

  it('thanks somebody who has already stood', () => {
    const once = buildPlayerMessageText(
      'Adi',
      [duty({ status: 'completed', match_date: '2026-07-04' })],
      { today: TODAY, openSlots: 3 },
    )!;
    expect(once).toContain('Thanks for standing as umpire this season');

    const twice = buildPlayerMessageText(
      'Ashok',
      [
        duty({ status: 'completed', match_date: '2026-07-04' }),
        duty({ status: 'completed', match_date: '2026-07-18' }),
      ],
      { today: TODAY, openSlots: 3 },
    )!;
    expect(twice).toContain('2 times');
  });

  it('does not treat a past unmarked claim as upcoming', () => {
    // A claim on a match already played is not a reminder — nothing to remind
    // them about, and the date would read as being in the future.
    const text = buildPlayerMessageText(
      'Madhu',
      [duty({ status: 'claimed', match_date: '2026-08-01' })],
      { today: TODAY, openSlots: 1 },
    )!;
    expect(text).not.toContain('Umpiring reminder');
    expect(text).toContain('Could you take one?');
  });

  describe('season name', () => {
    // Real season names run to ~36 characters, so they get their own line
    // instead of being inlined into a sentence.
    const SEASON = '2026 MTCA Spring League · Division D';

    it('names the season on its own line and drops "this season"', () => {
      const text = buildPlayerMessageText(
        'Venkat',
        [duty({ status: 'completed', match_date: '2026-07-04' })],
        { today: TODAY, seasonName: SEASON },
      )!;
      expect(text).toContain(`_${SEASON}_`);
      expect(text.split('\n')[1]).toBe(`_${SEASON}_`);
      // Not both — "as umpire this season, 2026 MTCA Spring League" says it twice.
      expect(text).not.toContain('this season');
      expect(text).toContain('Thanks for standing as umpire, much appreciated.');
    });

    it('names it in the ask too', () => {
      const text = buildPlayerMessageText('Srinivas', [], {
        today: TODAY, openSlots: 2, seasonName: SEASON,
      })!;
      expect(text).toContain(`_${SEASON}_`);
      expect(text).toContain('Every player stands as umpire at least once, and 2 spots');
      expect(text).not.toContain('this season');
    });

    it('names it on a reminder', () => {
      const text = buildPlayerMessageText(
        'Venkat',
        [duty({ status: 'claimed', match_date: '2026-08-29' })],
        { today: TODAY, seasonName: SEASON },
      )!;
      expect(text).toContain(`_${SEASON}_`);
    });

    it('falls back to the words "this season" when unknown', () => {
      const text = buildPlayerMessageText(
        'Venkat',
        [duty({ status: 'completed', match_date: '2026-07-04' })],
        { today: TODAY },
      )!;
      expect(text).toContain('as umpire this season');
      expect(text).not.toContain('_');
    });

    it('keeps the repeat count alongside the season', () => {
      const text = buildPlayerMessageText(
        'Ashok',
        [
          duty({ status: 'completed', match_date: '2026-07-04' }),
          duty({ status: 'completed', match_date: '2026-07-18' }),
        ],
        { today: TODAY, seasonName: SEASON },
      )!;
      expect(text).toContain('as umpire 2 times, much appreciated.');
    });
  });

  it('ignores deleted and swapped-away duties', () => {
    const text = buildPlayerMessageText(
      'Madhu',
      [
        duty({ status: 'claimed', match_date: '2026-08-29', deleted_at: '2026-08-20T00:00:00Z' }),
        duty({ status: 'cancelled', cancelled_reason: 'admin', match_date: '2026-08-30' }),
      ],
      { today: TODAY, openSlots: 1 },
    )!;
    // Neither counts, so this falls through to the ask.
    expect(text).toContain('Could you take one?');
  });
});

describe('buildAssignedReminderText', () => {
  const claimed = (over: Partial<CricketUmpiringDuty> = {}) =>
    duty({ status: 'claimed', assigned_player_id: 'p1', assigned_player_name: 'Madhu G', ...over });

  it('names one person and their match', () => {
    const text = buildAssignedReminderText([claimed()], { today: TODAY })!;
    expect(text).toContain('Hi Madhu');
    expect(text).toContain('California Super Kings v Oakwood Mavericks');
    expect(text).toContain('Umpire: Madhu');
    expect(text).toContain('10:45 AM');
    expect(text).toContain('Hansen Park');
  });

  // Asserted as WHOLE LINES, not substrings. `toContain('and Mani')` also
  // matches "and Manigopal", so a substring assertion here passes for the wrong
  // reason and would not catch a broken join.
  const greeting = (text: string) => text.split('\n').find((l) => l.startsWith('Hi '));

  it('joins two names with "and", not a comma', () => {
    // "Madhu, Mani" reads like a roster printout; "Madhu and Mani" reads like
    // someone talking to them.
    const text = buildAssignedReminderText([
      claimed({ role_slot: 1, assigned_player_name: 'Madhu G' }),
      claimed({ role_slot: 2, assigned_player_name: 'Mani V', cricclubs_fixture_id: 6000 }),
    ], { today: TODAY })!;
    expect(greeting(text)).toBe('Hi Madhu and Mani');
  });

  it('uses "A, B and C" beyond two', () => {
    const text = buildAssignedReminderText([
      claimed({ assigned_player_name: 'Madhu G', cricclubs_fixture_id: 1 }),
      claimed({ assigned_player_name: 'Mani V', cricclubs_fixture_id: 2, match_date: '2026-08-30' }),
      claimed({ assigned_player_name: 'Naresh Muthaluru', cricclubs_fixture_id: 3, match_date: '2026-08-31' }),
    ], { today: TODAY })!;
    expect(greeting(text)).toBe('Hi Madhu, Mani and Naresh');
  });

  it('uses first names only', () => {
    const text = buildAssignedReminderText([
      claimed({ assigned_player_name: 'Venkat Gudala (Kittu)' }),
    ], { today: TODAY })!;
    expect(text).toContain('Hi Venkat');
    expect(text).not.toContain('Gudala');
  });

  it('groups two umpires on ONE fixture into a single block', () => {
    // Two slots on one match is one commitment — printing the match twice
    // reads as two separate duties.
    const text = buildAssignedReminderText([
      claimed({ role_slot: 1, cricclubs_fixture_id: 500, assigned_player_name: 'Madhu G' }),
      claimed({ role_slot: 2, cricclubs_fixture_id: 500, assigned_player_name: 'Mani V' }),
    ], { today: TODAY })!;
    const occurrences = text.split('California Super Kings v Oakwood Mavericks').length - 1;
    expect(occurrences).toBe(1);
    expect(text.split('\n')).toContain('Umpire: Madhu and Mani');
  });

  it('lists each match separately across a weekend', () => {
    const text = buildAssignedReminderText([
      claimed({ cricclubs_fixture_id: 1, match_date: '2026-08-29', assigned_player_name: 'Madhu G' }),
      claimed({ cricclubs_fixture_id: 2, match_date: '2026-08-30', assigned_player_name: 'Naresh M' }),
    ], { today: TODAY })!;
    expect(text).toContain('Saturday, Aug 29');
    expect(text).toContain('Sunday, Aug 30');
    expect(text).toContain('coming up');
  });

  it('names each person once in the greeting even with two duties', () => {
    const text = buildAssignedReminderText([
      claimed({ cricclubs_fixture_id: 1, match_date: '2026-08-29' }),
      claimed({ cricclubs_fixture_id: 2, match_date: '2026-08-30' }),
    ], { today: TODAY })!;
    expect(text.match(/Hi Madhu/g)).toHaveLength(1);
    expect(text).not.toContain('Hi Madhu and Madhu');
  });

  it('excludes open slots — those belong in the volunteer ask', () => {
    const text = buildAssignedReminderText([
      claimed(),
      duty({ status: 'open', cricclubs_fixture_id: 999 }),
    ], { today: TODAY })!;
    expect(text).not.toContain('needed');
    expect(text).not.toContain('can anyone');
  });

  it('excludes past, cancelled and deleted duties', () => {
    expect(buildAssignedReminderText([
      claimed({ match_date: '2026-08-01' }),
    ], { today: TODAY })).toBeNull();

    expect(buildAssignedReminderText([
      claimed({ status: 'cancelled', cancelled_reason: 'admin' }),
    ], { today: TODAY })).toBeNull();

    expect(buildAssignedReminderText([
      claimed({ deleted_at: '2026-08-20T00:00:00Z' }),
    ], { today: TODAY })).toBeNull();
  });

  it('returns null when nobody is assigned, so the button can hide', () => {
    expect(buildAssignedReminderText([], { today: TODAY })).toBeNull();
    expect(buildAssignedReminderText([duty({ status: 'open' })], { today: TODAY })).toBeNull();
  });

  it('strips the MTCA prefix', () => {
    const text = buildAssignedReminderText([claimed()], { today: TODAY })!;
    expect(text).not.toContain('MTCA');
  });
});

describe('buildThanksText', () => {
  const match = { date: '2026-08-23', teamA: 'MTCA Sky Risers', teamB: 'MTCA Valley Risers', venue: 'Woodward Park 2' };

  it('thanks one person', () => {
    const text = buildThanksText(['Madhu'], match)!;
    expect(text).toContain('*Thanks Madhu*');
    expect(text).toContain('You stood as umpire');
    expect(text).toContain('Sky Risers v Valley Risers');
    expect(text).not.toContain('MTCA');
  });

  it('thanks two with "and", and switches to "You both"', () => {
    const text = buildThanksText(['Madhu', 'Mani'], match)!;
    expect(text).toContain('*Thanks Madhu and Mani*');
    expect(text).toContain('You both stood as umpire');
  });

  it('includes the venue only when there is one', () => {
    expect(buildThanksText(['Madhu'], match)!).toContain('At Woodward Park 2');
    expect(buildThanksText(['Madhu'], { ...match, venue: null })!).not.toContain('Woodward');
  });

  it('returns null with nobody to thank', () => {
    expect(buildThanksText([], match)).toBeNull();
    expect(buildThanksText(['  '], match)).toBeNull();
  });
});

describe('whatsappShareUrl', () => {
  it('builds a wa.me link with no phone number, so any chat can be picked', () => {
    const url = whatsappShareUrl('hello');
    expect(url).toBe('https://wa.me/?text=hello');
  });

  it('percent-encodes the characters that would break a URL', () => {
    // Raw newlines or spaces would truncate the message at the first one.
    // Note `*` is deliberately NOT encoded — encodeURIComponent leaves the
    // unreserved set (-_.!~*'()) alone, and a literal * is valid in a query
    // string, so WhatsApp still receives the bold markup intact.
    const url = whatsappShareUrl('🏏 *Bold*\nsecond line');
    expect(url).toContain('%0A');   // newline
    expect(url).not.toContain('\n');
    expect(url).not.toContain(' ');
    expect(url).toContain('%F0%9F%8F%8F'); // emoji
  });

  it('round-trips the exact message text', () => {
    const text = buildRosterSummaryText(
      [{ name: "O'Brien", completed: 1, booked: 0 }],
      { openSlots: 2 },
    )!;
    const decoded = decodeURIComponent(whatsappShareUrl(text).replace('https://wa.me/?text=', ''));
    expect(decoded).toBe(text);
  });
});

/**
 * These messages go out under a real person's name, so they have to read like
 * that person typed them. Emoji-per-line is the single loudest tell that a
 * machine wrote it, and it creeps back one line at a time — somebody adds a
 * "🙏" to soften an ask and nothing objects. This is the thing that objects.
 *
 * Every branch of every template is exercised, not one sample of each: the
 * old emoji lived in the closings and the ask lines, which are exactly the
 * branches a single happy-path call never reaches.
 */
describe('house voice', () => {
  const EMOJI = /\p{Extended_Pictographic}/u;

  const claimedDuty = (over: Partial<CricketUmpiringDuty> = {}) =>
    duty({ status: 'claimed', assigned_player_name: 'Madhu G', ...over });

  const everyMessage = (): Array<[string, string]> => {
    const out: Array<[string, string]> = [];
    const push = (label: string, text: string | null) => {
      if (text !== null) out.push([label, text]);
    };

    // buildDutyShareText — open, partly covered, fully covered, and a clash.
    push('share/open', buildDutyShareText([duty({ status: 'open' })], { today: TODAY }));
    push('share/two-open', buildDutyShareText([
      duty({ cricclubs_fixture_id: 401, status: 'open', team_a: 'MTCA A', team_b: 'MTCA B' }),
      duty({ cricclubs_fixture_id: 402, status: 'open', team_a: 'MTCA C', team_b: 'MTCA D' }),
    ], { today: TODAY }));
    push('share/partial', buildDutyShareText([
      claimedDuty({ cricclubs_fixture_id: 403, role_slot: 1 }),
      duty({ cricclubs_fixture_id: 403, role_slot: 2, status: 'open' }),
    ], { today: TODAY }));
    push('share/covered', buildDutyShareText([claimedDuty()], { today: TODAY }));
    push('share/clash', buildDutyShareText([
      duty({ cricclubs_fixture_id: 404, match_time: '07:15', venue: 'A', team_a: 'MTCA A', team_b: 'MTCA B' }),
      duty({ cricclubs_fixture_id: 405, match_time: '07:15', venue: 'B', team_a: 'MTCA C', team_b: 'MTCA D' }),
    ], { today: TODAY }));

    // buildRosterSummaryText — all three closings.
    const roster = [
      { name: 'Ashok', completed: 1, booked: 0 },
      { name: 'Bhaskar', completed: 0, booked: 1 },
      { name: 'Naresh', completed: 0, booked: 0 },
    ];
    push('roster/open', buildRosterSummaryText(roster, { openSlots: 2 }));
    push('roster/one-open', buildRosterSummaryText(roster, { openSlots: 1 }));
    push('roster/nothing-claimable', buildRosterSummaryText(roster, { openSlots: 0 }));
    push('roster/all-stood', buildRosterSummaryText(
      [{ name: 'Ashok', completed: 1, booked: 0 }], { openSlots: 0 },
    ));

    // buildAssignedReminderText — one match and a weekend of them.
    push('reminder/one', buildAssignedReminderText([claimedDuty()], { today: TODAY }));
    push('reminder/many', buildAssignedReminderText([
      claimedDuty({ cricclubs_fixture_id: 501 }),
      claimedDuty({ cricclubs_fixture_id: 502, match_date: '2026-08-30', assigned_player_name: 'Mani V' }),
    ], { today: TODAY }));

    // buildThanksText — one name, two names, and no venue.
    const match = { date: '2026-08-23', teamA: 'MTCA Sky Risers', teamB: 'MTCA Valley Risers', venue: 'Woodward Park 2' };
    push('thanks/one', buildThanksText(['Madhu'], match));
    push('thanks/two', buildThanksText(['Madhu', 'Mani'], match));
    push('thanks/no-venue', buildThanksText(['Madhu'], { ...match, venue: null }));

    // buildPlayerMessageText — reminder, ask, thanks, and the named-season forms.
    push('player/reminder', buildPlayerMessageText('Madhu', [claimedDuty()], { today: TODAY }));
    push('player/ask', buildPlayerMessageText('Madhu', [], { today: TODAY, openSlots: 2 }));
    push('player/thanks', buildPlayerMessageText(
      'Madhu', [claimedDuty({ status: 'completed', match_date: '2026-08-01' })], { today: TODAY },
    ));
    push('player/season', buildPlayerMessageText(
      'Madhu', [], { today: TODAY, openSlots: 1, seasonName: '2026 MTCA Fall League' },
    ));

    return out;
  };

  it('covers every template and branch', () => {
    // Guards the guard: if a builder starts returning null for these fixtures,
    // the emoji check below would silently stop testing it.
    expect(everyMessage().length).toBe(18);
  });

  it('never uses an emoji', () => {
    for (const [label, text] of everyMessage()) {
      const offending = text.split('\n').filter((l) => EMOJI.test(l));
      expect(offending, `${label} should be emoji-free`).toEqual([]);
    }
  });

  // NOTE: there is deliberately no "headings must be sentence case" test.
  // Headings legitimately contain proper nouns — the team name, a player's
  // first name, a ground — so any rule that flags a capital letter mid-heading
  // fires on "Umpiring reminder, Madhu" and on every new venue MTCA adds. It
  // would fail more often for being right than for being wrong, and a test
  // people learn to edit around is worse than no test. Sentence case is stated
  // as a rule in lib/duty-share.ts and left to review.
});
