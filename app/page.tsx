'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function Home() {
  const { user, loading, isCloud, userFeatures, init } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (loading) return;

    // Cricket is the product; Vibe Planner and ID Tracker were deprecated
    // 2026-09-02 (hidden from the menu, routes kept alive). So the landing
    // priority is cricket first, and the toolkit is only a fallback for an
    // account that has nothing else.
    if (!isCloud || !user) {
      router.replace('/cricket');
      return;
    }

    if (userFeatures.includes('cricket')) {
      router.replace('/cricket');
    } else if (userFeatures.includes('vibe-planner')) {
      router.replace('/vibe-planner');
    } else {
      router.replace('/cricket');
    }
  }, [user, loading, isCloud, userFeatures, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--toolkit)] border-t-transparent" />
    </div>
  );
}
