// Regression tests for autoCompleteScheduleMatches.
//
// Bug (2026-06-13): a match played and synced the SAME day was excluded from
// auto-completion because the candidate query used `.lt('match_date', todayPT)`
// (strictly before today). The schedule row stayed result=null until the
// next-day run. Fix switched to `.lte` plus a same-day "still live" guard.
//
// Run:
//   cd supabase/functions/cricclubs-ingest
//   deno test --allow-env __tests__/auto-complete.test.ts

import { autoCompleteScheduleMatches } from '../full-sync.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

const TEAM_ID = '8284208d-fb02-44bf-bb8c-3c5411d35386'; // must match TEAM_ID_INTERNAL
const MY_NAME = 'Sunrisers Manteca';

// "today" exactly as the function computes it, so tests are deterministic
// regardless of when they run.
const todayPT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function ymdShift(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

type Row = Record<string, unknown>;

interface Dataset {
  scheduleRows: Row[];
  cricclubsMatches: Row[];
}

// Minimal chainable + thenable Supabase mock. `.lt/.lte/.eq/.is/.in` apply real
// filtering against the dataset so a regression from `.lte` back to `.lt`
// changes which rows are returned (and therefore the test outcome). UPDATE
// calls are captured for assertion.
function makeClient(data: Dataset) {
  const updates: Array<{ id: unknown; payload: Row }> = [];

  class Builder {
    table: string;
    mode: 'select' | 'update' = 'select';
    single = false;
    payload: Row | null = null;
    filters: Array<[string, string, unknown]> = [];
    constructor(table: string) { this.table = table; }
    select() { return this; }
    update(payload: Row) { this.mode = 'update'; this.payload = payload; return this; }
    eq(c: string, v: unknown) { this.filters.push(['eq', c, v]); return this; }
    is(c: string, v: unknown) { this.filters.push(['is', c, v]); return this; }
    lt(c: string, v: unknown) { this.filters.push(['lt', c, v]); return this; }
    lte(c: string, v: unknown) { this.filters.push(['lte', c, v]); return this; }
    in(c: string, v: unknown) { this.filters.push(['in', c, v]); return this; }
    maybeSingle() { this.single = true; return this; }
    _apply(rows: Row[]): Row[] {
      return rows.filter((r) => this.filters.every(([op, col, val]) => {
        const cell = r[col];
        switch (op) {
          case 'eq': return cell === val;
          case 'is': return val === null ? (cell === null || cell === undefined) : cell === val;
          case 'lt': return (cell as string) < (val as string);
          case 'lte': return (cell as string) <= (val as string);
          case 'in': return Array.isArray(val) && val.includes(cell);
          default: return true;
        }
      }));
    }
    then(
      resolve: (v: { data?: unknown; error: null }) => void,
      reject: (e: unknown) => void,
    ) {
      try {
        if (this.table === 'cricket_teams') {
          resolve({ data: { name: MY_NAME }, error: null });
          return;
        }
        if (this.mode === 'update') {
          for (const t of this._apply(data.scheduleRows)) {
            updates.push({ id: t.id, payload: this.payload as Row });
          }
          resolve({ error: null });
          return;
        }
        const src = this.table === 'cricket_schedule_matches'
          ? data.scheduleRows
          : this.table === 'cricclubs_matches'
            ? data.cricclubsMatches
            : [];
        const rows = this._apply(src);
        resolve({ data: this.single ? (rows[0] ?? null) : rows, error: null });
      } catch (e) {
        reject(e);
      }
    }
  }

  // deno-lint-ignore no-explicit-any
  const client = { from: (t: string) => new Builder(t) } as any;
  return { client, updates };
}

function cricclubsRow(matchDate: string, opponent: string, winner: string | null, resultText: string | null): Row {
  return {
    team_id: TEAM_ID,
    match_date: matchDate,
    team_a: `MTCA ${opponent}`,
    team_b: `MTCA ${MY_NAME}`,
    team_a_score: '120/8 (20.0/20)',
    team_b_score: '121/7 (19.4/20.0)',
    winner_team: winner,
    result_text: resultText,
  };
}

function scheduleRow(id: string, matchDate: string, opponent: string): Row {
  return { id, team_id: TEAM_ID, status: 'upcoming', result: null, match_date: matchDate, opponent };
}

Deno.test('completes a match played and synced the SAME day', async () => {
  const data: Dataset = {
    scheduleRows: [scheduleRow('s-today', todayPT, 'Golden Eagles')],
    cricclubsMatches: [
      cricclubsRow(todayPT, 'Golden Eagles', `MTCA ${MY_NAME}`, `MTCA ${MY_NAME} won by 3 Wickets`),
    ],
  };
  const { client, updates } = makeClient(data);
  const n = await autoCompleteScheduleMatches(client);
  assertEquals(n, 1);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].id, 's-today');
  assertEquals(updates[0].payload.result, 'won');
  assertEquals(updates[0].payload.status, 'completed');
});

Deno.test('does NOT complete a same-day match that is still live (no winner/result)', async () => {
  const data: Dataset = {
    scheduleRows: [scheduleRow('s-live', todayPT, 'Golden Eagles')],
    cricclubsMatches: [cricclubsRow(todayPT, 'Golden Eagles', null, null)],
  };
  const { client, updates } = makeClient(data);
  const n = await autoCompleteScheduleMatches(client);
  assertEquals(n, 0);
  assertEquals(updates.length, 0);
});

Deno.test('still completes a past-dated match (baseline)', async () => {
  const yesterday = ymdShift(todayPT, -1);
  const data: Dataset = {
    scheduleRows: [scheduleRow('s-past', yesterday, 'Hawks')],
    cricclubsMatches: [cricclubsRow(yesterday, 'Hawks', `MTCA ${MY_NAME}`, `MTCA ${MY_NAME} won by 6 Runs`)],
  };
  const { client, updates } = makeClient(data);
  const n = await autoCompleteScheduleMatches(client);
  assertEquals(n, 1);
  assertEquals(updates[0].id, 's-past');
});

Deno.test('ignores a future-dated match', async () => {
  const tomorrow = ymdShift(todayPT, 1);
  const data: Dataset = {
    scheduleRows: [scheduleRow('s-future', tomorrow, 'Chargers')],
    cricclubsMatches: [cricclubsRow(tomorrow, 'Chargers', `MTCA ${MY_NAME}`, 'won')],
  };
  const { client, updates } = makeClient(data);
  const n = await autoCompleteScheduleMatches(client);
  assertEquals(n, 0);
  assert(updates.length === 0);
});
