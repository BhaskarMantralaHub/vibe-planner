'use client';

import { Drawer, DrawerHandle, DrawerTitle, DrawerBody } from './drawer';
import type { CardMenuItem } from './card-menu';

/* ── ActionSheet — bottom-sheet replacement for the CardMenu ⋮ popover ──
 *
 * Mobile-first contextual action menu: same `CardMenuItem[]` shape as
 * CardMenu, so a screen migrates by swapping the component, not reshaping
 * its data. Rows are ≥52px touch targets; destructive rows pass their own
 * color (var(--red)) exactly as they did with CardMenu.
 *
 * Tap-only flow ⇒ built on the shared vaul Drawer (never ComposerModal).
 */

export interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible sheet name; visually hidden unless showTitle is set. */
  title: string;
  showTitle?: boolean;
  items: CardMenuItem[];
}

export function ActionSheet({ open, onOpenChange, title, showTitle = false, items }: ActionSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerHandle />
      <DrawerTitle className={showTitle ? 'not-sr-only px-5 pt-2 text-[15px] font-bold text-[var(--text)]' : undefined}>
        {title}
      </DrawerTitle>
      <DrawerBody className="px-2 pt-2 space-y-0">
        {items.map((item, i) => (
          <div key={i}>
            {item.dividerBefore && <div className="border-t border-[var(--border)] my-1 mx-3" />}
            <button
              onClick={() => {
                onOpenChange(false);
                item.onClick();
              }}
              className="pressable w-full flex items-center gap-3 min-h-[52px] px-4 rounded-xl text-[15px] font-medium text-left cursor-pointer active:bg-[var(--hover-bg)]"
              style={{ color: item.color }}
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
