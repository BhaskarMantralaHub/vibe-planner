'use client';

import type { ReactNode } from 'react';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody } from './drawer';
import { menuItemColor, type CardMenuItem } from './card-menu';
import { haptic } from '@/lib/haptics';

/* ── ActionSheet — bottom-sheet replacement for the CardMenu ⋮ popover ──
 *
 * Mobile-first contextual action menu: same `CardMenuItem[]` shape as
 * CardMenu, so a screen migrates by swapping the component, not reshaping
 * its data. Rows are ≥52px touch targets. Colour follows `menuItemColor`:
 * label ink for everything, red only for destructive rows.
 *
 * Tap-only flow ⇒ built on the shared vaul Drawer (never ComposerModal).
 *
 * `heading` names the row the actions apply to. Without it a sheet of bare
 * "Edit / Delete" rows covers the list it came from, so nothing on screen says
 * WHICH player or expense is about to be edited or deleted. Pass it whenever
 * the sheet acts on one record; `detail` and `leading` add the line and
 * avatar that tell two similar rows apart.
 */

export interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible sheet name; visually hidden unless showTitle is set. */
  title: string;
  showTitle?: boolean;
  /** Visible name of the record the actions apply to ("Adi Jesta"). */
  heading?: string;
  /** One line under the heading that identifies the record ("#28 · Batsman"). */
  detail?: string;
  /** Avatar or icon beside the heading. */
  leading?: ReactNode;
  items: CardMenuItem[];
}

export function ActionSheet({ open, onOpenChange, title, showTitle = false, heading, detail, leading, items }: ActionSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerHandle />
      <DrawerTitle className={showTitle ? 'not-sr-only px-5 pt-2 text-[15px] font-bold text-[var(--text)]' : undefined}>
        {title}
      </DrawerTitle>
      {heading && (
        <div className="mx-5 flex items-center gap-3 border-b border-[var(--border)] pb-3 pt-1">
          {leading && <span className="flex-shrink-0">{leading}</span>}
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold leading-snug text-[var(--text)]">{heading}</p>
            {detail && <p className="truncate text-[13px] leading-snug text-[var(--muted)]">{detail}</p>}
          </div>
        </div>
      )}
      <DrawerBody className="px-2 pt-2 space-y-0">
        {items.map((item, i) => (
          <div key={i}>
            {item.dividerBefore && <div className="border-t border-[var(--border)] my-1 mx-3" />}
            <button
              onClick={() => {
                // 'selection', not 'light': picking a row off a menu is a
                // choice, and most of these rows open a confirmation rather
                // than committing anything. The commitment gets its own
                // haptic on the dialog's confirm button.
                //
                // Note what does NOT buzz: opening the sheet. Only choosing
                // from it. A haptic on every ⋮ tap is the fastest way to make
                // the whole system feel like noise.
                haptic('selection');
                onOpenChange(false);
                item.onClick();
              }}
              className="pressable w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl text-[15px] font-medium text-left cursor-pointer active:bg-[var(--hover-bg)]"
              style={{ color: menuItemColor(item.color) }}
            >
              {item.icon}
              {item.label}
            </button>
          </div>
        ))}
      </DrawerBody>
    </Drawer>
  );
}
