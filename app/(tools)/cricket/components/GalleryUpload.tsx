'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { X, Camera, Send } from 'lucide-react';
import type { CricketPlayer } from '@/types/cricket';
import { toast } from 'sonner';
import { compressGalleryImage } from '../lib/image';
import { extractTaggedIds } from '../lib/mentions';

const MAX_PHOTOS = 10;

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
    .filter((p) => p.is_active && !p.is_guest && p.name.toLowerCase().includes(query.toLowerCase()))
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
  const activePlayers = players.filter((p) => p.is_active && !p.is_guest);
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

  // ── iOS Safari keyboard handling — Instagram/Threads/WhatsApp Web pattern ──
  //
  // Problem: vaul's `repositionInputs` is broken for textareas (vaul issues
  // #294, #298, #312, #514) — it shifts the drawer in a way that leaves the
  // textarea pinned to the screen bottom with whitespace above. Big platforms
  // (IG, Threads, FB Messenger) avoid this by NOT using a bottom-sheet drawer
  // at all on mobile — they go full-screen with `100svh` + flex column layout.
  //
  // We mirror that here: full-screen modal on mobile, centered modal on desktop.
  // The action footer is translated up by the keyboard overlap (measured via
  // window.visualViewport) so it sticks just above the keyboard line.
  const [kbOffset, setKbOffset] = useState(0);

  useEffect(() => {
    if (!open) return;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      // How many pixels of the layout viewport the keyboard is hiding from the
      // bottom. Negative because we translate the footer UP by this amount.
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(-overlap);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [open]);

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

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop — visible on desktop, covered by full-screen panel on mobile */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md" onClick={handleClose} aria-hidden="true" />

      {/* Composer panel: full-screen on mobile (100svh — keyboard-stable),
          centered modal on desktop. svh NOT dvh — dvh is buggy on iOS Safari
          when the keyboard is up until iOS 17.4+. */}
      <div
        role="dialog" aria-modal="true" aria-label="New Post"
        className={
          'fixed z-50 flex flex-col bg-[var(--card)] outline-none ' +
          // Mobile: fill viewport edge-to-edge, height clamped to small viewport
          'inset-0 h-[100svh] ' +
          // Desktop: centered, fixed width, height shrinks to content with max
          'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 ' +
          'sm:w-[480px] sm:max-w-[calc(100vw-2rem)] sm:h-auto sm:max-h-[85svh] ' +
          'sm:rounded-2xl sm:border sm:border-[var(--border)] sm:shadow-2xl'
        }
      >

        {/* Header — fixed top, never moves */}
        <header className="flex-none flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
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
        </header>

          {/* Scrollable body — flex-1 fills space between header and footer.
              min-h-0 is critical: without it, flex children overflow their parent. */}
          <main className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            {/* Caption — first child, naturally lands at the top of the visible area
                when keyboard rises. Matches IG/Threads/Twitter mobile composer pattern. */}
            <div className="relative">
              <label className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5 block">
                Caption
              </label>
              <textarea
                ref={captionRef}
                value={caption}
                onChange={handleCaptionChange}
                placeholder="Great match today! Use @ to tag players"
                rows={4}
                maxLength={500}
                className="w-full rounded-xl px-3 py-2.5 text-[16px] resize-none overflow-y-auto"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', maxHeight: '200px' }}
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

            {/* Photo previews — compact thumbnail strip, only when photos selected */}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
            {previews.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                {previews.map((url, i) => (
                  <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFile(i)}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-black/65 text-white cursor-pointer active:scale-90 transition-transform"
                    >
                      <X size={10} />
                    </button>
                    <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold text-white bg-black/55 rounded px-1 leading-snug">
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}

          </main>

          {/* Action footer — translated up by keyboard overlap so it sticks just
              above the keyboard line. visualViewport listener (see useEffect above)
              keeps `kbOffset` in sync as the keyboard animates in/out. */}
          <footer
            className="flex-none flex items-center gap-2 px-5 py-3 border-t border-[var(--border)] bg-[var(--card)] transition-transform duration-150 ease-out"
            style={{ transform: `translateY(${kbOffset}px)` }}
          >
            <button
              onClick={() => fileRef.current?.click()}
              disabled={previews.length >= MAX_PHOTOS}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 cursor-pointer transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: 'var(--cricket)', background: 'color-mix(in srgb, var(--cricket) 10%, transparent)' }}
              aria-label="Add photos"
            >
              <Camera size={16} />
              <span className="text-[12px] font-bold">
                {previews.length === 0 ? 'Photos' : `${previews.length}/${MAX_PHOTOS}`}
              </span>
            </button>
            <span className="text-[11px] text-[var(--dim)] ml-auto tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {caption.length}/500
            </span>
          </footer>
      </div>
    </>,
    document.body,
  );
}
