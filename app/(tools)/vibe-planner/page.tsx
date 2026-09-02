'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';

/**
 * RETIRED 2026-09-02 — Vibe Planner is gone; this app is a cricket product.
 *
 * The route is kept as a redirect rather than deleted outright, because the
 * URL is bookmarked, sits in old emails (password resets used to land here),
 * and is the app's historical front door. A redirect sends those visitors
 * somewhere real; deleting the folder would hand them a 404.
 *
 * It also removes the second, blue-branded login screen — one product, one
 * way in.
 *
 * The board, its components and `stores/vibe-store` are left in the repo but
 * are no longer reachable; nothing imports them, so they drop out of the
 * bundle. `vibes` rows are untouched in the database.
 */
export default function VibePlannerRetired() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/cricket');
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size="lg" brand="cricket" />
    </div>
  );
}
