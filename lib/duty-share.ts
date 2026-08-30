import type { CricketUmpiringDuty } from '@/types/cricket';

/**
 * Build a WhatsApp-pasteable summary of upcoming umpiring duties.
 *
 * Pure and exported so the format can be unit-tested without a browser — the
 * whole point of this text is that it gets pasted into a group chat, so a
 * regression in spacing or a missing "needs an umpire" line is a real bug.
 *
 * WhatsApp formatting rules this relies on:
 *   *bold*  _italic_
 * It does NOT use tables, code blocks or wide lines — phone screens wrap at
 * roughly 35 characters, so every line is kept short and indentation is done
 * with spaces rather than columns.
 *
 * ── HOUSE VOICE: NO EMOJI, PLAIN SENTENCES ──
 * These messages are pasted into the team group under a real person's name, so
 * they have to read like that person typed them. Every template used to open
 * with an emoji and decorate each line with another (🏏 ✅ 🙏 📍 🧢 👉 🙌);
 * together with title-case headings and an em-dash in every other sentence,
 * that is the exact texture people now recognise as machine-written, and it
 * quietly undercuts a message whose whole job is to sound like a teammate
 * asking a favour.
 *
 * The rules, when adding or editing a template here:
 *   • No emoji. Where one carried meaning ("🧢 Madhu"), use the word
 *     ("Umpire: Madhu") — that is clearer anyway, and it survives clients that
 *     render emoji differently.
 *   • Bold is for the heading and the one ask, not for emphasis mid-sentence.
 *   • Sentence case in headings. Title Case reads like a newsletter.
 *   • Prefer commas and full stops to em-dashes.
 *   • Contractions are fine. People use them.
 * Pinned by tests/unit/duty-share.test.ts, which asserts no template contains
 * an emoji.
 */

/** Every team on this league is prefixed "MTCA ", which is pure noise in chat. */
function shortTeam(name: string): string {
  return name.replace(/^MTCA\s+/i, '').trim();
}

function formatTime(t: string | null): string {
  if (!t) return 'TBD';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Second path for anyone who would rather not open the app at all.
 *
 * An admin can assign a duty on someone's behalf, so replying in the group is
 * a complete route to being signed up. Worth stating explicitly: the link
 * requires a login, which is a dead end for anyone who never registered, and a
 * message offering only that reads as "not for me".
 *
 * DELIBERATELY UNFORMATTED. Everything else in these messages uses *bold* or
 * _italic_, but this is the line that matters most to the people least likely
 * to act \u2014 so it must not depend on markup rendering correctly. When WhatsApp
 * declines to italicise, the underscores show up as literal characters and the
 * sentence reads as broken. Plain text cannot fail that way.
 *
 * Straight apostrophe, not U+2019, for the same reason: fewer ways to render
 * wrong across clients.
 */
// "I'll", not "we'll": one person pastes this and one person does the adding.
// A personal commitment reads as a real offer; "we" sounds like a process.
const REPLY_FALLBACK = "Or just reply here and I'll add you.";

/**
 * Deep link that opens WhatsApp with the message already written, so the admin
 * picks a chat instead of copy-pasting.
 *
 * `wa.me/?text=` with no phone number is the "share to any chat" form — it
 * opens the app on mobile and WhatsApp Web on desktop, and needs no API key or
 * business account. It is also the ONLY thing WhatsApp lets an outside app
 * pre-fill: there is no URL scheme for creating a poll, and the Business Cloud
 * API cannot send one either.
 *
 * Must be opened via a real <a target="_blank">, not window.open — iOS Safari
 * blocks programmatic window.open outside a direct user gesture.
 */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function formatDateHeading(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });
}

/**
 * Minimal shape of a per-player tally. Declared locally rather than imported
 * from the store so this module stays free of store/Supabase dependencies and
 * remains trivially unit-testable.
 */
export interface RosterSummaryRow {
  name: string;
  completed: number;
  booked: number;
}

export interface RosterSummaryOptions {
  teamName?: string;
  url?: string;
  target?: number;
  /** Duty slots still unclaimed, for the closing ask. */
  openSlots?: number;
}

/**
 * WhatsApp-pasteable summary of where the whole squad stands.
 *
 * Deliberately shows all three groups, not just who is outstanding. A message
 * listing only the people who haven't done it reads as a public telling-off; the
 * same message that opens by naming everyone who HAS turned up reads as a
 * progress update that happens to include an ask. Same information, and in a
 * volunteer group the framing decides whether anyone responds.
 */
export function buildRosterSummaryText(
  rows: RosterSummaryRow[],
  opts: RosterSummaryOptions = {},
): string | null {
  const {
    teamName = 'Sunrisers',
    url = 'viberstoolkit.com/cricket/umpiring',
    target = 1,
    openSlots = 0,
  } = opts;

  if (rows.length === 0) return null;

  const byName = (a: RosterSummaryRow, b: RosterSummaryRow) => a.name.localeCompare(b.name);
  const stood = rows.filter((r) => r.completed >= target && target > 0).sort(byName);
  const booked = rows.filter((r) => !stood.includes(r) && r.booked > 0).sort(byName);
  const yetTo = rows.filter((r) => !stood.includes(r) && !booked.includes(r)).sort(byName);

  const lines: string[] = [
    `*${teamName} umpiring update*`,
    `_${stood.length} of ${rows.length} have stood at least once_`,
  ];

  /**
   * Annotates a name with what the group heading alone cannot say:
   *  • "(×2)"        — carried more than their share, worth naming.
   *  • "(+1 coming)" — has ALSO signed up for an upcoming duty. Without this,
   *    somebody who already stood and then volunteered again disappears into
   *    the Stood list and gets no credit for the second one.
   */
  const list = (group: RosterSummaryRow[], showUpcoming: boolean) =>
    group.map((r) => {
      const bits: string[] = [];
      if (r.completed > 1) bits.push(`×${r.completed}`);
      if (showUpcoming && r.booked > 0) bits.push(`+${r.booked} coming`);
      return bits.length > 0 ? `${r.name} (${bits.join(', ')})` : r.name;
    }).join(', ');

  if (stood.length > 0) {
    // showUpcoming: these people are already counted as done, so a further
    // booking is extra and needs saying out loud.
    lines.push('', `*Stood (${stood.length})*`, list(stood, true));
  }
  if (booked.length > 0) {
    // "Upcoming" here, but "Signed up" in the app's roster legend. Not an
    // inconsistency: the app has a TAB called Upcoming, so reusing the word for
    // a group of people would make it mean two things on one screen. A chat
    // message has no such collision, and "Upcoming" reads better there.
    lines.push('', `*Upcoming (${booked.length})*`, list(booked, false));
  }
  if (yetTo.length > 0) {
    lines.push('', `*Yet to umpire (${yetTo.length})*`, list(yetTo, false));
  }

  lines.push('');
  if (openSlots > 0) {
    // Counts SPOTS, not duties and not matches.
    //  • "1 duty needs an umpire" is circular — a duty IS the umpiring job.
    //  • "1 match needs someone" is wrong — an open spot can sit on a match
    //    that already has one umpire, and two spots can be on one match.
    // "Spot" is also the word the team already uses for these.
    lines.push(
      `*${openSlots} umpiring ${openSlots === 1 ? 'spot is' : 'spots are'} still open. `
      + 'Please help if you can.*',
    );
    lines.push(`Add your name here: ${url}`);
    lines.push(REPLY_FALLBACK);
  } else if (yetTo.length > 0) {
    // Nothing to claim right now, so an ask would be pointless. Worded as
    // "every duty is covered" rather than "no duties open", because the latter
    // sits directly under "Yet to umpire (7)" and reads as a contradiction —
    // seven people still owe one, but there is nothing available to take.
    lines.push('*Everything is covered for now, thanks.*');
    lines.push('_More will come up as MTCA publishes fixtures._');
  } else {
    lines.push('*Everyone has stood at least once. Thanks all.*');
  }

  return lines.join('\n');
}

/**
 * "A", "A and B", "A, B and C" — never a bare comma-list.
 *
 * The final "and" matters more than it looks: these messages open by naming
 * real people in front of their team-mates, and "Madhu, Mani" reads like a
 * roster printout while "Madhu and Mani" reads like someone talking to them.
 */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/** First name only — "Madhu", not "Madhu Gundapaneni (Madz)". */
function firstName(full: string): string {
  return full.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/)[0] ?? full;
}

export interface AssignedReminderOptions {
  /** Today in Pacific, YYYY-MM-DD. Duties before this are excluded. */
  today: string;
  teamName?: string;
}

/**
 * Reminder for the people already assigned to upcoming duties, for the group.
 *
 * Distinct from `buildDutyShareText`, which asks for VOLUNTEERS to fill open
 * slots. This one is aimed at the people who have already said yes, so it
 * names them, states only what they need on the day, and asks for nothing.
 * Mixing the two would bury a reminder inside a recruitment post.
 *
 * Handles one person, two, or a whole weekend's worth across several matches —
 * the greeting names everyone once at the top, then each match lists who is on
 * it, so nobody has to scan for their own name twice.
 *
 * Returns null when nobody is assigned to anything upcoming, so the caller can
 * hide the button rather than posting an empty reminder.
 */
export function buildAssignedReminderText(
  duties: CricketUmpiringDuty[],
  opts: AssignedReminderOptions,
): string | null {
  const { today, teamName = 'Sunrisers' } = opts;

  const upcoming = duties
    .filter((d) => d.deleted_at === null)
    // Only people who have actually committed. An open slot belongs in the
    // volunteer ask, and a cancelled one is a match we are no longer covering.
    .filter((d) => d.status === 'claimed')
    .filter((d) => d.match_date >= today)
    .filter((d) => Boolean(d.assigned_player_name))
    .sort((a, b) =>
      a.match_date.localeCompare(b.match_date)
      || (a.match_time ?? '').localeCompare(b.match_time ?? ''));

  if (upcoming.length === 0) return null;

  // One block per MATCH — two umpires on one fixture is one commitment, and
  // printing the match twice reads as two separate duties.
  const matches = new Map<string, CricketUmpiringDuty[]>();
  for (const d of upcoming) {
    const key = d.cricclubs_fixture_id !== null
      ? `f:${d.cricclubs_fixture_id}`
      : `m:${d.match_date}|${[d.team_a, d.team_b].sort().join('|')}|${d.match_time ?? ''}`;
    const list = matches.get(key) ?? [];
    list.push(d);
    matches.set(key, list);
  }

  // Everyone named once, in the order their duty falls.
  const everyone: string[] = [];
  for (const d of upcoming) {
    const n = firstName(d.assigned_player_name!);
    if (!everyone.includes(n)) everyone.push(n);
  }

  const single = matches.size === 1;
  const lines: string[] = [
    single ? '*Umpiring reminder*' : '*Umpiring coming up*',
    '',
    `Hi ${joinNames(everyone)}`,
  ];

  for (const slots of matches.values()) {
    const head = slots[0]!;
    const who = joinNames(
      slots.map((d) => firstName(d.assigned_player_name!))
        .filter((n, i, all) => all.indexOf(n) === i),
    );
    lines.push('');
    lines.push(`*${formatDateHeading(head.match_date)}, ${formatTime(head.match_time)}*`);
    lines.push(`${shortTeam(head.team_a)} v ${shortTeam(head.team_b)}`);
    if (head.venue) lines.push(`At ${head.venue}`);
    // Repeated per match even when there is only one, so a weekend with two
    // fixtures never leaves anyone guessing which one is theirs. "Umpire:"
    // rather than a cap emoji — the label says what the name means, which the
    // picture only implied.
    lines.push(`Umpire: ${who}`);
  }

  lines.push(
    '',
    'Please try to get there a few minutes early. Thanks for standing.',
    '',
    teamName,
  );

  return lines.join('\n');
}

/**
 * A thank-you for a match that has just been stood, ready to paste in the group.
 *
 * Written for ONE or TWO names, because that is what a match produces — MTCA
 * gives each fixture two umpire slots and we are named on one or both. The
 * greeting reads "Hi Madhu" or "Hi Madhu and Mani", never a comma-list, since
 * anything longer is not a thing this can be called with.
 *
 * Public praise is the whole point. Umpiring is the least glamorous job in club
 * cricket — you give up a Saturday to stand at a match your own team is not
 * playing — and being named in the group is the only reward on offer. So the
 * names lead, and the match details follow as context rather than as the
 * subject.
 *
 * Returns null when nobody is named, so a caller can hide the button instead of
 * offering to send an empty thank-you.
 */
export function buildThanksText(
  names: string[],
  match: { date: string; teamA: string; teamB: string; venue?: string | null },
  opts: { teamName?: string } = {},
): string | null {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return null;

  const who = joinNames(clean);

  const lines = [
    `*Thanks ${who}*`,
    '',
    `${clean.length === 1 ? 'You' : 'You both'} stood as umpire for us at`,
    `${shortTeam(match.teamA)} v ${shortTeam(match.teamB)}, ${formatDateHeading(match.date)}`,
  ];
  if (match.venue) lines.push(`At ${match.venue}`);

  lines.push(
    '',
    // Framed as a RESPONSIBILITY the squad shares, not a favour this person did
    // us — the same reason buildDutyShareText says "cover" rather than "help".
    // "A big ask" quietly casts the umpire as a volunteer doing charity, which
    // makes everyone who hasn't stood yet a bystander rather than someone with
    // a turn coming.
    // Do NOT write anything implying the team is playing while they umpire: an
    // MTCA duty is at a match we are NOT in, and nobody standing alone at
    // someone else's ground will miss that.
    'Covering our umpiring duty is a responsibility we all share. Thanks for taking it on.',
    '',
    opts.teamName ?? 'Sunrisers',
  );

  return lines.join('\n');
}

export interface PlayerMessageOptions {
  /** Today in Pacific, YYYY-MM-DD. */
  today: string;
  url?: string;
  /** Unclaimed spots across the whole season, for the ask. */
  openSlots?: number;
  /**
   * Season this is about, e.g. "2026 MTCA Spring League · Division D".
   *
   * Goes on its OWN line rather than into the sentence. The real names run to
   * ~36 characters — roughly a full line on a phone — so "Thanks for standing
   * as umpire in 2026 MTCA Spring League · Division D" buries the thank-you.
   * When it is missing, the sentences fall back to the words "this season".
   */
  seasonName?: string;
}

/**
 * A message about ONE player, for an admin to send them directly.
 *
 * `duties` must already be narrowed to this player's duties — the caller has
 * them to hand, and taking them pre-filtered keeps this function free of any
 * notion of player identity (which is resolved by email in one place and by
 * `user_id` in another, and does not belong in a text formatter).
 *
 * What it says depends on where they stand, in this order of urgency:
 *   1. A duty coming up      → a reminder with the details. Time-critical.
 *   2. Never stood, spots open → an ask.
 *   3. Already stood          → a thank-you.
 *   4. Never stood, nothing open → null. There is no honest message here: we
 *      cannot ask them to take a spot that does not exist, and a "you still owe
 *      one" with no way to act on it is just a complaint.
 *
 * The ask deliberately leads with the rule that applies to EVERYONE rather than
 * with what this person hasn't done. Same facts; one reads as a rota, the other
 * as being singled out, and in a volunteer group that decides whether anyone
 * replies.
 */
export function buildPlayerMessageText(
  name: string,
  duties: CricketUmpiringDuty[],
  opts: PlayerMessageOptions,
): string | null {
  const {
    today, url = 'viberstoolkit.com/cricket/umpiring', openSlots = 0, seasonName,
  } = opts;

  const live = duties.filter((d) => d.deleted_at === null && d.status !== 'cancelled');
  const completed = live.filter((d) => d.status === 'completed').length;
  const upcoming = live
    .filter((d) => d.status === 'claimed' && d.match_date >= today)
    .sort((a, b) => a.match_date.localeCompare(b.match_date)
      || (a.match_time ?? '').localeCompare(b.match_time ?? ''));

  // Named season replaces the vague words rather than adding to them —
  // "at least once in this season, 2026 MTCA Spring League" says it twice.
  const thisSeason = seasonName ? '' : ' this season';
  const seasonLine = seasonName ? [`_${seasonName}_`] : [];

  const next = upcoming[0];
  if (next) {
    const lines = [
      `*Umpiring reminder, ${name}*`,
      ...seasonLine,
      '',
      `${formatDateHeading(next.match_date)}, ${formatTime(next.match_time)}`,
      `${shortTeam(next.team_a)} v ${shortTeam(next.team_b)}`,
    ];
    if (next.venue) lines.push(`At ${next.venue}`);
    lines.push('', "You're our umpire for this one. Thanks!");
    // Only worth saying when there IS a second one — otherwise it reads as if
    // we are hinting at more work.
    if (upcoming.length > 1) {
      lines.push(`_You also have ${upcoming.length - 1} more coming up._`);
    }
    return lines.join('\n');
  }

  if (completed === 0) {
    if (openSlots === 0) return null;
    return [
      `Hi ${name}`,
      ...seasonLine,
      '',
      `Every player stands as umpire at least once${thisSeason}, and ${openSlots} `
        + `${openSlots === 1 ? 'spot is' : 'spots are'} still open.`,
      '',
      'Could you take one?',
      `Pick a match here: ${url}`,
      REPLY_FALLBACK,
    ].join('\n');
  }

  return [
    `Hi ${name}`,
    ...seasonLine,
    '',
    completed === 1
      ? `Thanks for standing as umpire${thisSeason}, much appreciated.`
      : `Thanks for standing as umpire ${completed} times${thisSeason}, much appreciated.`,
  ].join('\n');
}

export interface DutyShareOptions {
  teamName?: string;
  /** Public URL players can open to claim. */
  url?: string;
  /** Today in Pacific, YYYY-MM-DD — duties before this are excluded. */
  today: string;
}

/**
 * Returns null when there is nothing worth pasting, so callers can disable the
 * button rather than copying an empty message.
 */
export function buildDutyShareText(
  duties: CricketUmpiringDuty[],
  opts: DutyShareOptions,
): string | null {
  const { teamName = 'Sunrisers', url = 'viberstoolkit.com/cricket/umpiring', today } = opts;

  const upcoming = duties
    .filter((d) => d.deleted_at === null)
    .filter((d) => d.status === 'open' || d.status === 'claimed')
    .filter((d) => d.match_date >= today)
    .sort(
      (a, b) =>
        a.match_date.localeCompare(b.match_date) ||
        (a.match_time ?? '').localeCompare(b.match_time ?? ''),
    );

  if (upcoming.length === 0) return null;

  const openCount = upcoming.filter((d) => d.status === 'open').length;
  let matchesNeedingUmpires = 0;

  const lines: string[] = [`*${teamName} umpiring duties*`];

  // Group by date so a weekend with several duties reads as one block.
  const byDate = new Map<string, CricketUmpiringDuty[]>();
  for (const d of upcoming) {
    const list = byDate.get(d.match_date) ?? [];
    list.push(d);
    byDate.set(d.match_date, list);
  }

  for (const [date, dayDuties] of byDate) {
    lines.push('', `_${formatDateHeading(date)}_`);

    // One block per MATCH, not per slot. When we owe two umpires on the same
    // fixture, printing the match twice reads as a duplicate.
    const matches = new Map<string, CricketUmpiringDuty[]>();
    for (const d of dayDuties) {
      const key = d.cricclubs_fixture_id !== null
        ? `f:${d.cricclubs_fixture_id}`
        : `m:${[d.team_a, d.team_b].sort().join('|')}|${d.match_time ?? ''}`;
      const list = matches.get(key) ?? [];
      list.push(d);
      matches.set(key, list);
    }

    for (const slots of matches.values()) {
      const head = slots[0]!;
      const taken = slots.filter((d) => d.status !== 'open');
      const open = slots.length - taken.length;

      lines.push('');
      lines.push(`${formatTime(head.match_time)}${head.venue ? `, ${head.venue}` : ''}`);
      lines.push(`   ${shortTeam(head.team_a)} v ${shortTeam(head.team_b)}`);

      // Thank-you goes INLINE with the name rather than as a separate summary
      // line. It credits the specific person, and it removes a closing line
      // that only restated a count already visible above.
      for (const d of taken) {
        const n = d.assigned_player_name;
        lines.push(n ? `   ${n} is standing, thanks` : '   Covered, thanks');
      }

      if (open > 0) {
        matchesNeedingUmpires += 1;
        // "cover" rather than "help": standard rota language, frames the duty
        // as a shared obligation rather than a favour, and avoids repeating
        // "help" from the closing ask. "N more" once somebody is already on it.
        if (taken.length === 0) {
          lines.push(open === 1
            ? '   *Need an umpire here, can anyone cover?*'
            : `   *Need ${open} umpires here, can anyone cover?*`);
        } else {
          lines.push(open === 1
            ? '   *1 more umpire needed*'
            : `   *${open} more umpires needed*`);
        }
      }
    }

    // A genuine clash is two DIFFERENT matches at the same time — usually at
    // different grounds, so one person cannot do both. Two slots on a single
    // match is not a clash; that is simply how umpiring works.
    const byTime = new Map<string, Set<string>>();
    for (const [key, slots] of matches) {
      const t = slots[0]!.match_time ?? 'TBD';
      const set = byTime.get(t) ?? new Set<string>();
      set.add(key);
      byTime.set(t, set);
    }
    for (const [time, keys] of byTime) {
      if (keys.size < 2) continue;
      lines.push('');
      lines.push(
        `Note: ${keys.size} matches at ${formatTime(time === 'TBD' ? null : time)}, `
        + `so we need ${keys.size} different people.`,
      );
    }
  }

  lines.push('');
  if (openCount === 0) {
    lines.push('*All duties covered. Thanks everyone.*');
  } else {
    // A grand total only earns a line when it is not already obvious. With a
    // single match needing umpires, its own "1 more umpire needed" line has
    // already said it — repeating it as "We still need 1 umpire" is noise.
    // Across several matches the total IS new information, so it stays.
    if (matchesNeedingUmpires > 1) {
      lines.push(
        `*Still need ${openCount} umpire${openCount === 1 ? '' : 's'}. Please help if you can.*`,
      );
    }
    // NOT "Sign up here" — everyone already has an account, so that reads as
    // "register", which is both wrong and a reason to hesitate. This names the
    // actual action: you put your name against a match.
    lines.push(`Add your name here: ${url}`);
    lines.push(REPLY_FALLBACK);
  }

  return lines.join('\n');
}
