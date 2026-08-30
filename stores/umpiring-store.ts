import { create } from 'zustand';
import type {
  CricketPlayer,
  CricketUmpiringDuty,
  CricketUmpiringSettings,
  DutyCancelReason,
  DutyClaimResult,
} from '@/types/cricket';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { toast } from 'sonner';

/** Fallback when a season has no cricket_umpiring_settings row. */
export const DEFAULT_DUTY_TARGET = 1;

function getCurrentTeamId(): string | null {
  return useAuthStore.getState().currentTeamId;
}

function requireTeamId(): string | null {
  const teamId = getCurrentTeamId();
  if (!teamId) {
    console.warn('[umpiring] team_id is null — data may be orphaned.');
    toast.error('Team not loaded yet. Please refresh and try again.');
  }
  return teamId;
}

/**
 * "Today" in Pacific time, as YYYY-MM-DD.
 *
 * The claim/release RPCs compare `match_date` against
 * `(now() AT TIME ZONE 'America/Los_Angeles')::date`. If the UI decided
 * upcoming-vs-past from the device clock instead, a user in a different
 * timezone would see a Claim button the server rejects as `past` — with no
 * explanation. Both sides must agree, so both use Pacific.
 *
 * 'en-CA' because it formats as YYYY-MM-DD. Same approach as ingest-html.mts.
 */
export function todayPT(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** A duty that is neither handed to another team nor cancelled. */
export function isLiveDuty(d: CricketUmpiringDuty): boolean {
  return d.deleted_at === null && d.status !== 'cancelled';
}

/* ── Fairness maths ────────────────────────────────────────────────────
 * Pure so it can be tested directly. It encodes four rules that are easy to
 * get wrong, each of which silently inflates the "done" count:
 *
 *  1. Only `status === 'completed'` counts. A no-show must NOT.
 *  2. Do NOT key off `completed_at`. The schema stamps it for BOTH
 *     'completed' and 'no_show', so filtering on it credits no-shows.
 *  3. Cancelled duties may RETAIN an assignee, so any grouping by
 *     assigned_player_id without a status filter counts them as done.
 *  4. Soft-deleted (handed-away) duties never count.
 */

export type DutyPlayerState = 'done' | 'booked' | 'open';

export type DutyPlayerStat = {
  player_id: string;
  name: string;
  completed: number;
  /** Live claims not yet closed out. */
  booked: number;
  state: DutyPlayerState;
};

export type DutyStats = {
  target: number;
  /** Active, non-guest players — the denominator for "everyone stands once". */
  eligible: number;
  done: number;
  booked: number;
  open: number;
  perPlayer: DutyPlayerStat[];
  /** Guests are excluded from the target but shown if they took part. */
  guests: DutyPlayerStat[];
  /** Duty slots still needing a volunteer. */
  openSlots: number;
};

/**
 * Tally ONE player's duties.
 *
 * Exported and used by `computeDutyStats` below, so a single-player view cannot
 * drift from the roster maths. The per-player sheet needs this on its own: it
 * can be opened for somebody `computeDutyStats` deliberately omits — a
 * DEACTIVATED player who umpired earlier in the season still appears by name on
 * the duty cards, and looking them up in `perPlayer`/`guests` finds nothing.
 */
export function dutyStatFor(
  player: Pick<CricketPlayer, 'id' | 'name'>,
  duties: CricketUmpiringDuty[],
  target: number = DEFAULT_DUTY_TARGET,
): DutyPlayerStat {
  const mine = duties.filter(isLiveDuty).filter((d) => d.assigned_player_id === player.id);
  const completed = mine.filter((d) => d.status === 'completed').length;
  // 'no_show' counts as neither: assigned, but not done.
  const booked = mine.filter((d) => d.status === 'claimed').length;
  // A target of 0 means nobody is required to stand, so everyone is done.
  const state: DutyPlayerState =
    completed >= target ? 'done' : booked > 0 ? 'booked' : 'open';
  return { player_id: player.id, name: player.name, completed, booked, state };
}

export function computeDutyStats(
  duties: CricketUmpiringDuty[],
  players: CricketPlayer[],
  target: number = DEFAULT_DUTY_TARGET,
): DutyStats {
  const live = duties.filter(isLiveDuty);
  const statFor = (p: CricketPlayer): DutyPlayerStat => dutyStatFor(p, duties, target);

  const eligiblePlayers = players.filter((p) => p.is_active && !p.is_guest);
  const perPlayer = eligiblePlayers.map(statFor);

  const guests = players
    .filter((p) => p.is_active && p.is_guest)
    .map(statFor)
    .filter((s) => s.completed > 0 || s.booked > 0);

  return {
    target,
    eligible: eligiblePlayers.length,
    done: perPlayer.filter((s) => s.state === 'done').length,
    booked: perPlayer.filter((s) => s.state === 'booked').length,
    open: perPlayer.filter((s) => s.state === 'open').length,
    perPlayer,
    guests,
    openSlots: live.filter((d) => d.status === 'open').length,
  };
}

/* ── Claim/release feedback ────────────────────────────────────────────
 * The RPCs return a reason code so the UI can explain WHY. None of these is a
 * malfunction, so only the genuinely unexpected ones are error toasts —
 * losing a race is normal and must not read like a bug.
 */
export const DUTY_CLAIM_MESSAGES: Record<DutyClaimResult, string> = {
  ok: "You're umpiring",
  not_open: 'Someone just took this slot.',
  past: 'That match has already been played.',
  duplicate_slot: "You're already the other umpire for this match.",
  not_yours: "That slot isn't yours to give up.",
  not_found: 'This duty was removed.',
  not_member: "You're no longer on this team.",
  no_player: "Your account isn't linked to a player yet.",
  locked: 'Someone else is claiming this right now — try again.',
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface UmpiringState {
  /** ALL rows for the season, INCLUDING soft-deleted — the Deleted tab needs
   *  them. Selectors filter via isLiveDuty(). Row counts are tens per season,
   *  so loading the lot is cheaper than a second query. */
  duties: CricketUmpiringDuty[];
  settings: CricketUmpiringSettings | null;
  loading: boolean;
  loadedSeasonIds: Set<string>;
  /** Duty id currently being claimed/released, for per-button spinners. */
  pendingId: string | null;

  loadDuties: (seasonId: string) => Promise<void>;
  reset: () => void;

  claimDuty: (dutyId: string) => Promise<DutyClaimResult>;
  releaseDuty: (dutyId: string) => Promise<DutyClaimResult>;

  assignDuty: (dutyId: string, playerId: string, adminName: string) => Promise<void>;
  clearAssignment: (dutyId: string) => Promise<void>;
  markCompleted: (dutyId: string, adminName: string) => Promise<void>;
  /** Every claimed slot on one match, in a single write. Returns false on
   *  failure so the caller never reports success for a rejected update. */
  markMatchCompleted: (dutyIds: string[], adminName: string) => Promise<boolean>;
  markNoShow: (dutyId: string, adminName: string) => Promise<void>;
  reopenDuty: (dutyId: string) => Promise<void>;
  cancelDuty: (dutyId: string, reason: DutyCancelReason) => Promise<void>;
  swapAwayDuty: (dutyId: string, swapTeam: string, adminName: string) => Promise<void>;
  undoSwap: (dutyId: string) => Promise<void>;
  addSlotToMatch: (sourceDutyId: string, swapTeam: string) => Promise<void>;

  addManualDuty: (
    seasonId: string,
    data: {
      match_date: string;
      match_time: string | null;
      venue: string | null;
      team_a: string;
      team_b: string;
      role_slot: number;
      swap_team: string | null;
      notes: string | null;
      match_type: 'league' | 'semi_final' | 'final' | null;
    },
  ) => Promise<void>;
  /** Edit the match details (date, time, venue, teams). Not status/assignment. */
  updateDuty: (
    dutyId: string,
    data: {
      match_date: string;
      match_time: string | null;
      venue: string | null;
      team_a: string;
      team_b: string;
      match_type: 'league' | 'semi_final' | 'final' | null;
      swap_team: string | null;
      notes: string | null;
    },
  ) => Promise<void>;
  deleteDuty: (dutyId: string, deletedBy: string) => Promise<void>;
  restoreDuty: (dutyId: string) => Promise<void>;
  setDutyTarget: (seasonId: string, target: number) => Promise<void>;
}

export const useUmpiringStore = create<UmpiringState>((set, get) => ({
  duties: [],
  settings: null,
  loading: false,
  loadedSeasonIds: new Set<string>(),
  pendingId: null,

  reset: () =>
    set({
      duties: [],
      settings: null,
      loading: false,
      loadedSeasonIds: new Set<string>(),
      pendingId: null,
    }),

  loadDuties: async (seasonId: string) => {
    if (!isCloudMode()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = getCurrentTeamId();
    if (!teamId) return;

    // Skeleton only on first load for this season; revisits refetch silently
    // while TopProgressBar still signals work in flight.
    if (!get().loadedSeasonIds.has(seasonId)) set({ loading: true });

    const ui = useUIStore.getState();
    ui.beginLoad();
    try {
      const [dutiesRes, settingsRes] = await Promise.all([
        supabase
          .from('cricket_umpiring_duties')
          .select('*')
          .eq('team_id', teamId)
          .eq('season_id', seasonId)
          .order('match_date', { ascending: true }),
        supabase
          .from('cricket_umpiring_settings')
          .select('*')
          .eq('season_id', seasonId)
          .maybeSingle(),
      ]);

      if (dutiesRes.error) {
        console.error('[umpiring] loadDuties failed:', dutiesRes.error);
        toast.error('Could not load umpiring duties');
        set({ loading: false });
        return;
      }

      const nextLoaded = new Set(get().loadedSeasonIds);
      nextLoaded.add(seasonId);

      set({
        duties: (dutiesRes.data ?? []) as CricketUmpiringDuty[],
        settings: (settingsRes.data ?? null) as CricketUmpiringSettings | null,
        loading: false,
        loadedSeasonIds: nextLoaded,
      });
    } finally {
      ui.endLoad();
    }
  },

  claimDuty: async (dutyId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return 'not_found';

    set({ pendingId: dutyId });
    try {
      // One silent retry on 'locked'. That code means another claim was
      // mid-flight on the same row — the only failure the user causes nothing
      // to deserve — so retrying once usually resolves it into a clear
      // 'ok' or 'not_open' instead of an unexplained error.
      let result = await callClaim(supabase, 'claim_umpiring_duty', dutyId);
      if (result === 'locked') {
        await sleep(400);
        result = await callClaim(supabase, 'claim_umpiring_duty', dutyId);
      }

      const seasonId = get().duties.find((d) => d.id === dutyId)?.season_id;
      if (result === 'ok') {
        toast.success(DUTY_CLAIM_MESSAGES.ok);
      } else {
        toast(DUTY_CLAIM_MESSAGES[result]);
      }
      // Always refetch, success or not: on failure the user's view was stale
      // (someone else took it, or it moved), and leaving the old card up
      // invites a second confusing tap.
      if (seasonId) await get().loadDuties(seasonId);
      return result;
    } finally {
      set({ pendingId: null });
    }
  },

  releaseDuty: async (dutyId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return 'not_found';

    set({ pendingId: dutyId });
    try {
      let result = await callClaim(supabase, 'release_umpiring_duty', dutyId);
      if (result === 'locked') {
        await sleep(400);
        result = await callClaim(supabase, 'release_umpiring_duty', dutyId);
      }

      const seasonId = get().duties.find((d) => d.id === dutyId)?.season_id;
      if (result === 'ok') toast.success('Duty given up');
      else toast(DUTY_CLAIM_MESSAGES[result]);
      if (seasonId) await get().loadDuties(seasonId);
      return result;
    } finally {
      set({ pendingId: null });
    }
  },

  /**
   * Admin assigns or CORRECTS who holds a duty.
   *
   * Crucially it preserves a terminal status: correcting the name on a duty
   * already marked completed must not silently reopen it, or fixing a typo
   * would erase the fact that the duty was stood and quietly change the
   * fairness numbers.
   */
  assignDuty: async (dutyId, playerId, adminName) => {
    const current = get().duties.find((d) => d.id === dutyId);
    /**
     * Every status that must SURVIVE an assignment.
     *
     * `cancelled` belongs here and was missing, which made assigning an umpire
     * to a handed-over duty fail outright: the patch set status='claimed' while
     * `cancelled_reason` stayed populated, and
     * `chk_umpiring_cancelled_reason` requires
     * `(status = 'cancelled') = (cancelled_reason IS NOT NULL)`.
     * PostgREST surfaced it as an empty error object, so the toast just said
     * "Could not update the duty" with nothing in the console to explain it.
     *
     * Un-cancelling is a separate, deliberate act — `undoSwap` — because it
     * means "we ARE going after all", which is a decision, not a side effect of
     * naming somebody.
     */
    const isTerminal = current?.status === 'completed'
      || current?.status === 'no_show'
      || current?.status === 'cancelled';

    await patchDuty(get, dutyId, {
      assigned_player_id: playerId,
      assigned_by: adminName,
      assigned_at: current?.assigned_at ?? new Date().toISOString(),
      // Only promote an OPEN slot to 'claimed'. Leaving a terminal status alone
      // also leaves completed_at / cancelled_reason intact, both of which the
      // schema ties to the status.
      ...(isTerminal ? {} : { status: 'claimed', completed_at: null, completed_by: null }),
    }, isTerminal ? 'Umpire updated' : 'Duty assigned');
  },

  clearAssignment: async (dutyId) => {
    await patchDuty(get, dutyId, {
      assigned_player_id: null,
      assigned_player_name: null,
      assigned_by: null,
      assigned_at: null,
      status: 'open',
      completed_at: null,
      completed_by: null,
    }, 'Slot reopened');
  },

  // status and completed_at MUST move in the same update — the schema's
  // chk_umpiring_completed_at ties them together, so two sequential PATCHes
  // would fail on the first.
  markCompleted: async (dutyId, adminName) => {
    await patchDuty(get, dutyId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: adminName,
    }, 'Marked as done');
  },

  /**
   * Mark every claimed slot on ONE match as done, in a single write.
   *
   * Completion is a fact about the match, not about each umpire: if it was
   * played and our people stood, they all stood. Marking them individually is
   * busywork that also invites marking one and forgetting the other, which
   * silently under-counts somebody's duty on the fairness board.
   *
   * One UPDATE rather than a loop of `markCompleted`, for three reasons: a loop
   * fires one success toast PER duty, reloads the season once per duty, and can
   * half-succeed with no single place to report it.
   *
   * Only `claimed` rows are touched — filtered by the caller AND re-asserted in
   * the query, so a duty completed or cancelled on another device between
   * render and tap cannot be dragged back into 'completed'.
   */
  markMatchCompleted: async (dutyIds, adminName) => {
    if (dutyIds.length === 0) return false;
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const teamId = requireTeamId();
    if (!teamId) return false;

    const seasonId = get().duties.find((d) => d.id === dutyIds[0])?.season_id;

    // status and completed_at MUST move together — chk_umpiring_completed_at
    // ties them, so splitting them into two PATCHes fails on the first.
    const { error } = await supabase
      .from('cricket_umpiring_duties')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: adminName,
      })
      .in('id', dutyIds)
      .eq('team_id', teamId)
      .eq('status', 'claimed');

    if (error) {
      console.error('[umpiring] match completion failed:', error);
      toast.error('Could not mark the match done');
      return false;
    }
    toast.success(dutyIds.length > 1 ? `${dutyIds.length} duties marked done` : 'Marked as done');
    if (seasonId) await get().loadDuties(seasonId);
    return true;
  },

  markNoShow: async (dutyId, adminName) => {
    await patchDuty(get, dutyId, {
      status: 'no_show',
      completed_at: new Date().toISOString(),
      completed_by: adminName,
    }, 'Marked as no-show');
  },

  /** Undo a mistaken completed / no_show, back to a live claim. */
  reopenDuty: async (dutyId) => {
    await patchDuty(get, dutyId, {
      status: 'claimed',
      completed_at: null,
      completed_by: null,
    }, 'Reverted to claimed');
  },

  cancelDuty: async (dutyId, reason) => {
    await patchDuty(get, dutyId, {
      status: 'cancelled',
      cancelled_reason: reason,
    }, 'Duty cancelled');
  },

  /**
   * Hand a duty to another team after an offline swap.
   *
   * Uses `cancelled` rather than `deleted_at` on purpose. Both stop the sync
   * re-adding the slot, but a cancelled duty stays VISIBLE in the list — which
   * matters because MTCA's own site still lists us for that match. A player who
   * checks there and finds nothing in the app concludes the app is stale, so the
   * duty has to remain and say what happened.
   */
  swapAwayDuty: async (dutyId, swapTeam, adminName) => {
    await patchDuty(get, dutyId, {
      status: 'cancelled',
      cancelled_reason: 'admin',
      swap_team: swapTeam || null,
      completed_by: adminName,
      // Clear the booking: whoever had claimed it is no longer going.
      assigned_player_id: null,
      assigned_player_name: null,
      assigned_by: null,
      assigned_at: null,
    }, swapTeam ? `Handed to ${swapTeam}` : 'Duty handed over');
  },

  /**
   * Reverse a swap: the duty is ours again.
   *
   * MUST clear cancelled_reason in the same update. The schema's
   * chk_umpiring_cancelled_reason requires the reason to be non-null exactly
   * when status is 'cancelled', so setting status='open' while leaving the
   * reason behind fails the constraint.
   */
  undoSwap: async (dutyId) => {
    await patchDuty(get, dutyId, {
      status: 'open',
      cancelled_reason: null,
      swap_team: null,
      completed_at: null,
      completed_by: null,
      assigned_player_id: null,
      assigned_player_name: null,
      assigned_by: null,
      assigned_at: null,
    }, 'Duty is ours again');
  },

  /**
   * Add another umpire slot to a match we already cover — the other half of a
   * swap, where two people go to one ground instead of one each to two.
   *
   * Clones the match facts from an existing duty on that match so the admin
   * doesn't retype date/time/venue/teams, and takes the next free role_slot.
   */
  addSlotToMatch: async (sourceDutyId, swapTeam) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = requireTeamId();
    if (!teamId) return;

    const src = get().duties.find((d) => d.id === sourceDutyId);
    if (!src) { toast.error('Could not find that match'); return; }

    // Slots already used on this match, live or cancelled — a cancelled slot
    // still occupies its number under the unique index.
    const used = new Set(
      get().duties
        .filter((d) => d.deleted_at === null)
        .filter((d) => src.cricclubs_fixture_id !== null
          ? d.cricclubs_fixture_id === src.cricclubs_fixture_id
          : d.match_date === src.match_date && d.team_a === src.team_a && d.team_b === src.team_b)
        .map((d) => d.role_slot),
    );
    let slot = 1;
    while (used.has(slot) && slot < 4) slot += 1;
    if (used.has(slot)) { toast.error('This match already has the maximum umpires'); return; }

    const { error } = await supabase.from('cricket_umpiring_duties').insert({
      team_id: teamId,
      season_id: src.season_id,
      cricclubs_fixture_id: src.cricclubs_fixture_id,
      role_slot: slot,
      match_date: src.match_date,
      match_time: src.match_time,
      venue: src.venue,
      team_a: src.team_a,
      team_b: src.team_b,
      match_type: src.match_type,
      // Taken over from another club, so it is a swap-in rather than an
      // MTCA-published duty — which also keeps the sync from touching it.
      source: 'swap_in',
      swap_team: swapTeam || null,
      status: 'open',
    });

    if (error) {
      console.error('[umpiring] addSlotToMatch failed:', error);
      toast.error('Could not add the extra umpire slot');
      return;
    }
    toast.success('Extra umpire slot added');
    await get().loadDuties(src.season_id);
  },

  addManualDuty: async (seasonId, data) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = requireTeamId();
    if (!teamId) return;

    const { error } = await supabase.from('cricket_umpiring_duties').insert({
      team_id: teamId,          // the DB trigger re-derives this from the season
      season_id: seasonId,
      cricclubs_fixture_id: null,
      role_slot: data.role_slot,
      match_date: data.match_date,
      match_time: data.match_time,
      venue: data.venue,
      team_a: data.team_a,
      team_b: data.team_b,
      match_type: data.match_type,
      // swap_team present ⇒ we took this on from another club, which the UI
      // badges differently from an admin-invented duty.
      source: data.swap_team ? 'swap_in' : 'manual',
      swap_team: data.swap_team,
      notes: data.notes,
      status: 'open',
    });

    if (error) {
      console.error('[umpiring] addManualDuty failed:', error);
      toast.error('Could not add duty');
      return;
    }
    toast.success('Duty added');
    await get().loadDuties(seasonId);
  },

  /**
   * Admin edits the match details of a duty — time changed, wrong ground, etc.
   *
   * Deliberately limited to MTCA-fact columns. Status and assignment are not
   * editable here: those have dedicated actions (assign / mark done / swap)
   * with their own rules, and letting a details form write them would allow an
   * edit to silently un-complete a duty.
   *
   * CAVEAT worth knowing: on a duty with source='mtca', the weekly sync patches
   * these same fields from the fixture page, so an edit that disagrees with
   * MTCA will be reverted on the next run. The form says so. Edits to
   * swap_in/manual duties are permanent, because the sync never sees them.
   */
  updateDuty: async (dutyId, data) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = requireTeamId();
    if (!teamId) return;

    const src = get().duties.find((d) => d.id === dutyId);
    if (!src) { toast.error('Could not find that duty'); return; }

    // EVERY slot on this match, not just the one whose menu was used.
    //
    // Each duty row carries its own copy of the match facts, so a match with
    // two umpires stores the time twice. Patching one row would leave the
    // sibling slot showing the old date/time/venue — one match with two
    // contradictory times, and nothing to flag it.
    const siblingIds = get().duties
      .filter((d) => d.deleted_at === null)
      .filter((d) => (
        src.cricclubs_fixture_id !== null
          ? d.season_id === src.season_id && d.cricclubs_fixture_id === src.cricclubs_fixture_id
          : d.match_date === src.match_date
            && d.team_a === src.team_a
            && d.team_b === src.team_b
      ))
      .map((d) => d.id);

    const { error } = await supabase
      .from('cricket_umpiring_duties')
      .update({
        match_date: data.match_date,
        match_time: data.match_time,
        venue: data.venue,
        team_a: data.team_a,
        team_b: data.team_b,
        match_type: data.match_type,
        swap_team: data.swap_team,
        notes: data.notes,
      })
      .in('id', siblingIds)
      .eq('team_id', teamId);

    if (error) {
      console.error('[umpiring] updateDuty failed:', error);
      toast.error('Could not update the match');
      return;
    }
    toast.success(
      siblingIds.length > 1 ? `Match updated (${siblingIds.length} slots)` : 'Match updated',
    );
    await get().loadDuties(src.season_id);
  },

  deleteDuty: async (dutyId, deletedBy) => {
    await patchDuty(get, dutyId, {
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
    }, 'Duty removed');
  },

  restoreDuty: async (dutyId) => {
    await patchDuty(get, dutyId, {
      deleted_at: null,
      deleted_by: null,
    }, 'Duty restored');
  },

  setDutyTarget: async (seasonId, target) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const teamId = requireTeamId();
    if (!teamId) return;

    const { error } = await supabase
      .from('cricket_umpiring_settings')
      .upsert(
        { season_id: seasonId, team_id: teamId, duty_target: target },
        { onConflict: 'season_id' },
      );

    if (error) {
      console.error('[umpiring] setDutyTarget failed:', error);
      toast.error('Could not save the target');
      return;
    }
    toast.success(`Target set to ${target} per player`);
    await get().loadDuties(seasonId);
  },
}));

/* ── Internals ────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callClaim(supabase: any, fn: string, dutyId: string): Promise<DutyClaimResult> {
  const { data, error } = await supabase.rpc(fn, { p_duty_id: dutyId });
  if (error) {
    // A transport/RLS failure is NOT a reason code and must never be treated
    // as success.
    console.error(`[umpiring] ${fn} failed:`, error);
    return 'not_found';
  }
  const known: DutyClaimResult[] = [
    'ok', 'not_found', 'not_member', 'no_player',
    'not_open', 'past', 'duplicate_slot', 'not_yours', 'locked',
  ];
  // Guard against a future schema returning a code this build doesn't know:
  // fail closed rather than silently reporting success.
  return known.includes(data) ? (data as DutyClaimResult) : 'not_found';
}

async function patchDuty(
  get: () => UmpiringState,
  dutyId: string,
  patch: Record<string, unknown>,
  successMessage: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const teamId = requireTeamId();
  if (!teamId) return;

  const seasonId = get().duties.find((d) => d.id === dutyId)?.season_id;

  const { error } = await supabase
    .from('cricket_umpiring_duties')
    .update(patch)
    .eq('id', dutyId)
    .eq('team_id', teamId);

  if (error) {
    console.error('[umpiring] update failed:', error);
    toast.error('Could not update the duty');
    return;
  }
  toast.success(successMessage);
  if (seasonId) await get().loadDuties(seasonId);
}
