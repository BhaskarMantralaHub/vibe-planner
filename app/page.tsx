'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function Home() {
  const { loading, init } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (loading) return;

    // Cricket is the product. Vibe Planner and ID Tracker were retired
    // 2026-09-02 — their routes now just redirect here — so there is exactly
    // one destination and no feature branching left to do.
    router.replace('/cricket');
  }, [loading, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--cricket)] border-t-transparent" />
    </div>
  );
}
