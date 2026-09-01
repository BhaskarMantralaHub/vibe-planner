import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeeRow } from '@/app/(tools)/cricket/components/FeeTracker';
import type { CricketPlayer } from '@/types/cricket';

/**
 * Regression: the roster has two players named Venkat, and the fee list used
 * to truncate names to "Venkat …" — an admin could mark money against the
 * wrong person. These tests pin the identity guarantees:
 *  - the FULL name renders (no truncate class on the name element),
 *  - the jersey number appears in the meta line,
 *  - the Mark-paid action's accessible name carries name + jersey, so the
 *    two Venkats are distinguishable to screen readers too.
 */

function makePlayer(overrides: Partial<CricketPlayer>): CricketPlayer {
  return {
    id: 'p1',
    name: 'Player',
    jersey_number: null,
    email: null,
    is_active: true,
    is_guest: false,
  } as CricketPlayer;
}

function renderRow(player: CricketPlayer, onMarkPaid = vi.fn()) {
  render(
    <FeeRow
      player={player}
      isMe={false}
      status="unpaid"
      paid={0}
      feeAmount={60}
      fee={undefined}
      isAdmin
      menuOpen={false}
      onMenuToggle={vi.fn()}
      onMenuClose={vi.fn()}
      onMarkPaid={onMarkPaid}
      onPartial={vi.fn()}
      onRevert={vi.fn()}
    />,
  );
  return onMarkPaid;
}

const venkatP = { ...makePlayer({}), id: 'v1', name: 'Venkat Prasad', jersey_number: 63 } as CricketPlayer;
const venkatR = { ...makePlayer({}), id: 'v2', name: 'Venkat Reddy Chennupati', jersey_number: null } as CricketPlayer;

describe('FeeRow identity (two-Venkats regression)', () => {
  it('renders the full player name without a truncate class', () => {
    renderRow(venkatR);
    const name = screen.getByText('Venkat Reddy Chennupati');
    expect(name).toBeInTheDocument();
    expect(name.className).not.toMatch(/truncate/);
  });

  it('shows the jersey number in the meta line', () => {
    renderRow(venkatP);
    expect(screen.getByText('#63 ·')).toBeInTheDocument();
  });

  it('gives Mark paid an accessible name carrying the full identity', () => {
    renderRow(venkatP);
    expect(
      screen.getByRole('button', { name: 'Mark Venkat Prasad, jersey number 63, as paid' }),
    ).toBeInTheDocument();
  });

  it('two same-first-name players produce distinguishable actions', () => {
    const onA = vi.fn();
    const onB = vi.fn();
    render(
      <>
        <FeeRow
          player={venkatP} isMe={false} status="unpaid" paid={0} feeAmount={60} fee={undefined}
          isAdmin menuOpen={false} onMenuToggle={vi.fn()} onMenuClose={vi.fn()}
          onMarkPaid={onA} onPartial={vi.fn()} onRevert={vi.fn()}
        />
        <FeeRow
          player={venkatR} isMe={false} status="unpaid" paid={0} feeAmount={60} fee={undefined}
          isAdmin menuOpen={false} onMenuToggle={vi.fn()} onMenuClose={vi.fn()}
          onMarkPaid={onB} onPartial={vi.fn()} onRevert={vi.fn()}
        />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mark Venkat Prasad, jersey number 63/ }));
    expect(onA).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Venkat Reddy Chennupati as paid' }));
    expect(onB).toHaveBeenCalledOnce();
  });
});
