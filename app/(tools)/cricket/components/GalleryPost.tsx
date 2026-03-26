'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import type { GalleryPost as GalleryPostType, GalleryTag, GalleryComment, GalleryLike, CommentReaction, CricketPlayer } from '@/types/cricket';
import { Heart, MessageCircle, MoreHorizontal, Send, X, Pencil, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Drawer } from 'vaul';


/* ── Resolve photos from post (backward compat: photo_urls → photo_url fallback) ── */
function getPostPhotos(post: GalleryPostType): string[] {
  if (post.photo_urls && post.photo_urls.length > 0) return post.photo_urls;
  if (post.photo_url) return [post.photo_url];
  return [];
}

/* ── Extract @mentions from text → player IDs ── */
function extractTaggedIds(text: string, players: CricketPlayer[]): string[] {
  const mentions = text.match(/@[\w\s]+/g);
  if (!mentions) return [];
  const ids: string[] = [];
  for (const mention of mentions) {
    const name = mention.slice(1).trim().toLowerCase();
    if (name === 'all' || name === 'everyone') return players.filter((p) => p.is_active).map((p) => p.id);
    const player = players.find((p) => p.is_active && p.name.toLowerCase() === name);
    if (player && !ids.includes(player.id)) ids.push(player.id);
  }
  return ids;
}

/* ── Render text with @mentions and #hashtags highlighted ── */
function RichText({ text, players }: { text: string; players: CricketPlayer[] }) {
  const playerNames = players.filter((p) => p.is_active).map((p) => p.name.toLowerCase());

  const result: { text: string; type: 'plain' | 'mention' | 'hashtag' }[] = [];
  const tokenRegex = /(@\w[\w\s]*?)(?=\s@|\s#|\.\.|[!?,]|$)|(#\w+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) result.push({ text: text.slice(lastIndex, match.index), type: 'plain' });

    if (match[1]) {
      const raw = match[1];
      const name = raw.slice(1).trim().toLowerCase();

      if (name === 'all' || name === 'everyone' || playerNames.includes(name)) {
        result.push({ text: raw, type: 'mention' });
      } else {
        let matched = false;
        const words = raw.slice(1).trim().split(/\s+/);
        for (let len = words.length - 1; len >= 1; len--) {
          const candidate = words.slice(0, len).join(' ').toLowerCase();
          if (playerNames.includes(candidate)) {
            result.push({ text: '@' + words.slice(0, len).join(' '), type: 'mention' });
            const rest = ' ' + words.slice(len).join(' ');
            if (rest.trim()) result.push({ text: rest, type: 'plain' });
            matched = true;
            break;
          }
        }
        if (!matched) result.push({ text: raw, type: 'plain' });
      }
    } else if (match[2]) {
      result.push({ text: match[2], type: 'hashtag' });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) result.push({ text: text.slice(lastIndex), type: 'plain' });

  return (
    <>
      {result.map((p, i) => {
        if (p.type === 'mention') {
          const nameL = p.text.slice(1).trim().toLowerCase();
          const display = (nameL === 'all' || nameL === 'everyone') ? '@Everyone' : p.text;
          return <span key={i} className="font-bold" style={{ color: 'var(--blue)' }}>{display}</span>;
        }
        if (p.type === 'hashtag') return <span key={i} className="font-bold" style={{ color: 'var(--blue)' }}>{p.text}</span>;
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

/* ── Resolve liker display name from the like record ── */
function resolveLikerName(like: { user_id: string; liked_by: string | null }, currentUserId: string | undefined): string {
  if (like.user_id === currentUserId) return 'You';
  return like.liked_by ?? 'Admin';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function Avatar({ player, name, size = 32 }: { player?: CricketPlayer | null; name: string; size?: number }) {
  if (player?.photo_url) {
    return <img src={player.photo_url} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'var(--cricket)' }}>
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

/* ── Avatar with gradient ring + jersey badge ── */
function RingedAvatar({ player, name, size = 40 }: { player?: CricketPlayer | null; name: string; size?: number }) {
  const ringSize = size + 10; // 3px ring + 2px gap on each side
  const jersey = player?.jersey_number;
  return (
    <div className="relative" style={{ width: ringSize, height: ringSize }}>
      {/* Gradient ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'linear-gradient(135deg, var(--cricket-accent), var(--cricket))' }}
      />
      {/* White/card gap */}
      <div
        className="absolute rounded-full"
        style={{
          top: 3, left: 3, right: 3, bottom: 3,
          background: 'var(--card)',
        }}
      />
      {/* Actual avatar */}
      <div className="absolute" style={{ top: 5, left: 5 }}>
        <Avatar player={player} name={name} size={size} />
      </div>
      {/* Jersey badge */}
      {jersey != null && (
        <div
          className="absolute flex items-center justify-center rounded-full text-white font-bold"
          style={{
            width: 20, height: 20,
            bottom: -2, right: -2,
            fontSize: 10,
            background: 'var(--cricket)',
            border: '2px solid var(--card)',
            lineHeight: 1,
          }}
        >
          {jersey}
        </div>
      )}
    </div>
  );
}

/* ── Fullscreen Viewer (supports multi-photo swipe) ── */
function FullscreenViewer({ photos, initialIndex = 0, caption, players, onClose }: {
  photos: string[]; initialIndex?: number; caption: string | null; players: CricketPlayer[]; onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: initialIndex * (scrollRef.current?.clientWidth ?? 0), behavior: 'instant' as ScrollBehavior });
  }, [initialIndex]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !el.clientWidth) return;
    setCurrentIndex(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={onClose}>
      <button className="absolute top-4 right-4 p-2 text-white/70 hover:text-white cursor-pointer z-10" onClick={onClose}>
        <X size={28} />
      </button>
      {photos.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-[13px] font-semibold z-10">
          {currentIndex + 1} / {photos.length}
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        onScroll={handleScroll}
        onClick={(e) => e.stopPropagation()}
      >
        {photos.map((url, i) => (
          <div key={i} className="w-screen h-full flex-shrink-0 snap-center flex items-center justify-center p-4">
            <img src={url} alt="" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
          </div>
        ))}
      </div>
      {caption && (
        <div className="px-4 pb-6 pt-2 text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-white/80 text-[14px] max-w-md mx-auto">
            <RichText text={caption} players={players} />
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Post actions drawer (vaul bottom sheet) ── */
function PostActionsDrawer({ open, onOpenChange, onEdit, onDelete, showEdit }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onEdit: () => void; onDelete: () => void; showEdit: boolean;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[100] outline-none" aria-describedby={undefined}>
          <Drawer.Title className="sr-only">Actions</Drawer.Title>
          <div className="rounded-t-2xl px-4 pb-6 pt-2" style={{ background: 'var(--card)' }}>
            <div className="flex justify-center py-2 mb-2">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
            </div>
            <div className="space-y-1">
              {showEdit && (
                <button
                  onClick={() => { onEdit(); onOpenChange(false); }}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl cursor-pointer hover:bg-[var(--hover-bg)]"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)' }}>
                    <Pencil size={18} style={{ color: 'var(--blue)' }} />
                  </div>
                  <div className="text-left">
                    <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Edit caption</p>
                    <p className="text-[12px]" style={{ color: 'var(--dim)' }}>Modify your message</p>
                  </div>
                </button>
              )}
              <button
                onClick={() => { onDelete(); onOpenChange(false); }}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl cursor-pointer hover:bg-[var(--hover-bg)]"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                  <Trash2 size={18} style={{ color: 'var(--red)' }} />
                </div>
                <div className="text-left">
                  <p className="text-[15px] font-semibold" style={{ color: 'var(--red)' }}>Delete post</p>
                  <p className="text-[12px]" style={{ color: 'var(--dim)' }}>This can&apos;t be undone</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="w-full mt-3 py-3 rounded-xl text-[15px] font-semibold cursor-pointer"
              style={{ background: 'var(--surface)', color: 'var(--text)' }}
            >
              Cancel
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ── Comment actions drawer (vaul bottom sheet) ── */
function CommentActionsDrawer({ open, onOpenChange, onEdit, onDelete, showEdit }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onEdit: () => void; onDelete: () => void; showEdit: boolean;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[100] outline-none" aria-describedby={undefined}>
          <Drawer.Title className="sr-only">Actions</Drawer.Title>
          <div className="rounded-t-2xl px-4 pb-6 pt-2" style={{ background: 'var(--card)' }}>
            <div className="flex justify-center py-2 mb-2">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
            </div>
            <div className="space-y-1">
              {showEdit && (
                <button
                  onClick={() => { onEdit(); onOpenChange(false); }}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl cursor-pointer hover:bg-[var(--hover-bg)]"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)' }}>
                    <Pencil size={18} style={{ color: 'var(--blue)' }} />
                  </div>
                  <div className="text-left">
                    <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Edit comment</p>
                    <p className="text-[12px]" style={{ color: 'var(--dim)' }}>Change the comment text</p>
                  </div>
                </button>
              )}
              <button
                onClick={() => { onDelete(); onOpenChange(false); }}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl cursor-pointer hover:bg-[var(--hover-bg)]"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                  <Trash2 size={18} style={{ color: 'var(--red)' }} />
                </div>
                <div className="text-left">
                  <p className="text-[15px] font-semibold" style={{ color: 'var(--red)' }}>Delete comment</p>
                  <p className="text-[12px]" style={{ color: 'var(--dim)' }}>Permanently remove this comment</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="w-full mt-3 py-3 rounded-xl text-[15px] font-semibold cursor-pointer"
              style={{ background: 'var(--surface)', color: 'var(--text)' }}
            >
              Cancel
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ── Confirm delete drawer (vaul bottom sheet styled as alert) ── */
function ConfirmDeleteDrawer({ open, onOpenChange, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 outline-none" aria-describedby={undefined}>
          <Drawer.Title className="sr-only">Confirm delete</Drawer.Title>
          <div className="rounded-t-2xl px-5 pb-6 pt-2 text-center" style={{ background: 'var(--card)' }}>
            <div className="flex justify-center py-2 mb-3">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
            </div>
            <p className="text-[16px] font-bold text-[var(--text)] mb-1">Delete this post?</p>
            <p className="text-[13px] text-[var(--muted)] mb-5">This action cannot be undone. The post and all its comments will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => onOpenChange(false)}
                className="flex-1 py-3 rounded-xl text-[14px] font-semibold cursor-pointer"
                style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                Cancel
              </button>
              <button onClick={() => { onConfirm(); onOpenChange(false); }}
                className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white cursor-pointer"
                style={{ background: 'var(--red)' }}>
                Delete
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ── Liked-by drawer (vaul bottom sheet) ── */
function LikedByDrawer({ open, onOpenChange, likes, players, userId }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  likes: GalleryLike[]; players: CricketPlayer[]; userId: string | undefined;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 outline-none" aria-describedby={undefined}>
          <Drawer.Title className="sr-only">Likes</Drawer.Title>
          <div className="rounded-t-2xl pb-6 pt-2" style={{ background: 'var(--card)' }}>
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
            </div>
            <div className="flex items-center justify-center px-4 py-3">
              <h4 className="text-[16px] font-bold text-[var(--text)]">Likes</h4>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {likes.map((l) => {
                const name = resolveLikerName(l, userId);
                const lPlayer = l.liked_by ? players.find((p) => p.is_active && p.name === l.liked_by) : undefined;
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar player={lPlayer} name={name} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--text)] truncate">{name}</p>
                      {lPlayer?.player_role && (
                        <p className="text-[12px] text-[var(--dim)] capitalize">{lPlayer.player_role}</p>
                      )}
                    </div>
                    <Heart size={16} fill="var(--red)" style={{ color: 'var(--red)' }} />
                  </div>
                );
              })}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ── @Mention dropdown ── */
function MentionDropdown({ query, players, onSelect, onSelectAll, position }: {
  query: string; players: CricketPlayer[];
  onSelect: (player: CricketPlayer) => void; onSelectAll: () => void;
  position: { top: number; left: number };
}) {
  const showAll = 'all'.includes(query.toLowerCase());
  const filtered = players
    .filter((p) => p.is_active && p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6);
  if (!showAll && filtered.length === 0) return null;

  return (
    <div className="absolute z-10 w-[220px] rounded-xl overflow-hidden"
      style={{
        top: position.top, left: position.left,
        background: 'var(--surface)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.04), 0 16px 32px rgba(0,0,0,0.06)',
      }}>
      {showAll && (
        <>
          <button onMouseDown={(e) => { e.preventDefault(); onSelectAll(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left cursor-pointer hover:bg-[var(--hover-bg)] font-semibold"
            style={{ color: 'var(--cricket)' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--cricket)' }}>@</div>
            Everyone
          </button>
          {filtered.length > 0 && <div className="mx-2" style={{ borderTop: '1px solid var(--border)' }} />}
        </>
      )}
      {filtered.map((p) => (
        <button key={p.id} onMouseDown={(e) => { e.preventDefault(); onSelect(p); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left cursor-pointer hover:bg-[var(--hover-bg)]"
          style={{ color: 'var(--text)' }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />
            : <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--cricket)' }}>{p.name[0]}</div>
          }
          {p.name}
        </button>
      ))}
    </div>
  );
}

/* ── Comment like ── */
function CommentLike({ commentId, reactions, userId, players }: {
  commentId: string; reactions: CommentReaction[]; userId: string | undefined; players: CricketPlayer[];
}) {
  const { toggleCommentReaction } = useCricketStore();
  const [showWho, setShowWho] = useState(false);
  const thumbs = reactions.filter((r) => r.comment_id === commentId && r.emoji === '👍');
  const count = thumbs.length;
  const hasOwn = thumbs.some((r) => r.user_id === userId);
  const likers = thumbs.map((r) => ({
    ...r,
    player: players.find((p) => p.is_active && p.user_id === r.user_id),
    name: r.user_id === userId ? 'You' : (players.find((p) => p.is_active && p.user_id === r.user_id)?.name ?? 'Player'),
  }));

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <motion.button
          whileTap={{ scale: 0.75 }}
          onClick={() => userId && toggleCommentReaction(commentId, userId, '👍')}
          className="inline-flex items-center cursor-pointer"
        >
          <Heart size={12} fill={hasOwn ? 'var(--red)' : 'none'} style={{ color: hasOwn ? 'var(--red)' : 'var(--dim)' }} />
        </motion.button>
        {count > 0 && (
          <button onClick={() => setShowWho(true)} className="inline-flex items-center gap-1 cursor-pointer">
            <span className="flex -space-x-1.5">
              {likers.slice(0, 3).map((l) => (
                <span key={l.id} className="inline-block rounded-full ring-1 ring-[var(--card)]">
                  {l.player?.photo_url ? (
                    <img src={l.player.photo_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full text-[7px] font-bold text-white" style={{ background: 'var(--cricket)' }}>
                      {l.name[0]}
                    </span>
                  )}
                </span>
              ))}
            </span>
            {count > 3 && <span className="text-[10px] font-medium" style={{ color: 'var(--dim)' }}>+{count - 3}</span>}
          </button>
        )}
      </span>
      <Drawer.Root open={showWho} onOpenChange={setShowWho}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 outline-none" aria-describedby={undefined}>
            <Drawer.Title className="sr-only">Comment Likes</Drawer.Title>
            <div className="rounded-t-2xl pb-6 pt-2" style={{ background: 'var(--card)' }}>
              <div className="flex justify-center py-2">
                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
              </div>
              <div className="flex items-center justify-center px-4 py-3">
                <h4 className="text-[16px] font-bold text-[var(--text)]">Likes</h4>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {likers.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar player={l.player} name={l.name} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--text)] truncate">{l.name}</p>
                      {l.player?.player_role && (
                        <p className="text-[12px] text-[var(--dim)] capitalize">{l.player.player_role}</p>
                      )}
                    </div>
                    <Heart size={16} fill="var(--red)" style={{ color: 'var(--red)' }} />
                  </div>
                ))}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

/* ── Caption editor with @mention ── */
function CaptionEditor({ initialCaption, players, onSave, onCancel }: {
  initialCaption: string; players: CricketPlayer[];
  onSave: (caption: string) => void; onCancel: () => void;
}) {
  const [text, setText] = useState(initialCaption);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
  const [mentionStart, setMentionStart] = useState(0);

  useEffect(() => {
    textareaRef.current?.focus();
    const len = initialCaption.length;
    textareaRef.current?.setSelectionRange(len, len);
  }, [initialCaption]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex >= 0) {
      const afterAt = textBeforeCursor.slice(atIndex + 1);
      if (!afterAt.includes('\n') && afterAt.length <= 30) {
        setMentionQuery(afterAt);
        setMentionStart(atIndex);
        setMentionPos({ top: (textareaRef.current?.offsetHeight ?? 40) + 4, left: 0 });
        return;
      }
    }
    setMentionQuery(null);
  }, []);

  const insertMention = (name: string) => {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const newText = `${before}@${name} ${after}`;
    setText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = mentionStart + name.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { mentionQuery !== null ? (e.stopPropagation(), setMentionQuery(null)) : onCancel(); }
    if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); onSave(text.trim()); }
  };

  return (
    <div className="relative px-4 pt-3">
      <textarea ref={textareaRef} value={text} onChange={handleChange} onKeyDown={handleKeyDown}
        rows={2} maxLength={500} className="w-full rounded-xl px-3 py-2.5 text-[14px] resize-none outline-none"
        style={{ background: 'var(--surface)', color: 'var(--text)' }}
        placeholder="Edit caption... use @ to tag players" />
      {mentionQuery !== null && (
        <MentionDropdown query={mentionQuery} players={players}
          onSelect={(p) => insertMention(p.name)} onSelectAll={() => insertMention('Everyone')} position={mentionPos} />
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-[var(--dim)]">
          <kbd className="px-1 py-0.5 rounded text-[10px] bg-[var(--hover-bg)]">Cmd+Return</kbd> save
        </p>
        <div className="flex gap-1.5">
          <button onClick={onCancel} className="px-2.5 py-1 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--hover-bg)]" style={{ color: 'var(--muted)' }}>Cancel</button>
          <button onClick={() => onSave(text.trim())} className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-white cursor-pointer" style={{ background: 'var(--cricket)' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ── Detect welcome/text-only posts ── */
function isWelcomePost(caption: string | null): boolean {
  if (!caption) return false;
  const lower = caption.toLowerCase();
  return lower.includes('welcome') || lower.includes('joined the team') || lower.includes('joined sunrisers');
}

/* ── Main Post Card ── */
export default function GalleryPostCard({
  post, tags, comments, likes, reactions, players, index = 0,
}: {
  post: GalleryPostType;
  tags: GalleryTag[];
  comments: GalleryComment[];
  likes: GalleryLike[];
  reactions: CommentReaction[];
  players: CricketPlayer[];
  index?: number;
}) {
  const { user, userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { deleteGalleryPost, updateGalleryPost, addGalleryComment, updateGalleryComment, deleteGalleryComment, toggleGalleryLike } = useCricketStore();

  const [commentText, setCommentText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [showLikedBy, setShowLikedBy] = useState(false);
  const [commentActionId, setCommentActionId] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showDoubleTapHeart, setShowDoubleTapHeart] = useState(false);
  const lastTapTime = useRef(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [commentsParent] = useAutoAnimate();

  const isOwn = user?.id === post.user_id;
  const isLiked = likes.some((l) => l.user_id === user?.id);
  const likeCount = likes.length;
  const commentCount = comments.length;

  const authorPlayer = players.find((p) => p.email && p.name === post.posted_by);
  const visibleComments = showAllComments ? comments : comments.slice(-2);

  // Resolve current user's player — match by email first, then by name containing auth display name
  const myEmail = user?.email?.toLowerCase();
  const myAuthName = user?.user_metadata?.full_name;
  const myPlayer = players.find((p) => p.is_active && myEmail && p.email?.toLowerCase() === myEmail)
    ?? (myAuthName ? players.find((p) => p.is_active && p.name.toLowerCase().includes(myAuthName.toLowerCase())) : undefined);
  const myName = myPlayer?.name ?? myAuthName ?? null;

  const handleLike = () => { if (user) toggleGalleryLike(post.id, user.id, myName); };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      // Double tap detected
      if (user && !isLiked) {
        toggleGalleryLike(post.id, user.id, myName);
      }
      setShowDoubleTapHeart(true);
      setTimeout(() => setShowDoubleTapHeart(false), 800);
      lastTapTime.current = 0;
    } else {
      lastTapTime.current = now;
    }
  };

  const handleComment = () => {
    if (!user || !commentText.trim()) return;
    const userEmail = user.email?.toLowerCase();
    const commentPlayer = players.find((p) => p.is_active && (p.email?.toLowerCase() === userEmail || p.user_id === user.id));
    const commentBy = commentPlayer?.name ?? user.user_metadata?.full_name ?? user.email ?? 'Unknown';
    addGalleryComment(post.id, user.id, commentBy, commentText.trim());
    setCommentText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); }
  };

  const handleSaveEdit = (newCaption: string) => {
    const taggedIds = extractTaggedIds(newCaption, players);
    updateGalleryPost(post.id, newCaption || null, taggedIds);
    setEditing(false);
  };

  const captionText = post.caption ?? '';
  const captionLong = captionText.length > 120;

  // Find the comment being actioned on (for drawer)
  const actionedComment = commentActionId ? comments.find((c) => c.id === commentActionId) : null;
  const actionedCommentIsOwn = actionedComment?.user_id === user?.id;

  const photos = getPostPhotos(post);
  const isTextOnly = photos.length === 0;
  const isWelcome = isTextOnly && isWelcomePost(post.caption);

  return (
    <>
      <motion.div
        id={`gallery-post-${post.id}`}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="overflow-hidden gallery-post-card"
        style={{
          background: 'var(--card)',
          borderRadius: 20,
          boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.04), 0 16px 32px rgba(0,0,0,0.06)',
        }}
      >
        {/* Author header */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <RingedAvatar player={authorPlayer} name={post.posted_by ?? 'U'} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[var(--text)] truncate">{post.posted_by}</p>
            <p className="text-[12px] uppercase tracking-wider" style={{ color: 'var(--dim)' }}>{timeAgo(post.created_at)}</p>
          </div>
          {(isOwn || isAdmin) && !editing && (
            <button onClick={() => setShowMenu(true)}
              className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] cursor-pointer" title="More options">
              <MoreHorizontal size={22} style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>

        <PostActionsDrawer
          open={showMenu}
          onOpenChange={setShowMenu}
          onEdit={() => setEditing(true)}
          onDelete={() => setShowDeleteConfirm(true)}
          showEdit={isOwn}
        />

        {/* Photo carousel — edge to edge, 4:5 aspect */}
        {photos.length > 0 && (
          <div
            className="w-full relative"
            style={{ aspectRatio: '4/5', maxHeight: '70vh' }}
            onDoubleClick={(e) => {
              e.preventDefault();
              handleDoubleTap();
              lastTapTime.current = Date.now();
            }}
          >
            {/* Scrollable photo container */}
            <div
              ref={carouselRef}
              className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
              onScroll={() => {
                const el = carouselRef.current;
                if (!el || !el.clientWidth) return;
                setActivePhoto(Math.round(el.scrollLeft / el.clientWidth));
              }}
            >
              {photos.map((url, i) => (
                <div
                  key={i}
                  className="w-full h-full flex-shrink-0 snap-center relative cursor-pointer"
                  onClick={() => {
                    if (Date.now() - lastTapTime.current > 300) {
                      const clickTime = Date.now();
                      setTimeout(() => { if (lastTapTime.current < clickTime) setFullscreen(true); }, 310);
                    }
                  }}
                >
                  <img
                    src={url}
                    alt={post.caption ?? 'Gallery photo'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
            {/* Photo count badge — top right, multi-photo only */}
            {photos.length > 1 && (
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-[12px] font-semibold pointer-events-none">
                {activePhoto + 1}/{photos.length}
              </div>
            )}
            {/* Dot indicators — bottom center, multi-photo only */}
            {photos.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
                {photos.map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-200"
                    style={{
                      width: i === activePhoto ? 7 : 5,
                      height: i === activePhoto ? 7 : 5,
                      background: i === activePhoto ? 'white' : 'rgba(255,255,255,0.4)',
                    }}
                  />
                ))}
              </div>
            )}
            {/* Bottom vignette */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(transparent 60%, rgba(0,0,0,0.08) 100%)' }}
            />
            {/* Double-tap heart overlay */}
            <AnimatePresence>
              {showDoubleTapHeart && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1.3, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <Heart size={80} fill="white" className="text-white drop-shadow-lg" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Text-only post — welcome / announcement style */}
        {isTextOnly && post.caption && (
          <div
            onClick={handleDoubleTap}
            className="relative mx-4 rounded-2xl overflow-hidden"
            style={{
              borderLeft: '4px solid transparent',
              borderImage: 'linear-gradient(to bottom, var(--cricket), var(--cricket-accent)) 1',
              background: 'color-mix(in srgb, var(--cricket) 4%, transparent)',
            }}
          >
            <div className="px-4 py-4">
              {/* Type badge */}
              {isWelcome && (
                <div className="mb-3">
                  <span
                    className="inline-block rounded-full text-[11px] font-semibold uppercase tracking-wider px-3 py-1 text-white"
                    style={{ background: 'linear-gradient(135deg, var(--cricket-accent), var(--cricket))' }}
                  >
                    Welcome
                  </span>
                </div>
              )}
              {!isWelcome && (
                <div className="mb-3">
                  <span
                    className="inline-block rounded-full text-[11px] font-semibold uppercase tracking-wider px-3 py-1 text-white"
                    style={{ background: 'linear-gradient(135deg, var(--blue), #6366f1)' }}
                  >
                    Announcement
                  </span>
                </div>
              )}
              {!editing && (
                <p className="text-[16px] leading-relaxed" style={{ color: 'var(--text)' }}>
                  <RichText text={post.caption} players={players} />
                </p>
              )}
            </div>
            {/* Double-tap heart overlay for text posts */}
            <AnimatePresence>
              {showDoubleTapHeart && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1.3, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                >
                  <Heart size={48} fill="var(--red)" style={{ color: 'var(--red)' }} className="drop-shadow-lg" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Caption editor */}
        {editing && (
          <CaptionEditor initialCaption={captionText} players={players} onSave={handleSaveEdit} onCancel={() => setEditing(false)} />
        )}

        {/* Caption — photo posts only (text-only posts render caption above) */}
        {!editing && post.caption && photos.length > 0 && (
          <div className="px-4 pt-3">
            <p className="text-[15px] text-[var(--text)] leading-normal">
              <strong className="font-semibold">{post.posted_by}</strong>{' '}
              {expanded || !captionLong
                ? <RichText text={post.caption} players={players} />
                : <><RichText text={post.caption.slice(0, 120)} players={players} /><span>...</span>
                    <button onClick={() => setExpanded(true)} className="ml-1 cursor-pointer" style={{ color: 'var(--dim)' }}>more</button></>
              }
            </p>
          </div>
        )}

        {/* Action bar — Instagram style */}
        <div className="flex items-center gap-5 px-4 py-3">
          <motion.button
            whileTap={{ scale: 0.75 }}
            onClick={handleLike}
            className="cursor-pointer"
          >
            {isLiked ? (
              <motion.div
                key="liked"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.3 }}
              >
                <Heart size={26} strokeWidth={1.5} fill="var(--red)" style={{ color: 'var(--red)' }} />
              </motion.div>
            ) : (
              <Heart size={26} strokeWidth={1.5} className="text-[var(--text)]" />
            )}
          </motion.button>
          <button onClick={() => setShowAllComments(!showAllComments)} className="cursor-pointer">
            <MessageCircle size={24} strokeWidth={1.5} className="text-[var(--text)]" />
          </button>
        </div>

        {/* Like count — below action bar */}
        {likeCount > 0 && (
          <button onClick={() => setShowLikedBy(true)}
            className="px-4 pb-1 text-[14px] font-semibold text-[var(--text)] cursor-pointer text-left block">
            {(() => {
              const likerNames = likes
                .map((l) => resolveLikerName(l, user?.id));
              if (likerNames.length === 0) return `${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`;
              if (likerNames.length === 1 && likeCount === 1) return <span>Liked by <strong>{likerNames[0]}</strong></span>;
              if (likerNames.length === 2 && likeCount === 2) return <span>Liked by <strong>{likerNames[0]}</strong> and <strong>{likerNames[1]}</strong></span>;
              if (likerNames.length >= 1) return <span>Liked by <strong>{likerNames[0]}</strong> and <strong>{likeCount - 1} others</strong></span>;
              return `${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`;
            })()}
          </button>
        )}

        {/* Comments */}
        {comments.length > 0 && (
          <div className="px-4 pb-2 pt-1">
            {comments.length > 2 && !showAllComments && (
              <button onClick={() => setShowAllComments(true)}
                className="text-[14px] mb-2 cursor-pointer"
                style={{ color: 'var(--dim)' }}>
                View all {comments.length} comments
              </button>
            )}
            <div ref={commentsParent} className="space-y-0.5">
              {visibleComments.map((c) => {
                const isEditingThis = editingCommentId === c.id;
                const canModify = c.user_id === user?.id || isAdmin;
                return isEditingThis ? (
                  <div key={c.id} className="py-2">
                    <input type="text" value={editCommentText}
                      onChange={(e) => setEditCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editCommentText.trim()) { updateGalleryComment(c.id, editCommentText.trim()); setEditingCommentId(null); }
                        if (e.key === 'Escape') setEditingCommentId(null);
                      }}
                      autoFocus maxLength={300}
                      className="w-full text-[13px] rounded-lg px-3 py-2 outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--cricket)', color: 'var(--text)' }} />
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => { if (editCommentText.trim()) { updateGalleryComment(c.id, editCommentText.trim()); setEditingCommentId(null); } }}
                        className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white cursor-pointer"
                        style={{ background: 'var(--cricket)' }}>Save</button>
                      <button onClick={() => setEditingCommentId(null)}
                        className="text-[11px] font-medium cursor-pointer" style={{ color: 'var(--muted)' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={c.id} className="flex gap-2.5 py-2">
                    <div className="shrink-0 mt-0.5">
                      <Avatar player={players.find((p) => p.is_active && p.user_id === c.user_id) ?? players.find((p) => p.is_active && p.name === c.comment_by)} name={c.comment_by ?? 'U'} size={28} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1">
                        <p className="flex-1 text-[14px] text-[var(--text)] leading-normal">
                          <strong className="font-semibold">{c.comment_by}</strong>{'  '}{c.text}
                        </p>
                        {canModify && (
                          <button
                            onClick={() => { setCommentActionId(c.id); setEditCommentText(c.text); }}
                            className="p-1 rounded-lg hover:bg-[var(--hover-bg)] cursor-pointer shrink-0 mt-0.5"
                          >
                            <MoreHorizontal size={14} style={{ color: 'var(--dim)' }} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[12px] text-[var(--dim)]">{timeAgo(c.created_at)}</span>
                        <CommentLike commentId={c.id} reactions={reactions} userId={user?.id} players={players} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Comment input — pill-shaped with border-t */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <Avatar player={myPlayer} name={myName ?? user?.email?.[0] ?? 'U'} size={32} />
            <div
              className="flex-1 flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{ border: '1px solid var(--border)' }}
            >
              <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown} placeholder="Add a comment..." maxLength={300}
                className="flex-1 text-[14px] bg-transparent outline-none min-w-0" style={{ color: 'var(--text)' }} />
              <AnimatePresence>
                {commentText.trim() && (
                  <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={handleComment}
                    className="p-1 rounded-full cursor-pointer shrink-0"
                    style={{ background: 'var(--blue)' }}
                  >
                    <Send size={14} className="text-white" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {fullscreen && photos.length > 0 && <FullscreenViewer photos={photos} initialIndex={activePhoto} caption={post.caption} players={players} onClose={() => setFullscreen(false)} />}

      <ConfirmDeleteDrawer
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => deleteGalleryPost(post.id)}
      />

      <LikedByDrawer
        open={showLikedBy}
        onOpenChange={setShowLikedBy}
        likes={likes}
        players={players}
        userId={user?.id}
      />

      <CommentActionsDrawer
        open={commentActionId !== null}
        onOpenChange={(open) => { if (!open) setCommentActionId(null); }}
        onEdit={() => {
          if (actionedComment) {
            setEditingCommentId(actionedComment.id);
            setEditCommentText(actionedComment.text);
          }
        }}
        onDelete={() => {
          if (commentActionId) deleteGalleryComment(commentActionId);
        }}
        showEdit={actionedCommentIsOwn}
      />

      {/* Dark mode shadow override */}
      <style>{`
        [data-theme="dark"] .gallery-post-card {
          box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2), 0 16px 32px rgba(0,0,0,0.2) !important;
        }
        [data-theme="dark"] .gallery-post-card .text-only-tint {
          background: rgba(255,107,53,0.06) !important;
        }
      `}</style>
    </>
  );
}
