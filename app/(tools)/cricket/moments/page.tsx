'use client';

import { useEffect } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Text } from '@/components/ui';
import { Camera } from 'lucide-react';
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
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
          >
            <Camera size={20} className="text-white" />
          </div>
          <div>
            <Text as="h1" size="lg" weight="bold">Moments</Text>
            <Text as="p" size="2xs" color="muted">Team photos & highlights</Text>
          </div>
        </div>
        <NotificationBell />
      </div>

      {/* Gallery feed — all seasons */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--cricket)] border-t-transparent" />
        </div>
      ) : (
        <Gallery allSeasons />
      )}

      <PageFooter className="mt-16 mb-8" />
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
