'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useVibeStore } from '@/stores/vibe-store';
import { isCloudMode } from '@/lib/supabase/client';
import { AuthGate } from '@/components/AuthGate';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
import { LocalBanner } from '@/components/LocalBanner';
import Header from './components/Header';
import Board from './components/Board';
import Timeline from './components/Timeline';
import RecentlyDeleted from './components/RecentlyDeleted';

function VibePlannerContent() {
  const { user } = useAuthStore();
  const { view, loadItems, setOpenMenu } = useVibeStore();

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

  return (
    <div className="min-h-screen">
      {!isCloudMode() && <LocalBanner />}
      <Header />
      {view === 'board' && <Board />}
      {view === 'timeline' && <Timeline />}
      <RecentlyDeleted />
    </div>
  );
}

export default function VibePlannerPage() {
  const { needsPasswordReset } = useAuthStore();

  if (needsPasswordReset) {
    return <ResetPasswordForm />;
  }

  return (
    <AuthGate>
      <VibePlannerContent />
    </AuthGate>
  );
}
