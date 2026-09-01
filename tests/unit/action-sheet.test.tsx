import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pencil, Trash2 } from 'lucide-react';
import { ActionSheet } from '@/components/ui/action-sheet';
import type { CardMenuItem } from '@/components/ui/card-menu';

/**
 * ActionSheet is the mobile bottom-sheet replacement for the CardMenu ⋮
 * popover. It deliberately accepts the same CardMenuItem[] shape so screens
 * migrate by swapping the component, not reshaping their data — these tests
 * pin that contract.
 */

beforeAll(() => {
  // vaul measures its content; jsdom has no ResizeObserver.
  if (!('ResizeObserver' in window)) {
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    });
  }
});

function makeItems(overrides?: Partial<Record<'edit' | 'del', () => void>>): CardMenuItem[] {
  return [
    { label: 'Edit', icon: <Pencil size={17} />, color: 'var(--text)', onClick: overrides?.edit ?? vi.fn() },
    {
      label: 'Delete',
      icon: <Trash2 size={17} />,
      color: 'var(--red)',
      onClick: overrides?.del ?? vi.fn(),
      dividerBefore: true,
    },
  ];
}

describe('ActionSheet', () => {
  it('renders every item as a button when open', () => {
    render(
      <ActionSheet open onOpenChange={vi.fn()} title="Expense actions" items={makeItems()} />,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <ActionSheet open={false} onOpenChange={vi.fn()} title="Expense actions" items={makeItems()} />,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('fires the item onClick AND closes the sheet on tap', () => {
    const onEdit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ActionSheet open onOpenChange={onOpenChange} title="Expense actions" items={makeItems({ edit: onEdit })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('tints a destructive row with the color it was given', () => {
    render(
      <ActionSheet open onOpenChange={vi.fn()} title="Expense actions" items={makeItems()} />,
    );
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(del.style.color).toBe('var(--red)');
  });

  it('renders a divider before an item flagged dividerBefore', () => {
    render(
      <ActionSheet open onOpenChange={vi.fn()} title="Expense actions" items={makeItems()} />,
    );
    const del = screen.getByRole('button', { name: 'Delete' });
    const divider = del.parentElement?.querySelector('.border-t');
    expect(divider).not.toBeNull();
  });

  it('keeps rows at a ≥44px touch target', () => {
    render(
      <ActionSheet open onOpenChange={vi.fn()} title="Expense actions" items={makeItems()} />,
    );
    expect(screen.getByRole('button', { name: 'Edit' }).className).toContain('min-h-[52px]');
  });
});
