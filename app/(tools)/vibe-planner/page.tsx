'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useVibeStore } from '@/stores/vibe-store';
import { isCloudMode } from '@/lib/supabase/client';
import { AuthGate } from '@/components/AuthGate';
import { LocalBanner } from '@/components/LocalBanner';
import { Skeleton } from '@/components/ui';
import Header from './components/Header';
import Board from './components/Board';
import RecentlyDeleted from './components/RecentlyDeleted';

function BoardSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Header skeleton */}
      <div className="px-4 lg:px-5 pt-4 lg:pt-5">
        <Skeleton className="h-7 w-56 rounded-xl mb-3" />
        <div className="flex items-center gap-2 lg:gap-3 mb-3">
          <Skeleton className="h-16 w-24 rounded-xl" />
          <Skeleton className="h-16 w-24 rounded-xl" />
          <Skeleton className="h-16 w-24 rounded-xl" />
          <div className="ml-auto">
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>
      </div>
      <div className="px-4 lg:px-5 pb-3 pt-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 lg:gap-3 mb-2">
          <Skeleton className="h-12 flex-1 lg:max-w-xl rounded-2xl" />
          <Skeleton className="h-12 w-20 rounded-2xl" />
        </div>
      </div>

      {/* Board columns skeleton */}
      <div className="flex flex-col md:flex-row gap-4 p-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="flex-1 min-w-[220px] bg-[var(--surface)] rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-4 px-1">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-20 rounded" />
              <Skeleton className="h-4 w-4 rounded ml-auto" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: col === 0 ? 3 : col === 1 ? 2 : 1 }).map((_, card) => (
                <Skeleton key={card} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VibePlannerContent() {
  const { user } = useAuthStore();
  const { items, syncing, loadItems, setOpenMenu } = useVibeStore();

  useEffect(() => {
    const cloud = isCloudMode();
    if (cloud && user) {
      loadItems(user.id);
    } else if (!cloud) {
      loadItems('');
    }
  }, [user, loadItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOpenMenu]);

  // Show skeleton during initial cloud load (syncing + no items yet)
  if (isCloudMode() && syncing && items.length === 0) {
    return <BoardSkeleton />;
  }

  return (
    <div className="min-h-screen">
      {!isCloudMode() && <LocalBanner />}
      <Header />
      <Board />
      <RecentlyDeleted />
    </div>
  );
}

export default function VibePlannerPage() {
  return (
    <AuthGate>
      <VibePlannerContent />
    </AuthGate>
  );
}
