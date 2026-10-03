'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  Text,
  Skeleton,
  EmptyState,
  SegmentedControl,
} from '@/components/ui';
import { ChartColumnBig, Star, Hand, ListOrdered, Table2 } from 'lucide-react';
import { MdSportsCricket } from 'react-icons/md';
import { GiTennisBall } from 'react-icons/gi';
import SeasonSelector from '../../components/SeasonSelector';
import LeaderboardList from './LeaderboardList';
import LeaderboardTable, { type TableColumn } from './LeaderboardTable';
import PlayerDetailSheet from './PlayerDetailSheet';
import { AllRoundFormulaCard, CatchesRulesCard } from './TabIntroCards';
import {
  aggregateBatting,
  aggregateBowling,
  computePlayerHistory,
  matchIdsForLeague,
} from '../lib/seasonAggregates';
import {
  computeBestBowlingFigures,
  computeMatchesPlayed,
  extractRunOutFielders,
  compareBattingRows,
  compareBowlingRows,
  compareCatchesRows,
} from '../lib/computeStats';

// ── Types matching the Supabase views & raw tables ────────────────────────

type BattingSeasonRow = {
  team_id: string;
  player_id: string | null;
  player_name: string;
  innings: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  not_outs: number;
  dismissals: number;
  highest_score: number;
  batting_average: number | null;
  strike_rate: number | null;
};

type BowlingSeasonRow = {
  team_id: string;
  player_id: string | null;
  player_name: string;
  innings: number;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  bowling_average: number | null;
  economy: number | null;
  best_wickets: number;
};

// Full per-innings batting row (richer than the dismissal-only fetch we used
// before). Used both for catches parsing and for per-match detail panels.
type BattingMatchRow = {
  match_row_id: string;
  team_id: string;
  player_id: string | null;
  cricclubs_name: string;
  batting_team: string;
  innings_number: number;
  batting_position: number | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strike_rate: number | null;
  dismissal: string | null;
  not_out: boolean;
  did_not_bat: boolean;
};

type BowlingMatchRow = {
  match_row_id: string;
  team_id: string;
  player_id: string | null;
  cricclubs_name: string;
  bowling_team: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number | null;
};

type MatchRow = {
  id: string;
  team_id: string;
  team_a: string;
  team_b: string;
  match_date: string | null;
  winner_team: string | null;
  league_name: string | null;
  division: string | null;
  /** Joins to cricket_seasons.cricclubs_league_id — the ONLY reliable link
   *  from a scraped scorecard back to a season. Never scope by date: MTCA
   *  issues a new league per season and dates shift. */
  cricclubs_league_id: number | null;
};

type RosterRow = {
  id: string;
  name: string;
  photo_url?: string | null;
};

// `catches` is the Fielding tab — the key predates the label.
type Tab = 'batting' | 'bowling' | 'allround' | 'catches';

// Visual order of the discipline switch — the tab-body transition slides in
// from the direction of travel (moving right in this list enters from the
// right), so the page reads like a native pager rather than a stateless fade.
const TAB_ORDER: readonly Tab[] = ['batting', 'bowling', 'allround', 'catches'];
const TAB_OPTIONS = [
  { key: 'batting', label: 'Batting' },
  { key: 'bowling', label: 'Bowling' },
  { key: 'allround', label: 'All-round' },
  { key: 'catches', label: 'Fielding' },
];

// Ranked list = one figure per player with a bar showing the gap to the
// leader — the default, because the question people open this page with is
// "who is best at X?". Table = every stat in a sortable column. Persisted per
// device so the choice survives a reload. The stored value for the list is
// still 'cards' (what it was called before), so a saved choice carries over.
type ViewMode = 'cards' | 'table';
const VIEW_MODE_KEY = 'league-stats:view-mode';
const DEFAULT_VIEW_MODE: ViewMode = 'cards';

// localStorage is an external store, so it is read through
// useSyncExternalStore rather than a useState + useEffect pair. This page is
// statically exported: the prerendered HTML has no idea what the device
// prefers, so the server snapshot is always the default and React reconciles
// to the stored value after hydration without a mismatch warning.
let viewModeCache: ViewMode | null = null;
const viewModeListeners = new Set<() => void>();

function readViewMode(): ViewMode {
  // Cached because getSnapshot must return a referentially stable value —
  // re-reading localStorage on every render would loop.
  if (viewModeCache) return viewModeCache;
  try {
    // Only an explicit stored 'cards' opts out — anything else (unset,
    // corrupt, or a value from a future version) falls back to the default.
    viewModeCache = window.localStorage.getItem(VIEW_MODE_KEY) === 'cards'
      ? 'cards'
      : DEFAULT_VIEW_MODE;
  } catch {
    // Private mode / storage disabled — the default view is fine.
    viewModeCache = DEFAULT_VIEW_MODE;
  }
  return viewModeCache;
}

function writeViewMode(next: ViewMode): void {
  viewModeCache = next;
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, next);
  } catch {
    // Preference just won't persist; not worth surfacing to the user.
  }
  for (const listener of viewModeListeners) listener();
}

function subscribeViewMode(onChange: () => void): () => void {
  viewModeListeners.add(onChange);
  return () => { viewModeListeners.delete(onChange); };
}

// Shared cell formatters — a table column shows "—" for missing data rather
// than 0, so "never bowled" and "economy of zero" stay distinguishable.
const fmt1 = (v: number | null): string => (v == null ? '—' : v.toFixed(1));
const fmt2 = (v: number | null): string => (v == null ? '—' : v.toFixed(2));

type CatchesRow = {
  player_id: string;
  player_name: string;
  catches: number;
  // Run-outs credited to this fielder — a combined "run out (P1/P2)" credits
  // both players with one each (standard club-stats convention).
  runouts: number;
};

// Per-match catch event — used to render the catches detail panel
// (e.g. "vs Sapphires (Apr 25): 2 catches").
type CatchEvent = {
  catcher_player_id: string;
  match_row_id: string;
};

// Per-match run-out event — feeds the player sheet's match timeline.
type RunOutEvent = {
  fielder_player_id: string;
  match_row_id: string;
};

type AllRoundRow = {
  player_id: string;
  player_name: string;
  innings: number;
  runs: number;
  wickets: number;
  catches: number;
  score: number;
};

// ── Catches parsing ───────────────────────────────────────────────────────
//
// Cricclubs dismissal text follows a few patterns. We extract the FIELDER:
//   "c X b Y"           → fielder = X
//   "c †X b Y"          → fielder = X (wicketkeeper, with the dagger marker)
//   "c & b X"           → caught & bowled — fielder = X (the bowler)
//   "st †X b Y"         → stumped — credited as a "fielder" too for v1
// Anything else (run out, bowled, lbw, hit wicket, etc.) yields no fielder.
const extractFielderShortName = (dismissal: string): string | null => {
  const text = dismissal.trim();
  // Caught and bowled: the bowler is the fielder
  const cAndB = text.match(/^c\s*&\s*b\s+(.+)$/i);
  if (cAndB) return cAndB[1].trim();
  // Caught or stumped: capture the fielder name between the marker and "b"
  const std = text.match(/^(?:c|st)\s+(?:†\s*)?([^]+?)\s+b\s+/i);
  if (std) return std[1].trim();
  return null;
};

const computeCatches = (
  battingRows: BattingMatchRow[],
  roster: RosterRow[],
  myTeamName: string,
): { totals: CatchesRow[]; events: CatchEvent[]; runoutEvents: RunOutEvent[] } => {
  // Catches and run-outs are credited to fielders on the OPPOSING team in a
  // given innings. In our data, our roster's fielding is recorded only when
  // the batting_team is NOT our team (the opposition batting, us fielding).
  const counts = new Map<string, number>();
  const runoutCounts = new Map<string, number>();
  const events: CatchEvent[] = [];
  const runoutEvents: RunOutEvent[] = [];
  // Prefix-match against roster names (case-insensitive). Cricclubs uses
  // short forms like "Bhaskar B" vs roster "Bhaskar Baachi"; prefix wins.
  const matchRoster = (shortName: string): RosterRow | undefined => {
    const low = shortName.toLowerCase();
    return roster.find((r) => r.name.toLowerCase().startsWith(low));
  };
  for (const d of battingRows) {
    if (!d.dismissal) continue;
    if (d.batting_team === myTeamName) continue; // we batted; opposition fielded
    const fielder = extractFielderShortName(d.dismissal);
    if (fielder) {
      const match = matchRoster(fielder);
      if (match) {
        counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
        events.push({ catcher_player_id: match.id, match_row_id: d.match_row_id });
      }
    }
    // Run-outs: "run out (P1)" or combined "run out (P1/P2)" — both fielders
    // get one credit each.
    for (const ro of extractRunOutFielders(d.dismissal)) {
      const match = matchRoster(ro);
      if (match) {
        runoutCounts.set(match.id, (runoutCounts.get(match.id) ?? 0) + 1);
        runoutEvents.push({ fielder_player_id: match.id, match_row_id: d.match_row_id });
      }
    }
  }
  // Union of catchers and run-out fielders — a player with only run-outs
  // still earns a row on the fielding leaderboard.
  const ids = new Set([...counts.keys(), ...runoutCounts.keys()]);
  const totals = [...ids].map((player_id) => {
    const r = roster.find((p) => p.id === player_id)!;
    return {
      player_id,
      player_name: r.name,
      catches: counts.get(player_id) ?? 0,
      runouts: runoutCounts.get(player_id) ?? 0,
    };
  });
  return { totals, events, runoutEvents };
};

const computeAllRound = (
  batting: BattingSeasonRow[],
  bowling: BowlingSeasonRow[],
  catches: CatchesRow[],
): AllRoundRow[] => {
  const byPlayer = new Map<string, AllRoundRow>();
  const ensure = (id: string, name: string) => {
    if (!byPlayer.has(id)) {
      byPlayer.set(id, {
        player_id: id,
        player_name: name,
        innings: 0,
        runs: 0,
        wickets: 0,
        catches: 0,
        score: 0,
      });
    }
    return byPlayer.get(id)!;
  };
  for (const b of batting) {
    if (!b.player_id) continue;
    const r = ensure(b.player_id, b.player_name);
    r.runs = b.runs;
    r.innings = Math.max(r.innings, b.innings);
  }
  for (const b of bowling) {
    if (!b.player_id) continue;
    const r = ensure(b.player_id, b.player_name);
    r.wickets = b.wickets;
    r.innings = Math.max(r.innings, b.innings);
  }
  for (const c of catches) {
    const r = ensure(c.player_id, c.player_name);
    r.catches = c.catches;
  }
  // Score formula: runs/25 + wickets + catches/2 — common all-rounder weighting.
  for (const r of byPlayer.values()) {
    r.score = +(r.runs / 25 + r.wickets + r.catches / 2).toFixed(2);
  }
  // Only include players who actually contributed in ≥2 disciplines.
  return [...byPlayer.values()]
    .filter((r) => [r.runs > 0, r.wickets > 0, r.catches > 0].filter(Boolean).length >= 2)
    .sort((a, b) => b.score - a.score);
};


/**
 * Season header: the season pill, and on the right the season's record with
 * the last five results under it (oldest to newest, newest on the right, the
 * way a scorebook reads). Win/loss is the one place this page uses colour,
 * because there it carries meaning.
 *
 * Deliberately NOT sticky: `main { overflow-x: hidden }` in globals.css makes
 * `main` a scroll container, which neutralises descendant sticky altogether.
 */
type FormOutcome = 'won' | 'lost' | 'draw';
function SeasonHeader({
  won, lost, undecided, total, formDescending, seasonSelector,
}: {
  won: number;
  lost: number;
  undecided: number;
  total: number;
  formDescending: FormOutcome[];
  seasonSelector: React.ReactNode;
}) {
  const recent = formDescending.slice(0, 5).reverse();
  const word = (o: FormOutcome) => (o === 'won' ? 'won' : o === 'lost' ? 'lost' : 'drawn');
  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <div className="min-w-0">{seasonSelector}</div>
      {total > 0 && (
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <span
            className="text-[17px] font-semibold leading-none tabular-nums text-[var(--text)]"
            aria-label={`${won} won, ${lost} lost${undecided > 0 ? `, ${undecided} undecided` : ''}`}
          >
            {won}<span className="text-[13px] font-medium text-[var(--muted)]"> W</span>
            <span className="ml-2">{lost}</span><span className="text-[13px] font-medium text-[var(--muted)]"> L</span>
          </span>
          {recent.length > 0 && (
            <span
              className="flex items-center gap-1 text-[12px] font-semibold leading-none"
              aria-label={`Last ${recent.length}, newest last: ${recent.map(word).join(', ')}`}
            >
              {recent.map((o, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="w-3 text-center"
                  style={{ color: o === 'won' ? 'var(--credit-text)' : o === 'lost' ? 'var(--danger-text)' : 'var(--muted)' }}
                >
                  {o === 'won' ? 'W' : o === 'lost' ? 'L' : 'D'}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function LeagueStatsView() {
  const { currentTeamId, userTeams } = useAuthStore();
  // Pull the cricket-store's seasons loader. Landing directly on
  // /cricket/league-stats (no prior cricket-page visit) leaves `seasons`
  // empty, which makes the SeasonSelector in the hero render "No seasons".
  // Trigger a load on mount — cheap query, idempotent.
  const loadSeasons = useCricketStore((s) => s.loadSeasons);
  // Seasons and the current selection now DRIVE this page's figures, so unlike
  // before they are subscribed to: changing the pill must re-scope the stats.
  const seasons = useCricketStore((s) => s.seasons);
  const selectedSeasonId = useCricketStore((s) => s.selectedSeasonId);
  useEffect(() => {
    loadSeasons().catch(() => {
      // Non-fatal — stats can render without seasons; the selector just
      // stays as "No seasons" until the next attempt.
    });
  }, [loadSeasons]);
  const cricclubsTeamName = useMemo(() => {
    // In cricclubs scorecards our team is named "MTCA Sunrisers Manteca";
    // here we accept whatever cricclubs uses by checking if the cricket_team
    // name is a suffix. Fallback to the literal string.
    const myTeam = userTeams.find((t) => t.team_id === currentTeamId);
    if (!myTeam) return 'MTCA Sunrisers Manteca';
    return `MTCA ${myTeam.team_name}`;
  }, [currentTeamId, userTeams]);

  const [tab, setTab] = useState<Tab>('batting');
  // Table by default (comparing the whole squad on one stat); Cards is the
  // opt-in for browsing one player at a time.
  const viewMode = useSyncExternalStore(
    subscribeViewMode,
    readViewMode,
    () => DEFAULT_VIEW_MODE,
  );

  // ── Tab-body transition choreography ────────────────────────────────────
  // Two different "verbs" for the two ways this content changes:
  //   tab switch   → directional slide (pager physics, from the travel side)
  //   view toggle  → scale+blur refocus (same data, different lens)
  // The class is resolved DURING render by diffing against refs of the last
  // committed tab/view — not in an effect — so the keyed wrapper below mounts
  // with the right animation on the very frame the content changes. Unrelated
  // re-renders (e.g. slow-tier data landing) leave both refs equal and the
  // class untouched, so the animation never replays spuriously.
  const prevTabRef = useRef<Tab>(tab);
  const prevViewRef = useRef<ViewMode>(viewMode);
  const bodyAnimRef = useRef('animate-tab-forward');
  if (tab !== prevTabRef.current) {
    bodyAnimRef.current =
      TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(prevTabRef.current)
        ? 'animate-tab-forward'
        : 'animate-tab-back';
    prevTabRef.current = tab;
  } else if (viewMode !== prevViewRef.current) {
    bodyAnimRef.current = 'animate-view-morph';
    prevViewRef.current = viewMode;
  }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Career aggregates from the two `_season` views. Used only as the fallback
   *  when a season cannot be scoped — see `scoped` below. */
  const [careerBatting, setCareerBatting] = useState<BattingSeasonRow[]>([]);
  const [careerBowling, setCareerBowling] = useState<BowlingSeasonRow[]>([]);
  /** The raw per-innings rows have arrived. Season-scoped figures are derived
   *  from them, so the page must not paint career numbers first and then swap —
   *  the figures would visibly change under the reader. */
  const [rawLoaded, setRawLoaded] = useState(false);
  /* The UNSCOPED rows as fetched. Nothing below should read these directly —
   * the season-scoped `battingMatches` / `bowlingMatches` / `matches` derived
   * further down shadow them deliberately, so every consumer is scoped by
   * default and forgetting to scope one is not possible. */
  const [battingMatchesAll, setBattingMatchesAll] = useState<BattingMatchRow[]>([]);
  const [bowlingMatchesAll, setBowlingMatchesAll] = useState<BowlingMatchRow[]>([]);
  const [matchesAll, setMatchesAll] = useState<MatchRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  // Bump to re-fire the data-load effect (used by the error-state Retry button).
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  // ── Phased load: render the main batting/bowling tables as soon as the
  // 4 fast aggregate queries return; let the heavier per-innings queries
  // (which only feed drilldowns + catches/all-rounder rankings) fill in
  // afterwards. ~30-50% perceived-load-time win when raw innings tables grow.
  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase client unavailable');
      setLoading(false);
      return;
    }

    // Fast tier — season aggregates, matches, roster (all small views/tables).
    Promise.all([
      supabase.from('cricclubs_batting_season').select('*').eq('team_id', currentTeamId),
      supabase.from('cricclubs_bowling_season').select('*').eq('team_id', currentTeamId),
      supabase
        .from('cricclubs_matches')
        .select('id, team_id, team_a, team_b, match_date, winner_team, league_name, division, cricclubs_league_id')
        .eq('team_id', currentTeamId)
        .order('match_date', { ascending: true }),
      supabase
        .from('cricket_players')
        .select('id, name, photo_url')
        .eq('team_id', currentTeamId)
        .eq('is_active', true),
    ]).then(([bat, bowl, mch, ros]) => {
      if (cancelled) return;
      const err = bat.error ?? bowl.error ?? mch.error ?? ros.error;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setCareerBatting((bat.data ?? []) as BattingSeasonRow[]);
      setCareerBowling((bowl.data ?? []) as BowlingSeasonRow[]);
      setMatchesAll((mch.data ?? []) as MatchRow[]);
      setRoster((ros.data ?? []) as RosterRow[]);
      setLoading(false);
    });

    // Slow tier — raw per-innings rows for drilldowns + catches/all-rounders.
    // Fires concurrently; UI fills in when ready without blocking first paint.
    Promise.all([
      supabase
        .from('cricclubs_batting')
        .select(
          'match_row_id, team_id, player_id, cricclubs_name, batting_team, ' +
            'innings_number, batting_position, runs, balls, fours, sixes, ' +
            'strike_rate, dismissal, not_out, did_not_bat',
        )
        .eq('team_id', currentTeamId),
      supabase
        .from('cricclubs_bowling')
        .select(
          'match_row_id, team_id, player_id, cricclubs_name, bowling_team, ' +
            'overs, maidens, runs, wickets, economy',
        )
        .eq('team_id', currentTeamId),
    ]).then(([batm, bowm]) => {
      if (cancelled) return;
      // Per-innings errors don't block the main UI — log and continue.
      if (batm.error || bowm.error) {
        console.warn('League stats: per-innings load failed', batm.error ?? bowm.error);
        return;
      }
      setBattingMatchesAll((batm.data ?? []) as BattingMatchRow[]);
      setBowlingMatchesAll((bowm.data ?? []) as BowlingMatchRow[]);
      setRawLoaded(true);
    });

    return () => { cancelled = true; };
  }, [currentTeamId, reloadKey]);

  /* ── Season scoping ─────────────────────────────────────────────────────
   *
   * Everything below this point sees ONLY the selected season's data.
   *
   * The season pill on this page used to be decorative — `selectedSeasonId`
   * was never read here, and every query filtered by team alone. Invisible
   * while one season had data; the day Fall's first scorecard landed, tapping
   * "Fall 2026" would have shown Spring and Fall added together.
   *
   * Scoping is by cricclubs LEAGUE id, never by date.
   *
   * A selected season with NO league id scopes to the EMPTY set, not to career
   * figures. That distinction is the whole point: MTCA has not published Fall's
   * league yet, so Fall cannot have a single match attributed to it — and
   * showing Spring's 13 matches under a "Fall 2026" pill is precisely the lie
   * this change exists to remove. Empty and honest beats populated and wrong.
   *
   * Career figures are therefore only used when NO season is selected at all.
   */
  const season = seasons.find((s) => s.id === selectedSeasonId);
  const seasonLeagueId = season?.cricclubs_league_id ?? null;

  const seasonMatchIds = useMemo(
    () => {
      if (!season) return null;
      return matchIdsForLeague(matchesAll, seasonLeagueId) ?? new Set<string>();
    },
    [season, matchesAll, seasonLeagueId],
  );
  /** True when figures on screen are this season's rather than career-wide. */
  const scoped = seasonMatchIds !== null;

  // These three shadow the raw state above, so every downstream consumer —
  // the W/L record, the streak, top performers, matches played, best figures,
  // the per-player drilldowns — is season-scoped without needing to know.
  const matches = useMemo(
    () => (seasonMatchIds ? matchesAll.filter((m) => seasonMatchIds.has(m.id)) : matchesAll),
    [matchesAll, seasonMatchIds],
  );
  const battingMatches = useMemo(
    () => (seasonMatchIds ? battingMatchesAll.filter((r) => seasonMatchIds.has(r.match_row_id)) : battingMatchesAll),
    [battingMatchesAll, seasonMatchIds],
  );
  const bowlingMatches = useMemo(
    () => (seasonMatchIds ? bowlingMatchesAll.filter((r) => seasonMatchIds.has(r.match_row_id)) : bowlingMatchesAll),
    [bowlingMatchesAll, seasonMatchIds],
  );

  const rosterNameById = useMemo(
    () => new Map(roster.map((r) => [r.id, r.name])),
    [roster],
  );

  /**
   * Batting/bowling aggregates for the scope in force.
   *
   * When scoped, these are recomputed client-side from the raw innings rows by
   * `seasonAggregates`, which reproduces the two views' SQL exactly — the sum
   * of every season is asserted to equal the career total in
   * tests/unit/season-aggregates.test.ts. When not scoped, the views' own
   * output is used unchanged.
   */
  const batting = useMemo<BattingSeasonRow[]>(
    () => (scoped
      ? aggregateBatting(battingMatches, rosterNameById) as BattingSeasonRow[]
      : careerBatting),
    [scoped, battingMatches, rosterNameById, careerBatting],
  );
  const bowling = useMemo<BowlingSeasonRow[]>(
    () => (scoped
      ? aggregateBowling(bowlingMatches, rosterNameById) as BowlingSeasonRow[]
      : careerBowling),
    [scoped, bowlingMatches, rosterNameById, careerBowling],
  );

  // Derived: catches + run-outs (totals + per-match events) and all-rounders
  const { catchesTotals, catchEvents, runoutEvents } = useMemo(() => {
    const r = computeCatches(battingMatches, roster, cricclubsTeamName);
    return { catchesTotals: r.totals, catchEvents: r.events, runoutEvents: r.runoutEvents };
  }, [battingMatches, roster, cricclubsTeamName]);
  const allRound = useMemo(
    () => computeAllRound(batting, bowling, catchesTotals),
    [batting, bowling, catchesTotals],
  );

  // Lookup: match_row_id → opponent name + display date.
  const matchLookup = useMemo(() => {
    const m = new Map<string, { opponent: string; date: string | null }>();
    for (const match of matches) {
      const opponent = match.team_a === cricclubsTeamName ? match.team_b : match.team_a;
      m.set(match.id, { opponent, date: match.match_date });
    }
    return m;
  }, [matches, cricclubsTeamName]);

  // Lookup: player_id → list of their batting / bowling rows / catches by match.
  const battingByPlayer = useMemo(() => {
    const m = new Map<string, BattingMatchRow[]>();
    for (const r of battingMatches) {
      if (!r.player_id) continue;
      if (!m.has(r.player_id)) m.set(r.player_id, []);
      m.get(r.player_id)!.push(r);
    }
    return m;
  }, [battingMatches]);

  const bowlingByPlayer = useMemo(() => {
    const m = new Map<string, BowlingMatchRow[]>();
    for (const r of bowlingMatches) {
      if (!r.player_id) continue;
      if (!m.has(r.player_id)) m.set(r.player_id, []);
      m.get(r.player_id)!.push(r);
    }
    return m;
  }, [bowlingMatches]);

  const catchesByPlayer = useMemo(() => {
    const m = new Map<string, Map<string, number>>(); // player_id -> match_row_id -> count
    for (const ev of catchEvents) {
      if (!m.has(ev.catcher_player_id)) m.set(ev.catcher_player_id, new Map());
      const inner = m.get(ev.catcher_player_id)!;
      inner.set(ev.match_row_id, (inner.get(ev.match_row_id) ?? 0) + 1);
    }
    return m;
  }, [catchEvents]);

  // Same shape for run-outs — feeds the player sheet's match timeline.
  const runoutsByPlayer = useMemo(() => {
    const m = new Map<string, Map<string, number>>(); // player_id -> match_row_id -> count
    for (const ev of runoutEvents) {
      if (!m.has(ev.fielder_player_id)) m.set(ev.fielder_player_id, new Map());
      const inner = m.get(ev.fielder_player_id)!;
      inner.set(ev.match_row_id, (inner.get(ev.match_row_id) ?? 0) + 1);
    }
    return m;
  }, [runoutEvents]);

  // Derived: W-L summary + recent form + current streak.
  const seasonOutcomes = useMemo(() => {
    const myKeyword = (cricclubsTeamName.match(/sunrisers.*/i)?.[0] ?? cricclubsTeamName).toLowerCase();
    type Outcome = 'won' | 'lost' | 'draw';
    const outcomes: { date: string; outcome: Outcome | 'pending' }[] = matches.map((m) => {
      if (!m.winner_team) return { date: m.match_date ?? '', outcome: 'pending' };
      const won = m.winner_team.toLowerCase().includes(myKeyword);
      return { date: m.match_date ?? '', outcome: won ? 'won' : 'lost' };
    });

    const total = matches.length;
    const won = outcomes.filter((o) => o.outcome === 'won').length;
    const lost = outcomes.filter((o) => o.outcome === 'lost').length;
    const undecided = total - won - lost;

    // Form is most-recent-first, decided matches only.
    const formDescending = outcomes
      .filter((o) => o.outcome !== 'pending')
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((o) => o.outcome as Outcome);

    // Streak: how many in a row of the most-recent outcome.
    let streak: { type: Outcome; count: number } | null = null;
    if (formDescending.length > 0) {
      const first = formDescending[0]!;
      let count = 1;
      for (let i = 1; i < formDescending.length; i++) {
        if (formDescending[i] === first) count += 1;
        else break;
      }
      if (count >= 2) streak = { type: first, count };
    }

    return { total, won, lost, undecided, formDescending, streak };
  }, [matches, cricclubsTeamName]);
  const summary = seasonOutcomes;

  // Best bowling figures per player ("4/18" display strings). Used in the
  // Bowling tab footer to surface the season-best spell per player.
  const bestBowlingByPlayer = useMemo(
    () => computeBestBowlingFigures(bowlingMatches),
    [bowlingMatches],
  );

  // player_id → matches played (distinct scorecards, batting OR bowling).
  // Built from the slow-tier per-innings rows, so it is empty on first paint;
  // the cards render "—" until it lands rather than a misleading 0.
  const matchesPlayedByPlayer = useMemo(
    () => computeMatchesPlayed(battingMatches, bowlingMatches),
    [battingMatches, bowlingMatches],
  );

  // player_id → photo_url Map for fast Avatar lookups across cards.
  const photoUrlByPlayer = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of roster) m.set(r.id, r.photo_url ?? null);
    return m;
  }, [roster]);

  // PlayerDetailSheet state — opens when a leaderboard card is tapped.
  // `context` is the originating tab so the sheet renders the right summary.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPlayerId, setSheetPlayerId] = useState<string | null>(null);
  const [sheetContext, setSheetContext] = useState<Tab>('batting');
  const openPlayerSheet = (playerId: string | null, ctx: Tab) => {
    if (!playerId) return;
    setSheetPlayerId(playerId);
    setSheetContext(ctx);
    setSheetOpen(true);
  };
  const closePlayerSheet = () => setSheetOpen(false);

  // Build the props object for PlayerDetailSheet when open.
  const sheetPlayer = useMemo(() => {
    if (!sheetPlayerId) return null;
    const rosterRow = roster.find((r) => r.id === sheetPlayerId);
    if (!rosterRow) return null;
    const bat = batting.find((b) => b.player_id === sheetPlayerId);
    const bowl = bowling.find((b) => b.player_id === sheetPlayerId);
    const ct = catchesTotals.find((c) => c.player_id === sheetPlayerId);
    return {
      player_id: sheetPlayerId,
      name: rosterRow.name,
      photo_url: rosterRow.photo_url ?? null,
      summary: {
        runs: bat?.runs,
        // Two separate counts, never coalesced. `bat?.innings ?? bowl?.innings`
        // meant the Bowling tab showed BATTING innings for anyone who had
        // batted — a wrong-but-plausible number that masked a real data bug.
        batting_innings: bat?.innings,
        bowling_innings: bowl?.innings,
        average: bat?.batting_average,
        strike_rate: bat?.strike_rate,
        wickets: bowl?.wickets,
        economy: bowl?.economy,
        best_wickets: bowl?.best_wickets,
        catches: ct?.catches,
        runouts: ct?.runouts,
        /**
         * Appearances, for the Fielding tile.
         *
         * It previously showed `bat?.innings`, so a player with 12 appearances
         * and 4 batting innings saw "4" next to his catch count — and it
         * disagreed with the leaderboard's own "Mat" column for the same
         * player. Catches accumulate per APPEARANCE, so appearances is the
         * denominator that makes them readable.
         */
        matches: matchesPlayedByPlayer.get(sheetPlayerId),
      },
    };
  }, [sheetPlayerId, roster, batting, bowling, catchesTotals, matchesPlayedByPlayer]);

  /** Label for the scope in force, shown above the sheet's stat tiles. */
  const scopeLabel = season
    ? `${season.season_type.charAt(0).toUpperCase()}${season.season_type.slice(1)} ${season.year}`
    : 'All time';

  /**
   * The open player's record season by season.
   *
   * Deliberately built from the UNSCOPED rows — this is the one thing in the
   * sheet that must cross seasons, since its whole job is the career context
   * the scoped tiles cannot show. Computed only while the sheet is open.
   */
  const sheetHistory = useMemo(() => {
    if (!sheetPlayerId) return undefined;
    return computePlayerHistory(
      sheetPlayerId,
      seasons.map((s) => ({
        id: s.id,
        label: `${s.season_type.charAt(0).toUpperCase()}${s.season_type.slice(1)} ${s.year}`,
        leagueId: s.cricclubs_league_id,
      })),
      matchesAll,
      battingMatchesAll,
      bowlingMatchesAll,
      rosterNameById,
    );
  }, [sheetPlayerId, seasons, matchesAll, battingMatchesAll, bowlingMatchesAll, rosterNameById]);

  /**
   * The skeleton mimics the final layout rather than showing generic
   * rectangles, so resolving does not shape-shift.
   *
   * `scoped && !rawLoaded` is the second condition and it matters: when a
   * season filter is in force the figures come from the raw innings rows, so
   * painting the career aggregates first and swapping when the raw rows land
   * would show every number changing under the reader. Better a slightly
   * longer skeleton than figures that visibly correct themselves.
   */
  if (loading || (scoped && !rawLoaded)) {
    return <LeagueStatsSkeleton viewMode={viewMode} />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<ChartColumnBig size={32} />}
        title="Couldn't load stats"
        description={error}
        action={{ label: 'Retry', onClick: reload }}
      />
    );
  }

  const tabCount = {
    batting: batting.length,
    bowling: bowling.length,
    allround: allRound.length,
    catches: catchesTotals.length,
  }[tab];

  return (
    <>
    <div className="space-y-4">
      <SeasonHeader
        won={summary.won}
        lost={summary.lost}
        undecided={summary.undecided}
        total={summary.total}
        formDescending={summary.formDescending}
        seasonSelector={<SeasonSelector />}
      />

      <SegmentedControl
        ariaLabel="Discipline"
        options={TAB_OPTIONS}
        active={tab}
        onChange={(key) => setTab(key as Tab)}
      />

      {/* List header: how many are ranked, and the list/table switch. The
          switch is a set-once-per-device preference, so it is a quiet icon
          here rather than a control of its own. */}
      {tabCount > 0 && (
        <div className="-mb-2 flex items-center justify-between pl-1">
          <Text size="sm" color="muted" tabular>
            {tabCount} {tabCount === 1 ? 'player' : 'players'}
          </Text>
          <button
            type="button"
            onClick={() => writeViewMode(viewMode === 'table' ? 'cards' : 'table')}
            aria-label={viewMode === 'table' ? 'Show as ranked list' : 'Show as table'}
            className="-mr-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--text)] transition-colors active:bg-[var(--hover-bg)]"
          >
            {viewMode === 'table' ? <ListOrdered size={20} aria-hidden /> : <Table2 size={19} aria-hidden />}
          </button>
        </div>
      )}

      {/* Wrapper is keyed on tab + viewMode so every change remounts it and
          replays the transition; WHICH transition (directional slide vs
          refocus) was resolved above from what actually changed. */}
      <div key={`${tab}-${viewMode}`} className={`${bodyAnimRef.current} space-y-5`}>
        {tab === 'batting' && (
          <BattingTabBody
            rows={batting}
            viewMode={viewMode}
            photoUrlByPlayer={photoUrlByPlayer}
            matchesPlayedByPlayer={matchesPlayedByPlayer}
            onPlayerTap={(id) => openPlayerSheet(id, 'batting')}
          />
        )}

        {tab === 'bowling' && (
          <BowlingTabBody
            rows={bowling}
            viewMode={viewMode}
            photoUrlByPlayer={photoUrlByPlayer}
            matchesPlayedByPlayer={matchesPlayedByPlayer}
            bestBowlingByPlayer={bestBowlingByPlayer}
            onPlayerTap={(id) => openPlayerSheet(id, 'bowling')}
          />
        )}

        {tab === 'allround' && (
          <>
            <AllRoundTabBody
              rows={allRound}
              viewMode={viewMode}
              photoUrlByPlayer={photoUrlByPlayer}
              matchesPlayedByPlayer={matchesPlayedByPlayer}
              onPlayerTap={(id) => openPlayerSheet(id, 'allround')}
            />
            {allRound.length > 0 && <AllRoundFormulaCard />}
          </>
        )}

        {tab === 'catches' && (
          <>
            <CatchesTabBody
              rows={catchesTotals}
              viewMode={viewMode}
              photoUrlByPlayer={photoUrlByPlayer}
              matchesPlayedByPlayer={matchesPlayedByPlayer}
              catchesByPlayer={catchesByPlayer}
              onPlayerTap={(id) => openPlayerSheet(id, 'catches')}
            />
            <CatchesRulesCard />
          </>
        )}
      </div>

    </div>

    {/* Player detail bottom sheet — opens from any tab's card tap or from
        a top-performer carousel tap. Renders the per-context summary +
        trends + match timeline + achievements. */}
    {sheetPlayer && (
      <PlayerDetailSheet
        open={sheetOpen}
        onClose={closePlayerSheet}
        context={sheetContext}
        player={sheetPlayer}
        battingInnings={battingByPlayer.get(sheetPlayer.player_id) ?? []}
        bowlingInnings={bowlingByPlayer.get(sheetPlayer.player_id) ?? []}
        catchesByMatch={catchesByPlayer.get(sheetPlayer.player_id)}
        runoutsByMatch={runoutsByPlayer.get(sheetPlayer.player_id)}
        matchLookup={matchLookup}
        history={sheetHistory}
        scopeLabel={scopeLabel}
      />
    )}
  </>
  );
}

/* Empty tab — the discipline's icon on a neutral well, and what will fill
   the space. Neutral like the rest of the page. */
function TabEmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--fill)] text-[var(--muted)]">
        {icon}
      </div>
      <Text as="h3" size="md" weight="semibold" className="mb-1">{title}</Text>
      <Text as="p" size="sm" color="muted" className="max-w-[260px] leading-relaxed">
        {description}
      </Text>
    </div>
  );
}

// ── Layout-mimicking loading skeleton ─────────────────────────────────────
//
// Mirrors the final shape (season header, discipline switch, list header,
// leaderboard body) so the page doesn't jump when data lands. It takes
// `viewMode` for exactly that reason: list rows resolving into a table would
// be the same disorienting shape-shift this exists to prevent.
// All blocks use the shared `<Skeleton>` shimmer so reduced-motion is honored.

function LeagueStatsSkeleton({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 pt-3">
        <Skeleton className="h-[38px] w-[150px] rounded-full" />
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-[17px] w-16 rounded-md" />
          <Skeleton className="h-3 w-[72px] rounded-md" />
        </div>
      </div>
      <Skeleton className="h-12 rounded-[14px]" />
      <div className="-mb-2 flex items-center justify-between pl-1">
        <Skeleton className="h-3.5 w-20 rounded-md" />
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>
      {viewMode === 'table' ? (
        <LeaderboardTableSkeleton />
      ) : (
        <div className="flex flex-col gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex min-h-[64px] items-center gap-3 py-2 pl-1 pr-3">
              <Skeleton className="h-3.5 w-6 rounded-md flex-shrink-0" />
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-3 w-44 rounded-md" />
              </div>
              <Skeleton className="h-6 w-10 rounded-md" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Table placeholder — header strip plus 8 rows, matching the real table's
   44px rhythm and its frozen-player-column split. */
function LeaderboardTableSkeleton() {
  return (
    <div
      className="overflow-hidden -mx-4 rounded-none border-b sm:mx-0 sm:rounded-2xl sm:border"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-center gap-2 px-2.5 h-11"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Skeleton className="h-3 w-14 rounded-md" />
        <div className="flex-1" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-3 w-6 rounded-md" />
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 px-2.5 h-11"
          style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 55%, transparent)' }}
        >
          <Skeleton className="h-3 w-3 rounded-md flex-shrink-0" />
          <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
          <Skeleton className="h-3.5 w-16 rounded-md" />
          <div className="flex-1" />
          {[0, 1, 2, 3, 4].map((j) => (
            <Skeleton key={j} className="h-3.5 w-6 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Table column definitions ──────────────────────────────────────────────
//
// One builder per tab. Each takes the matches-played lookup because "Mat" is
// the anchor column on every tab — it is the context every other number needs
// (219 runs off 12 matches reads very differently from 219 off 3).
//
// Order follows a scorecard's own reading order: appearances first, then the
// headline stat, then the qualifiers that explain it.

const matColumn = <Row,>(
  playerId: (row: Row) => string | null,
  matchesPlayedByPlayer: Map<string, number>,
): TableColumn<Row> => ({
  key: 'mat',
  label: 'Mat',
  title: 'Matches played (appeared on the scorecard, batting or bowling)',
  // null while the per-innings tables are still loading → renders "—" and
  // sorts to the bottom instead of pretending everyone played zero games.
  sortValue: (r) => {
    const id = playerId(r);
    return id ? matchesPlayedByPlayer.get(id) ?? null : null;
  },
  render: (r) => {
    const id = playerId(r);
    return (id ? matchesPlayedByPlayer.get(id) : undefined) ?? '—';
  },
});

const battingColumns = (
  matchesPlayedByPlayer: Map<string, number>,
): TableColumn<BattingSeasonRow>[] => [
  matColumn((r) => r.player_id, matchesPlayedByPlayer),
  { key: 'inn', label: 'Inn', title: 'Innings batted (excludes did-not-bat)', sortValue: (r) => r.innings, render: (r) => r.innings },
  { key: 'runs', label: 'Runs', title: 'Total runs', sortValue: (r) => r.runs, render: (r) => r.runs, primary: true },
  { key: 'hs', label: 'HS', title: 'Highest score', sortValue: (r) => r.highest_score, render: (r) => r.highest_score },
  { key: 'avg', label: 'Avg', title: 'Batting average', sortValue: (r) => r.batting_average, render: (r) => fmt1(r.batting_average) },
  { key: 'sr', label: 'SR', title: 'Strike rate', sortValue: (r) => r.strike_rate, render: (r) => fmt1(r.strike_rate) },
  { key: 'fours', label: '4s', title: 'Fours hit', sortValue: (r) => r.fours, render: (r) => r.fours },
  { key: 'sixes', label: '6s', title: 'Sixes hit', sortValue: (r) => r.sixes, render: (r) => r.sixes },
];

const bowlingColumns = (
  matchesPlayedByPlayer: Map<string, number>,
  bestBowlingByPlayer: Map<string, { wickets: number; runs: number; display: string }>,
): TableColumn<BowlingSeasonRow>[] => [
  matColumn((r) => r.player_id, matchesPlayedByPlayer),
  { key: 'ov', label: 'Ov', title: 'Overs bowled', sortValue: (r) => r.balls, render: (r) => `${Math.floor(r.balls / 6)}.${r.balls % 6}` },
  { key: 'wkts', label: 'Wkts', title: 'Wickets taken', sortValue: (r) => r.wickets, render: (r) => r.wickets, primary: true },
  {
    key: 'best',
    label: 'Best',
    title: 'Best figures in a match',
    // Sort by a composite: wickets dominate, runs conceded break the tie.
    // 1000 is comfortably above any amateur runs-conceded figure.
    sortValue: (r) => {
      const b = r.player_id ? bestBowlingByPlayer.get(r.player_id) : null;
      return b ? b.wickets * 1000 - b.runs : null;
    },
    render: (r) => {
      const b = r.player_id ? bestBowlingByPlayer.get(r.player_id) : null;
      return b ? b.display : '—';
    },
  },
  { key: 'avg', label: 'Avg', title: 'Bowling average (runs per wicket)', sortValue: (r) => r.bowling_average, render: (r) => fmt1(r.bowling_average), lowerIsBetter: true },
  { key: 'econ', label: 'Econ', title: 'Economy (runs per over)', sortValue: (r) => r.economy, render: (r) => fmt2(r.economy), lowerIsBetter: true },
];

const allRoundColumns = (
  matchesPlayedByPlayer: Map<string, number>,
): TableColumn<AllRoundRow>[] => [
  matColumn((r) => r.player_id, matchesPlayedByPlayer),
  { key: 'runs', label: 'Runs', title: 'Total runs', sortValue: (r) => r.runs, render: (r) => r.runs },
  { key: 'wkts', label: 'Wkts', title: 'Wickets taken', sortValue: (r) => r.wickets, render: (r) => r.wickets },
  { key: 'ct', label: 'Ct', title: 'Catches taken', sortValue: (r) => r.catches, render: (r) => r.catches },
  { key: 'score', label: 'Score', title: 'All-round score: runs/25 + wickets + catches/2', sortValue: (r) => r.score, render: (r) => r.score.toFixed(1), primary: true },
];

const catchesColumns = (
  matchesPlayedByPlayer: Map<string, number>,
  catchesByPlayer: Map<string, Map<string, number>>,
): TableColumn<CatchesRow>[] => [
  matColumn((r) => r.player_id, matchesPlayedByPlayer),
  { key: 'ct', label: 'Ct', title: 'Catches taken', sortValue: (r) => r.catches, render: (r) => r.catches, primary: true },
  {
    key: 'ro',
    label: 'RO',
    title: 'Run-outs (direct, or combined — both fielders credited)',
    sortValue: (r) => r.runouts,
    render: (r) => r.runouts,
  },
  {
    key: 'best',
    label: 'Best',
    title: 'Most catches in a single match',
    sortValue: (r) => {
      const m = catchesByPlayer.get(r.player_id);
      return m && m.size > 0 ? Math.max(...m.values()) : null;
    },
    render: (r) => {
      const m = catchesByPlayer.get(r.player_id);
      return m && m.size > 0 ? Math.max(...m.values()) : '—';
    },
  },
  {
    key: 'rate',
    label: 'Ct/M',
    title: 'Catches per match played',
    sortValue: (r) => {
      const played = matchesPlayedByPlayer.get(r.player_id);
      return played && played > 0 ? r.catches / played : null;
    },
    render: (r) => {
      const played = matchesPlayedByPlayer.get(r.player_id);
      return played && played > 0 ? (r.catches / played).toFixed(2) : '—';
    },
  },
];

/** "1 run-out", "3 run-outs". */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const detail = (...parts: Array<string | null>) => parts.filter(Boolean).join(' · ');

function BattingTabBody({
  rows, viewMode, photoUrlByPlayer, matchesPlayedByPlayer, onPlayerTap,
}: {
  rows: BattingSeasonRow[];
  viewMode: ViewMode;
  photoUrlByPlayer: Map<string, string | null>;
  matchesPlayedByPlayer: Map<string, number>;
  onPlayerTap: (playerId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        icon={<MdSportsCricket size={28} />}
        title="First innings coming soon"
        description="Batting stats land as soon as the first scorecard publishes for this season."
      />
    );
  }
  // Shared comparator, so rank #1 here is the same player everywhere a
  // "top run scorer" is named.
  const sorted = [...rows].sort(compareBattingRows);

  if (viewMode === 'table') {
    return (
      <LeaderboardTable
        rows={sorted}
        defaultSortKey="runs"
        getPlayer={(r) => ({
          id: r.player_id,
          name: r.player_name,
          photoUrl: r.player_id ? photoUrlByPlayer.get(r.player_id) : null,
        })}
        columns={battingColumns(matchesPlayedByPlayer)}
        onPlayerTap={onPlayerTap}
      />
    );
  }

  return (
    <LeaderboardList
      unit={['run', 'runs']}
      onPlayerTap={onPlayerTap}
      entries={sorted.map((r) => ({
        id: r.player_id,
        name: r.player_name,
        photoUrl: r.player_id ? photoUrlByPlayer.get(r.player_id) : null,
        value: r.runs,
        display: String(r.runs),
        detail: detail(
          `${r.innings} inns`,
          r.batting_average == null ? null : `Avg ${fmt1(r.batting_average)}`,
          r.strike_rate == null ? null : `SR ${fmt1(r.strike_rate)}`,
        ),
      }))}
    />
  );
}

function BowlingTabBody({
  rows, viewMode, photoUrlByPlayer, matchesPlayedByPlayer, bestBowlingByPlayer, onPlayerTap,
}: {
  rows: BowlingSeasonRow[];
  viewMode: ViewMode;
  photoUrlByPlayer: Map<string, string | null>;
  matchesPlayedByPlayer: Map<string, number>;
  bestBowlingByPlayer: Map<string, { wickets: number; runs: number; display: string }>;
  onPlayerTap: (playerId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        icon={<GiTennisBall size={28} />}
        title="No spells bowled yet"
        description="Wickets, economy and best figures show up after the first scorecard."
      />
    );
  }
  // Wickets DESC, then fewer runs conceded, then economy, then alphabetical.
  const sorted = [...rows].sort(compareBowlingRows);

  if (viewMode === 'table') {
    return (
      <LeaderboardTable
        rows={sorted}
        defaultSortKey="wkts"
        getPlayer={(r) => ({
          id: r.player_id,
          name: r.player_name,
          photoUrl: r.player_id ? photoUrlByPlayer.get(r.player_id) : null,
        })}
        columns={bowlingColumns(matchesPlayedByPlayer, bestBowlingByPlayer)}
        onPlayerTap={onPlayerTap}
      />
    );
  }

  return (
    <LeaderboardList
      unit={['wicket', 'wickets']}
      onPlayerTap={onPlayerTap}
      entries={sorted.map((r) => {
        const best = r.player_id ? bestBowlingByPlayer.get(r.player_id) : undefined;
        return {
          id: r.player_id,
          name: r.player_name,
          photoUrl: r.player_id ? photoUrlByPlayer.get(r.player_id) : null,
          value: r.wickets,
          display: String(r.wickets),
          // Least important last, so a narrow screen truncates the overs.
          detail: detail(
            r.economy == null ? null : `Econ ${fmt2(r.economy)}`,
            best ? `Best ${best.display}` : null,
            `${Math.floor(r.balls / 6)}.${r.balls % 6} ov`,
          ),
        };
      })}
    />
  );
}

function AllRoundTabBody({
  rows, viewMode, photoUrlByPlayer, matchesPlayedByPlayer, onPlayerTap,
}: {
  rows: AllRoundRow[];
  viewMode: ViewMode;
  photoUrlByPlayer: Map<string, string | null>;
  matchesPlayedByPlayer: Map<string, number>;
  onPlayerTap: (playerId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        icon={<Star size={28} strokeWidth={2} />}
        title="No all-rounders yet"
        description="Players need runs, wickets or catches in at least two disciplines to appear here."
      />
    );
  }
  if (viewMode === 'table') {
    return (
      <LeaderboardTable
        rows={rows}
        defaultSortKey="score"
        getPlayer={(r) => ({
          id: r.player_id,
          name: r.player_name,
          photoUrl: photoUrlByPlayer.get(r.player_id),
        })}
        columns={allRoundColumns(matchesPlayedByPlayer)}
        onPlayerTap={onPlayerTap}
      />
    );
  }

  return (
    <LeaderboardList
      unit={['point', 'points']}
      onPlayerTap={onPlayerTap}
      entries={rows.map((r) => ({
        id: r.player_id,
        name: r.player_name,
        photoUrl: photoUrlByPlayer.get(r.player_id),
        value: r.score,
        display: r.score.toFixed(1),
        detail: detail(count(r.runs, 'run'), count(r.wickets, 'wkt'), count(r.catches, 'catch', 'catches')),
      }))}
    />
  );
}

function CatchesTabBody({
  rows, viewMode, photoUrlByPlayer, matchesPlayedByPlayer, catchesByPlayer, onPlayerTap,
}: {
  rows: CatchesRow[];
  viewMode: ViewMode;
  photoUrlByPlayer: Map<string, string | null>;
  matchesPlayedByPlayer: Map<string, number>;
  catchesByPlayer: Map<string, Map<string, number>>;
  onPlayerTap: (playerId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        icon={<Hand size={28} strokeWidth={2} />}
        title="No catches yet"
        description="Catches and run-outs are read from the scorecards' dismissals, so they appear after the first match."
      />
    );
  }
  const sorted = [...rows].sort(compareCatchesRows);

  if (viewMode === 'table') {
    return (
      <LeaderboardTable
        rows={sorted}
        defaultSortKey="ct"
        getPlayer={(r) => ({
          id: r.player_id,
          name: r.player_name,
          photoUrl: photoUrlByPlayer.get(r.player_id),
        })}
        columns={catchesColumns(matchesPlayedByPlayer, catchesByPlayer)}
        onPlayerTap={onPlayerTap}
      />
    );
  }

  return (
    <LeaderboardList
      unit={['catch', 'catches']}
      onPlayerTap={onPlayerTap}
      entries={sorted.map((r) => {
        const perMatch = catchesByPlayer.get(r.player_id);
        const best = perMatch && perMatch.size > 0 ? Math.max(...perMatch.values()) : 0;
        const played = matchesPlayedByPlayer.get(r.player_id);
        return {
          id: r.player_id,
          name: r.player_name,
          photoUrl: photoUrlByPlayer.get(r.player_id),
          value: r.catches,
          display: String(r.catches),
          detail: detail(
            played ? count(played, 'match', 'matches') : null,
            r.runouts > 0 ? count(r.runouts, 'run-out') : null,
            best > 1 ? `Best ${best}` : null,
          ),
        };
      })}
    />
  );
}
