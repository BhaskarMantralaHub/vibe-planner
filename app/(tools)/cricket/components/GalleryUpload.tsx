'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { MdClose, MdCameraAlt } from 'react-icons/md';
import type { CricketPlayer } from '@/types/cricket';

/* ── Compress for gallery: scale to max dimension, preserve aspect ratio ── */
async function compressGalleryImage(file: File, maxDim = 800): Promise<Blob> {
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  await new Promise((resolve) => { img.onload = resolve; });
  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
}

/* ── Extract @mentions from text → player IDs ── */
function extractTaggedIds(text: string, players: CricketPlayer[]): string[] {
  const mentions = text.match(/@[\w\s]+/g);
  if (!mentions) return [];
  const ids: string[] = [];
  for (const mention of mentions) {
    const name = mention.slice(1).trim().toLowerCase();
    if (name === 'all' || name === 'everyone') {
      return players.filter((p) => p.is_active).map((p) => p.id);
    }
    const player = players.find((p) => p.is_active && p.name.toLowerCase() === name);
    if (player && !ids.includes(player.id)) ids.push(player.id);
  }
  return ids;
}

/* ── @Mention Autocomplete ── */
function MentionDropdown({ query, players, onSelect, onSelectAll, position }: {
  query: string;
  players: CricketPlayer[];
  onSelect: (player: CricketPlayer) => void;
  onSelectAll: () => void;
  position: { top: number; left: number };
}) {
  const showAll = 'all'.includes(query.toLowerCase());
  const filtered = players
    .filter((p) => p.is_active && p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 6);

  if (!showAll && filtered.length === 0) return null;

  return (
    <div
      className="absolute z-10 w-[220px] rounded-xl overflow-hidden shadow-xl"
      style={{ top: position.top, left: position.left, background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {showAll && (
        <>
          <button
            onMouseDown={(e) => { e.preventDefault(); onSelectAll(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left cursor-pointer hover:bg-[var(--hover-bg)] transition-colors font-semibold"
            style={{ color: 'var(--orange)' }}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--orange)' }}>
              @
            </div>
            Everyone
          </button>
          {filtered.length > 0 && <div className="border-t border-[var(--border)] mx-2" />}
        </>
      )}
      {filtered.map((p) => (
        <button
          key={p.id}
          onMouseDown={(e) => { e.preventDefault(); onSelect(p); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
          style={{ color: 'var(--text)' }}
        >
          {p.photo_url ? (
            <img src={p.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--orange)' }}>
              {p.name[0]}
            </div>
          )}
          {p.name}
        </button>
      ))}
    </div>
  );
}

export default function GalleryUpload({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore();
  const { players, selectedSeasonId, addGalleryPost } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);
  const fileRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
  const [mentionStart, setMentionStart] = useState(0);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCaption('');
    setUploading(false);
    setMentionQuery(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  // Detect @mention while typing
  const handleCaptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCaption(val);

    const cursorPos = e.target.selectionStart ?? val.length;
    // Find the last @ before cursor
    const textBeforeCursor = val.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const afterAt = textBeforeCursor.slice(atIndex + 1);
      // Only show dropdown if no newline between @ and cursor, and query is reasonable
      if (!afterAt.includes('\n') && afterAt.length <= 30) {
        setMentionQuery(afterAt);
        setMentionStart(atIndex);
        // Position dropdown below the textarea
        setMentionPos({ top: (captionRef.current?.offsetHeight ?? 40) + 4, left: 0 });
        return;
      }
    }
    setMentionQuery(null);
  }, []);

  const insertMention = (name: string) => {
    const before = caption.slice(0, mentionStart);
    const after = caption.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const newCaption = `${before}@${name} ${after}`;
    setCaption(newCaption);
    setMentionQuery(null);

    setTimeout(() => {
      if (captionRef.current) {
        const pos = mentionStart + name.length + 2;
        captionRef.current.focus();
        captionRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handlePost = async () => {
    if (!file || !user || !selectedSeasonId) return;
    setUploading(true);

    const supabase = getSupabaseClient();
    if (!supabase) { setUploading(false); return; }

    const postId = crypto.randomUUID();
    const compressed = await compressGalleryImage(file);
    const path = `${selectedSeasonId}/${postId}.jpg`;

    const { error } = await supabase.storage.from('gallery-photos').upload(path, compressed, {
      contentType: 'image/jpeg',
    });
    if (error) {
      console.error('[gallery] upload failed:', error);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('gallery-photos').getPublicUrl(path);
    const photoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Find current user's player name
    const userEmail = user.email?.toLowerCase();
    const myPlayer = activePlayers.find((p) => p.email?.toLowerCase() === userEmail);
    const postedBy = myPlayer?.name ?? user.user_metadata?.full_name ?? user.email ?? 'Unknown';

    // Extract tagged player IDs from @mentions in caption
    const taggedIds = extractTaggedIds(caption, players);

    addGalleryPost(user.id, selectedSeasonId, photoUrl, caption.trim() || null, postedBy, taggedIds);
    handleClose();
  };

  // Close mention dropdown on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mentionQuery !== null) {
        e.stopPropagation();
        setMentionQuery(null);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, mentionQuery]);

  if (!open) return null;

  // Preview tagged players from current caption
  const previewTags = extractTaggedIds(caption, players);
  const taggedPlayers = previewTags.map((id) => activePlayers.find((p) => p.id === id)).filter(Boolean) as CricketPlayer[];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h3 className="text-[16px] font-bold text-[var(--text)]">New Post</h3>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-[var(--hover-bg)] cursor-pointer">
            <MdClose size={20} style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Photo picker */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Preview" className="w-full rounded-xl object-cover" style={{ maxHeight: 280 }} />
              <button
                onClick={() => { setFile(null); setPreview(null); fileRef.current!.value = ''; }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white cursor-pointer hover:bg-black/70"
              >
                <MdClose size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border-2 border-dashed border-[var(--border)] cursor-pointer hover:border-[var(--orange)]/50 hover:bg-[var(--hover-bg)] transition-colors"
            >
              <MdCameraAlt size={32} style={{ color: 'var(--muted)' }} />
              <span className="text-[14px] text-[var(--muted)]">Tap to select photo</span>
            </button>
          )}

          {/* Caption with @mention autocomplete */}
          <div className="relative">
            <label className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5 block">
              Caption
            </label>
            <textarea
              ref={captionRef}
              value={caption}
              onChange={handleCaptionChange}
              placeholder="Great match today! Use @ to tag players"
              rows={2}
              maxLength={500}
              className="w-full rounded-xl px-3 py-2.5 text-[14px] resize-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />

            {/* @mention dropdown */}
            {mentionQuery !== null && (
              <MentionDropdown
                query={mentionQuery}
                players={activePlayers}
                onSelect={(p) => insertMention(p.name)}
                onSelectAll={() => insertMention('Everyone')}
                position={mentionPos}
              />
            )}
          </div>

          {/* Live preview of tagged players */}
          {taggedPlayers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--dim)] self-center mr-1">Tagged:</span>
              {taggedPlayers.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: 'var(--hover-bg)', color: 'var(--blue)' }}
                >
                  @{p.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Post button */}
        <div className="px-5 py-4 border-t border-[var(--border)]">
          <button
            onClick={handlePost}
            disabled={!file || uploading}
            className="w-full py-3 rounded-xl text-[14px] font-bold text-white cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(to right, var(--orange), var(--red))' }}
          >
            {uploading ? 'Posting...' : 'Post Photo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
