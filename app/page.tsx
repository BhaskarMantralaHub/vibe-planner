'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function Home() {
  const { user, loading, isCloud, userAccess, init } = useAuthStore();
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

    // Redirect based on user's access
    if (userAccess.includes('cricket') && !userAccess.includes('toolkit') && !userAccess.includes('admin')) {
      router.replace('/cricket');
    } else {
      router.replace('/vibe-planner');
    }
  }, [user, loading, isCloud, userAccess, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--purple)] border-t-transparent" />
    </div>
  );
}
