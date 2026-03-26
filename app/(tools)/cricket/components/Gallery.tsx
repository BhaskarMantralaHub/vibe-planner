'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useCricketStore } from '@/stores/cricket-store';
import GalleryPostCard from './GalleryPost';
import GalleryUpload from './GalleryUpload';
import { Camera, Image as ImageIcon, Heart, MessageCircle, CheckCircle2, Plus, Loader2 } from 'lucide-react';

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 12%, transparent), color-mix(in srgb, var(--cricket-accent) 8%, transparent))',
        }}
      >
        <Camera size={40} strokeWidth={1.5} style={{ color: 'var(--cricket)' }} />
      </div>
      <h3 className="text-[20px] font-bold text-[var(--text)] mb-2">Share Team Moments</h3>
      <p className="text-[14px] text-[var(--muted)] text-center max-w-[280px] mb-7 leading-relaxed">
        Post match highlights, team celebrations, and behind-the-scenes moments
      </p>
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onUpload}
        className="flex items-center gap-2 px-6 py-3 rounded-full text-white text-[14px] font-semibold cursor-pointer shadow-lg"
        style={{
          background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
          boxShadow: '0 4px 16px var(--cricket-glow)',
        }}
      >
        <Camera size={18} />
        Post First Photo
      </motion.button>
    </div>
  );
}

function StatItem({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="flex items-baseline gap-1">
        <span className="text-[20px] font-bold text-[var(--text)] leading-none">{value}</span>
        <span className="text-[12px] text-[var(--muted)] uppercase tracking-wider font-medium">{label}</span>
      </div>
    </div>
  );
}

export default function Gallery() {
  const { selectedSeasonId, gallery, galleryTags, galleryComments, galleryLikes, commentReactions, players, hasMoreGallery, loadingMoreGallery, loadMoreGallery } = useCricketStore();
  const [showUpload, setShowUpload] = useState(false);
  const [feedParent] = useAutoAnimate();

  const seasonPosts = gallery
    .filter((p) => p.season_id === selectedSeasonId && !p.deleted_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalLikes = galleryLikes.filter((l) => seasonPosts.some((p) => p.id === l.post_id)).length;
  const totalComments = galleryComments.filter((c) => seasonPosts.some((p) => p.id === c.post_id)).length;

  return (
    <div className="relative min-h-[50vh]">
      {seasonPosts.length === 0 ? (
        <EmptyState onUpload={() => setShowUpload(true)} />
      ) : (
        <>
          {/* Stats banner */}
          <div className="max-w-lg mx-auto mb-6">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-5">
                <StatItem
                  icon={<ImageIcon size={14} style={{ color: 'var(--cricket)' }} />}
                  value={seasonPosts.length}
                  label={seasonPosts.length === 1 ? 'post' : 'posts'}
                />
                <StatItem
                  icon={<Heart size={14} fill="var(--red)" style={{ color: 'var(--red)' }} />}
                  value={totalLikes}
                  label={totalLikes === 1 ? 'like' : 'likes'}
                />
                <StatItem
                  icon={<MessageCircle size={14} style={{ color: 'var(--blue)' }} />}
                  value={totalComments}
                  label={totalComments === 1 ? 'comment' : 'comments'}
                />
              </div>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowUpload(true)}
                className="hidden sm:flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white text-[13px] font-semibold cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
                  boxShadow: '0 2px 12px var(--cricket-glow)',
                }}
              >
                <Plus size={15} strokeWidth={2.5} />
                New Post
              </motion.button>
            </div>
          </div>

          {/* Feed */}
          <div ref={feedParent} className="space-y-5 max-w-lg mx-auto">
            {seasonPosts.map((post, index) => (
              <GalleryPostCard
                key={post.id}
                post={post}
                tags={galleryTags.filter((t) => t.post_id === post.id)}
                comments={galleryComments.filter((c) => c.post_id === post.id)}
                likes={galleryLikes.filter((l) => l.post_id === post.id)}
                reactions={commentReactions}
                players={players}
                index={index}
              />
            ))}
          </div>

          {/* Load more / End-of-feed */}
          {hasMoreGallery ? (
            <div className="max-w-lg mx-auto mt-8 mb-6 flex justify-center">
              <button
                onClick={loadMoreGallery}
                disabled={loadingMoreGallery}
                className="w-full py-3 rounded-xl text-[13px] font-semibold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--surface)',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                }}
              >
                {loadingMoreGallery ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Loading...
                  </span>
                ) : (
                  'Load more posts'
                )}
              </button>
            </div>
          ) : (
            <div className="max-w-lg mx-auto mt-10 mb-6 flex flex-col items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))',
                }}
              >
                <CheckCircle2 size={24} strokeWidth={1.5} style={{ color: 'var(--green)' }} />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[var(--text)]">You&apos;re all caught up</p>
                <p className="text-[11px] text-[var(--dim)] mt-0.5">You&apos;ve seen all recent posts</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* FAB — Upload button (mobile) */}
      {seasonPosts.length > 0 && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowUpload(true)}
          className="fixed bottom-6 right-6 z-40 sm:hidden flex items-center justify-center w-14 h-14 rounded-full text-white cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
            boxShadow: '0 4px 20px var(--cricket-glow)',
          }}
        >
          <Camera size={24} />
        </motion.button>
      )}

      <GalleryUpload open={showUpload} onClose={() => setShowUpload(false)} />
    </div>
  );
}
