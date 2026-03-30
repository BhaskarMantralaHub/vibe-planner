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

    if (!isCloud || !user) {
      // Not logged in or local mode — default to vibe planner
      router.replace('/vibe-planner');
      return;
    }

    // Redirect based on user's enabled features
    if (userFeatures.includes('vibe-planner')) {
      router.replace('/vibe-planner');
    } else if (userFeatures.includes('cricket')) {
      router.replace('/cricket');
    } else {
      router.replace('/vibe-planner');
    }
  }, [user, loading, isCloud, userFeatures, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--toolkit)] border-t-transparent" />
    </div>
  );
}
