'use client';

import { useEffect } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { PageFooter } from '@/components/PageFooter';
import Gallery from '../components/Gallery';
import NotificationBell from '../components/NotificationBell';

function MomentsPage() {
  const { user } = useAuthStore();
  const { loadAll, loading } = useCricketStore();

  useEffect(() => {
    if (isCloudMode() && user) loadAll(user.id);
  }, [user, loadAll]);

  // Listen for notification click → scroll to post
  useEffect(() => {
    const handler = (e: Event) => {
      const postId = (e as CustomEvent).detail;
      setTimeout(() => {
        const el = document.getElementById(`gallery-post-${postId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };
    window.addEventListener('gallery-scroll-to', handler);
    return () => window.removeEventListener('gallery-scroll-to', handler);
  }, []);

  return (
    <div className="pt-5 pb-4">
      {/* Minimal header */}
      <div className="px-4 flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          Moments
        </h1>
        <NotificationBell />
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--dim)] border-t-transparent" />
        </div>
      ) : (
        <Gallery allSeasons />
      )}

      <PageFooter className="mt-16 mb-8 px-4" />
    </div>
  );
}

export default function MomentsRoute() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <MomentsPage />
      </RoleGate>
    </AuthGate>
  );
}
