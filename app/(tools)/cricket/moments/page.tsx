'use client';

import { useEffect } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { PageFooter } from '@/components/PageFooter';
import Gallery from '../components/Gallery';
import { Camera } from 'lucide-react';

function MomentsPage() {
  const { user } = useAuthStore();
  const { loadMoments, loading, gallery } = useCricketStore();

  const postCount = gallery.filter((p) => !p.deleted_at).length;

  useEffect(() => {
    if (isCloudMode() && user) loadMoments(user.id);
  }, [user, loadMoments]);

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
    <div className="pb-4">
      {/* Header with accent strip */}
      <div className="px-4 pt-5 pb-4 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--cricket) 15%, transparent)' }}
          >
            <Camera size={17} strokeWidth={2} style={{ color: 'var(--cricket)' }} />
          </div>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight leading-tight" style={{ color: 'var(--text)' }}>
              Moments
            </h1>
            {postCount > 0 && (
              <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--dim)' }}>
                {postCount} {postCount === 1 ? 'post' : 'posts'} across all seasons
              </p>
            )}
          </div>
        </div>
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
