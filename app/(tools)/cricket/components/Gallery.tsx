'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useCricketStore } from '@/stores/cricket-store';
import GalleryPostCard from './GalleryPost';
import GalleryUpload from './GalleryUpload';
import { Camera, CircleCheck, LoaderCircle, Plus } from 'lucide-react';

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <Camera size={48} strokeWidth={1.2} style={{ color: 'var(--dim)' }} className="mb-5" />
      <p className="text-[17px] font-semibold mb-1" style={{ color: 'var(--text)' }}>No moments yet</p>
      <p className="text-[13px] mb-6" style={{ color: 'var(--muted)' }}>Share your first team photo</p>
      <button
        onClick={onUpload}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold cursor-pointer active:scale-95 transition-transform"
        style={{ background: 'var(--text)', color: 'var(--bg)' }}
      >
        <Plus size={16} strokeWidth={2.5} />
        New Post
      </button>
    </div>
  );
}

export default function Gallery({ allSeasons }: { allSeasons?: boolean } = {}) {
  const { selectedSeasonId, gallery, galleryTags, galleryComments, galleryLikes, commentReactions, players, hasMoreGallery, loadingMoreGallery, loadMoreGallery } = useCricketStore();
  const [showUpload, setShowUpload] = useState(false);
  const [feedParent] = useAutoAnimate();

  const posts = gallery
    .filter((p) => !p.deleted_at && (allSeasons || p.season_id === selectedSeasonId))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="relative min-h-[50vh]">
      {posts.length === 0 ? (
        <EmptyState onUpload={() => setShowUpload(true)} />
      ) : (
        <>
          {/* Feed */}
          <div ref={feedParent}>
            {posts.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: '-20px' }}
                transition={{ duration: 0.3 }}
              >
                {index > 0 && (
                  <div className="mx-4 h-px" style={{ background: 'var(--border)' }} />
                )}
                <div className="py-4">
                  <GalleryPostCard
                    post={post}
                    tags={galleryTags.filter((t) => t.post_id === post.id)}
                    comments={galleryComments.filter((c) => c.post_id === post.id)}
                    likes={galleryLikes.filter((l) => l.post_id === post.id)}
                    reactions={commentReactions}
                    players={players}
                    index={index}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Load more / End-of-feed */}
          {hasMoreGallery ? (
            <div className="px-4 mt-4 mb-6">
              <button
                onClick={loadMoreGallery}
                disabled={loadingMoreGallery}
                className="w-full py-3 rounded-xl text-[13px] font-medium cursor-pointer transition-colors disabled:opacity-50"
                style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                {loadingMoreGallery ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoaderCircle size={14} className="animate-spin" />
                    Loading...
                  </span>
                ) : (
                  'Load more'
                )}
              </button>
            </div>
          ) : posts.length > 2 && (
            <div className="mt-10 mb-6 flex flex-col items-center gap-2">
              <CircleCheck size={20} strokeWidth={1.5} style={{ color: 'var(--dim)' }} />
              <p className="text-[12px]" style={{ color: 'var(--dim)' }}>You&apos;re all caught up</p>
            </div>
          )}
        </>
      )}

      {/* FAB — new post */}
      {posts.length > 0 && (
        <button
          onClick={() => setShowUpload(true)}
          className="fixed bottom-20 right-4 z-40 flex items-center justify-center w-12 h-12 rounded-full cursor-pointer active:scale-90 transition-transform shadow-lg"
          style={{ background: 'var(--text)', color: 'var(--bg)' }}
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      )}

      <GalleryUpload open={showUpload} onClose={() => setShowUpload(false)} />
    </div>
  );
}
