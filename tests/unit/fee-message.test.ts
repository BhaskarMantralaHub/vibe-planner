import { describe, it, expect } from 'vitest';
import { buildFeeReminderText } from '@/app/(tools)/cricket/lib/fee-message';

/**
 * The reminder is posted into the team group under the admin's name, so the two
 * things that matter most are what it does NOT contain: any player's name, and
 * any emoji.
 */
describe('buildFeeReminderText', () => {
  const BASE = {
    seasonName: '2026 MTCA Spring League',
    playerCount: 19,
    paidCount: 8,
    outstanding: 660,
  };

  it('names nobody', () => {
    const text = buildFeeReminderText(BASE)!;
    // A real roster's worth of first names — none may appear.
    for (const name of ['Akash', 'Venkat', 'Naresh', 'Mani', 'Madhu', 'Bhaskar', 'Adi', 'Ashok']) {
      expect(text).not.toContain(name);
    }
  });

  it('uses no emoji', () => {
    const text = buildFeeReminderText(BASE)!;
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('leads with the counts and the money still to come', () => {
    const text = buildFeeReminderText(BASE)!;
    expect(text.split('\n')[0]).toBe('*Season fees — 2026 MTCA Spring League*');
    expect(text).toContain('8 of 19 have paid. $660.00 still to come in.');
    expect(text).toContain('Thanks to everyone who has already paid.');
  });

  it('returns null when there is nothing to chase', () => {
    // Would otherwise post "everyone has paid, please pay" to the group.
    expect(buildFeeReminderText({ ...BASE, paidCount: 19, outstanding: 0 })).toBeNull();
    // Floating-point dust must not count as outstanding.
    expect(buildFeeReminderText({ ...BASE, outstanding: 0.004 })).toBeNull();
  });

  it('returns null with nobody on the roster', () => {
    expect(buildFeeReminderText({ ...BASE, playerCount: 0, paidCount: 0 })).toBeNull();
  });

  it('does not open with "0 of 19 have paid", which reads as a rebuke', () => {
    const text = buildFeeReminderText({ ...BASE, paidCount: 0, outstanding: 1140 })!;
    expect(text).not.toContain('0 of 19');
    expect(text).toContain('Season fees are open. $1,140.00 to collect.');
    // Nobody to thank yet, so the closing line must not appear.
    expect(text).not.toContain('Thanks to everyone');
  });

  it('falls back to a generic heading with no season name', () => {
    expect(buildFeeReminderText({ ...BASE, seasonName: null })!.split('\n')[0])
      .toBe('*Season fees*');
  });

  it('reports the passed outstanding figure, not one derived from the counts', () => {
    // 11 unpaid at $60 would be $660, but one of them has already put in $40.
    // Deriving the figure would re-bill that $40; the caller passes the truth.
    const text = buildFeeReminderText({ ...BASE, outstanding: 620 })!;
    expect(text).toContain('$620.00 still to come in');
    expect(text).not.toContain('$660');
  });
});
