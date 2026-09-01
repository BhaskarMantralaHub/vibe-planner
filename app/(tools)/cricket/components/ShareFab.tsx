'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody } from '@/components/ui';
import ShareButton from './ShareButton';
import CricketFab from './CricketFab';

/**
 * Floating action button for sharing season stats / standings.
 * Replaces the previous "Share" tab in the bottom-pill nav — Share is an
 * action (opens a sheet), not a navigation tab, so it belongs as a FAB
 * anchored above the pill.
 *
 * Placement/size/colour all come from CricketFab so this matches the Add
 * buttons on Matches, Umpiring and Moments. The sheet is the shared Drawer
 * (drag-to-dismiss, safe-area padding), not a hand-rolled panel.
 */
export default function ShareFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CricketFab onClick={() => setOpen(true)} label="Share">
        <Share2 size={24} strokeWidth={2.25} />
      </CricketFab>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerHandle />
        <DrawerTitle>Share season report</DrawerTitle>
        <DrawerBody>
          <ShareButton />
        </DrawerBody>
      </Drawer>
    </>
  );
}
