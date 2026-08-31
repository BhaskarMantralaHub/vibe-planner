import { formatCurrency } from './utils';

/**
 * The season-fee reminder, ready to paste into the team's WhatsApp group.
 *
 * NAMES NOBODY, DELIBERATELY. An earlier draft listed who still owed; that is a
 * public naming-and-shaming board, and this screen is built to avoid being one.
 * The counts carry the message perfectly well on their own, and the people who
 * have already paid can tell it is not aimed at them.
 *
 * It is also ONE message to the group, not one per debtor. The button used to
 * read "message the 11 who haven't paid", which described eleven separate pokes.
 *
 * House voice — no emoji, sentence case, bold on the heading only. Same rules as
 * lib/duty-share.ts; see the block comment there.
 */
export interface FeeReminderInput {
  /** e.g. "2026 MTCA Spring League". Falls back to a generic heading. */
  seasonName?: string | null;
  /** Billable roster size — season guests excluded. */
  playerCount: number;
  /** How many have paid the fee IN FULL. */
  paidCount: number;
  /**
   * Total still owed across the squad, which correctly includes the remainder
   * from anyone who part-paid. That is why the money figure is passed in rather
   * than derived from the counts: (playerCount - paidCount) * fee would bill a
   * player who has already put in $40 of $60 for the whole $60.
   */
  outstanding: number;
}

export function buildFeeReminderText(input: FeeReminderInput): string | null {
  const { seasonName, playerCount, paidCount, outstanding } = input;

  // Nothing to chase. Returning null lets the caller hide the button rather
  // than offer to post "everyone has paid, please pay" to the group.
  if (playerCount === 0) return null;
  if (outstanding < 0.01) return null;

  const heading = seasonName
    ? `*Season fees — ${seasonName}*`
    : '*Season fees*';

  const lines: string[] = [heading, ''];

  if (paidCount === 0) {
    // "0 of 19 have paid" is technically right and reads like a rebuke.
    lines.push(`Season fees are open. ${formatCurrency(outstanding)} to collect.`);
  } else {
    lines.push(
      `${paidCount} of ${playerCount} have paid. `
      + `${formatCurrency(outstanding)} still to come in.`,
    );
  }

  lines.push(
    '',
    'If you have not sent yours yet, please do when you get a chance. '
    + 'Put your name in the note so it can be ticked off.',
  );

  // Only when there is somebody to thank — otherwise it thanks an empty set.
  if (paidCount > 0) {
    lines.push('', 'Thanks to everyone who has already paid.');
  }

  return lines.join('\n');
}
