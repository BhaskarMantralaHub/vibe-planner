'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody } from '@/components/ui';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { X, Camera, Send, Plus } from 'lucide-react';
import type { CricketPlayer } from '@/types/cricket';
import { toast } from 'sonner';

const MAX_PHOTOS = 10;

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
            style={{ color: 'var(--cricket)' }}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--cricket)' }}>
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
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--cricket)' }}>
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

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
  const [mentionStart, setMentionStart] = useState(0);

  const reset = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setFiles([]);
    setPreviews([]);
    setCaption('');
    setUploading(false);
    setMentionQuery(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    const remaining = MAX_PHOTOS - files.length;
    const toAdd = selected.slice(0, remaining);
    const newPreviews = toAdd.map((f) => URL.createObjectURL(f));
    setFiles((prev) => [...prev, ...toAdd]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
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
    if (files.length === 0 || !user || !selectedSeasonId) return;
    setUploading(true);

    const supabase = getSupabaseClient();
    if (!supabase) { setUploading(false); return; }

    const postId = crypto.randomUUID();
    const photoUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const compressed = await compressGalleryImage(files[i]);
      const path = `${selectedSeasonId}/${postId}_${i}.jpg`;
      const { error } = await supabase.storage.from('gallery-photos').upload(path, compressed, {
        contentType: 'image/jpeg',
      });
      if (error) {
        console.error('[gallery] upload failed:', error);
        setUploading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('gallery-photos').getPublicUrl(path);
      photoUrls.push(`${urlData.publicUrl}?t=${Date.now()}`);
    }

    // Find current user's player name
    const userEmail = user.email?.toLowerCase();
    const myPlayer = activePlayers.find((p) => p.email?.toLowerCase() === userEmail);
    const postedBy = myPlayer?.name ?? user.user_metadata?.full_name ?? user.email ?? 'Unknown';

    // Extract tagged player IDs from @mentions in caption
    const taggedIds = extractTaggedIds(caption, players);

    addGalleryPost(user.id, selectedSeasonId, photoUrls, caption.trim() || null, postedBy, taggedIds);
    toast.success('Post shared');
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

  // Preview tagged players from current caption
  const previewTags = open ? extractTaggedIds(caption, players) : [];
  const taggedPlayers = previewTags.map((id) => activePlayers.find((p) => p.id === id)).filter(Boolean) as CricketPlayer[];

  return (
    <Drawer open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
          <DrawerHandle />
          <DrawerTitle>New Post</DrawerTitle>

          {/* Header: Cancel / Title / Share */}
          <div className="flex items-center justify-between px-5 py-3">
            <button
              onClick={handleClose}
              className="text-[14px] font-medium cursor-pointer min-w-[60px] text-left"
              style={{ color: 'var(--muted)' }}
            >
              Cancel
            </button>
            <span className="text-[16px] font-bold text-[var(--text)]">New Post</span>
            <button
              onClick={handlePost}
              disabled={files.length === 0 || uploading}
              className="flex items-center gap-1.5 text-[14px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-w-[60px] justify-end"
              style={{ color: 'var(--blue)' }}
            >
              <Send size={14} />
              {uploading ? 'Posting...' : 'Share'}
            </button>
          </div>

          {/* Divider */}
          <div className="h-px" style={{ background: 'var(--border)' }} />

          <DrawerBody>
            {/* Photo picker */}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
            {previews.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Photos ({previews.length}/{MAX_PHOTOS})
                  </span>
                  {previews.length < MAX_PHOTOS && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1 text-[12px] font-semibold cursor-pointer"
                      style={{ color: 'var(--blue)' }}
                    >
                      <Plus size={14} /> Add more
                    </button>
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                  {previews.map((url, i) => (
                    <div key={i} className="relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white cursor-pointer hover:bg-black/80 transition-colors"
                      >
                        <X size={12} />
                      </button>
                      <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white bg-black/50 rounded px-1">
                        {i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-3 py-16 rounded-2xl cursor-pointer hover:opacity-80 transition-opacity"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 6%, transparent), color-mix(in srgb, var(--cricket-accent) 4%, transparent))',
                  border: '2px dashed var(--border)',
                }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 15%, transparent), color-mix(in srgb, var(--cricket-accent) 10%, transparent))',
                  }}
                >
                  <Camera size={28} strokeWidth={1.5} style={{ color: 'var(--cricket)' }} />
                </div>
                <span className="text-[14px] font-medium text-[var(--muted)]">Tap to select photos</span>
                <span className="text-[12px] text-[var(--dim)]">Up to {MAX_PHOTOS} photos per post</span>
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
                className="w-full rounded-xl px-3 py-2.5 text-[16px] resize-none overflow-y-auto"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', maxHeight: '120px' }}
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
          </DrawerBody>
    </Drawer>
  );
}
