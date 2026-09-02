'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';

/**
 * RETIRED 2026-09-02 — see the note in the vibe-planner route.
 *
 * Kept as a redirect rather than deleted so bookmarks and old links land
 * somewhere real instead of a 404. The previous 1,100-line document board is
 * gone from the bundle (nothing imports it); `id_documents` rows are
 * untouched in the database.
 */
export default function IdTrackerRetired() {
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
