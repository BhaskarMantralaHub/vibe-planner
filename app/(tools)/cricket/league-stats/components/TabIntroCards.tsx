'use client';

import type { JSX } from 'react';
import { ChevronRight } from 'lucide-react';

/*
 * Footnotes under the All-round and Fielding leaderboards. They answer "how is
 * this number made?" for the few who ask, so they read as small print rather
 * than as cards competing with the leaderboard above them.
 */

export function AllRoundFormulaCard(): JSX.Element {
  return (
    <p className="px-1 text-[13px] leading-relaxed text-[var(--muted)]">
      <span className="font-semibold text-[var(--text)]">How the score works.</span>{' '}
      Runs ÷ 25, plus wickets, plus catches ÷ 2. Only players who have scored in at
      least two of batting, bowling and fielding are ranked.
    </p>
  );
}

const FIELDING_RULES: Array<[string, string]> = [
  ['Catch', 'the fielder named after “c” gets it.'],
  ['Caught and bowled', 'the bowler gets it.'],
  ['Stumping', 'the keeper gets it, counted as a catch.'],
  ['Run out', 'every fielder named gets one each.'],
];

export function CatchesRulesCard(): JSX.Element {
  return (
    <details className="group px-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-[var(--text)] [&::-webkit-details-marker]:hidden">
        How fielding is credited
        <ChevronRight
          size={15}
          aria-hidden
          className="text-[var(--dim)] transition-transform duration-200 group-open:rotate-90"
        />
      </summary>
      <ul className="flex flex-col gap-1.5 pb-2 text-[13px] leading-relaxed text-[var(--muted)]">
        {FIELDING_RULES.map(([what, rule]) => (
          <li key={what}>
            <span className="font-medium text-[var(--text)]">{what}:</span> {rule}
          </li>
        ))}
        <li>Catches taken by the other team while we bat are not counted.</li>
      </ul>
    </details>
  );
}
