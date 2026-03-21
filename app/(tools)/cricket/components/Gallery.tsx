'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import GalleryPostCard from './GalleryPost';
import GalleryUpload from './GalleryUpload';
import { MdCameraAlt, MdPhotoLibrary } from 'react-icons/md';
import { FaHeart, FaComment } from 'react-icons/fa';

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <MdCameraAlt size={30} style={{ color: 'var(--muted)' }} />
      </div>
      <h3 className="text-[17px] font-bold text-[var(--text)] mb-1">No photos yet</h3>
      <p className="text-[13px] text-[var(--muted)] text-center max-w-[240px] mb-5">
        Share match highlights and team moments
      </p>
      <button
        onClick={onUpload}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
        style={{ background: 'linear-gradient(to right, var(--orange), var(--red))' }}
      >
        <MdCameraAlt size={18} />
        Post First Photo
      </button>
    </div>
  );
}

export default function Gallery() {
  const { selectedSeasonId, gallery, galleryTags, galleryComments, galleryLikes, commentReactions, players } = useCricketStore();
  const [showUpload, setShowUpload] = useState(false);

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
          <div className="max-w-lg mx-auto mb-5">
            <div
              className="rounded-2xl px-5 py-4 flex items-center justify-between"
              style={{
                background: 'linear-gradient(135deg, rgba(217,119,6,0.08), rgba(239,68,68,0.06))',
                border: '1px solid rgba(217,119,6,0.12)',
              }}
            >
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-1.5">
                  <MdPhotoLibrary size={16} style={{ color: 'var(--orange)' }} />
                  <span className="text-[13px] font-bold text-[var(--text)]">{seasonPosts.length}</span>
                  <span className="text-[12px] text-[var(--muted)]">{seasonPosts.length === 1 ? 'post' : 'posts'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FaHeart size={12} style={{ color: 'var(--red)' }} />
                  <span className="text-[13px] font-bold text-[var(--text)]">{totalLikes}</span>
                  <span className="text-[12px] text-[var(--muted)]">{totalLikes === 1 ? 'like' : 'likes'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FaComment size={11} style={{ color: 'var(--blue)' }} />
                  <span className="text-[13px] font-bold text-[var(--text)]">{totalComments}</span>
                </div>
              </div>
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-[12px] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, var(--orange), var(--red))' }}
              >
                <MdCameraAlt size={15} />
                Post
              </button>
            </div>
          </div>

          {/* Feed */}
          <div className="space-y-5 max-w-lg mx-auto">
            {seasonPosts.map((post) => (
              <GalleryPostCard
                key={post.id}
                post={post}
                tags={galleryTags.filter((t) => t.post_id === post.id)}
                comments={galleryComments.filter((c) => c.post_id === post.id)}
                likes={galleryLikes.filter((l) => l.post_id === post.id)}
                reactions={commentReactions}
                players={players}
              />
            ))}
          </div>

          {/* Subtle end-of-feed marker */}
          <div className="max-w-lg mx-auto mt-8 mb-4 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-[11px] font-medium text-[var(--dim)]">You're all caught up</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>
        </>
      )}

      {/* FAB — Upload button (mobile) */}
      {seasonPosts.length > 0 && (
        <button
          onClick={() => setShowUpload(true)}
          className="fixed bottom-6 right-6 z-40 sm:hidden flex items-center justify-center w-14 h-14 rounded-full text-white cursor-pointer shadow-lg hover:scale-105 transition-transform"
          style={{ background: 'linear-gradient(135deg, var(--orange), var(--red))', boxShadow: '0 4px 20px rgba(217,119,6,0.4)' }}
        >
          <MdCameraAlt size={24} />
        </button>
      )}

      <GalleryUpload open={showUpload} onClose={() => setShowUpload(false)} />
    </div>
  );
}
