'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import type { GalleryPost as GalleryPostType, GalleryTag, GalleryComment, GalleryLike, CommentReaction, CricketPlayer } from '@/types/cricket';
import { MdFavorite, MdFavoriteBorder, MdChatBubbleOutline, MdDeleteOutline, MdSend, MdClose, MdEdit, MdMoreVert } from 'react-icons/md';


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
  // Build a set of known names for matching
  const playerNames = players.filter((p) => p.is_active).map((p) => p.name.toLowerCase());

  const result: { text: string; type: 'plain' | 'mention' | 'hashtag' }[] = [];
  // Split on @mentions and #hashtags with a single pass
  const tokenRegex = /(@\w[\w\s]*?)(?=\s@|\s#|\.\.|[!?,]|$)|(#\w+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) result.push({ text: text.slice(lastIndex, match.index), type: 'plain' });

    if (match[1]) {
      const raw = match[1];
      const name = raw.slice(1).trim().toLowerCase();

      // Try exact match first (e.g., @all, @Bhaskar Bachi)
      if (name === 'all' || name === 'everyone' || playerNames.includes(name)) {
        result.push({ text: raw, type: 'mention' });
      } else {
        // Try progressively shorter substrings to find a player name prefix
        // e.g., "@Bhaskar Bachi Our Jersey" → match "@Bhaskar Bachi", rest is plain
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
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'var(--orange)' }}>
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

/* ── Fullscreen Viewer ── */
function FullscreenViewer({ src, caption, players, onClose }: { src: string; caption: string | null; players: CricketPlayer[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90" onClick={onClose}>
      <button className="absolute top-4 right-4 p-2 text-white/70 hover:text-white cursor-pointer z-10" onClick={onClose}>
        <MdClose size={28} />
      </button>
      <div className="max-w-full max-h-full p-4 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt="" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
        {caption && (
          <p className="mt-3 text-white/80 text-[14px] text-center max-w-md">
            <RichText text={caption} players={players} />
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Three-dot menu ── */
function PostMenu({ anchorRef, onEdit, onDelete, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const menuWidth = 140;
      setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)) });
    }
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [anchorRef, onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div className="fixed z-[100] w-[140px] rounded-xl overflow-hidden shadow-2xl"
        style={{ top: pos.top, left: pos.left, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <button onClick={() => { onEdit(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--text)' }}>
          <MdEdit size={15} style={{ color: 'var(--blue)' }} /> Edit Caption
        </button>
        <div className="border-t border-[var(--border)] my-0.5 mx-2" />
        <button onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--red)' }}>
          <MdDeleteOutline size={15} /> Delete Post
        </button>
      </div>
    </>,
    document.body,
  );
}

/* ── Confirm delete ── */
function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-xs rounded-2xl p-5 text-center"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}>
        <p className="text-[15px] font-semibold text-[var(--text)] mb-2">Delete this post?</p>
        <p className="text-[13px] text-[var(--muted)] mb-5">This action cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white cursor-pointer"
            style={{ background: 'var(--red)' }}>
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
    <div className="absolute z-10 w-[220px] rounded-xl overflow-hidden shadow-xl"
      style={{ top: position.top, left: position.left, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {showAll && (
        <>
          <button onMouseDown={(e) => { e.preventDefault(); onSelectAll(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left cursor-pointer hover:bg-[var(--hover-bg)] font-semibold"
            style={{ color: 'var(--orange)' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--orange)' }}>@</div>
            Everyone
          </button>
          {filtered.length > 0 && <div className="border-t border-[var(--border)] mx-2" />}
        </>
      )}
      {filtered.map((p) => (
        <button key={p.id} onMouseDown={(e) => { e.preventDefault(); onSelect(p); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left cursor-pointer hover:bg-[var(--hover-bg)]"
          style={{ color: 'var(--text)' }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />
            : <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--orange)' }}>{p.name[0]}</div>
          }
          {p.name}
        </button>
      ))}
    </div>
  );
}

/* ── Comment like ── */
function CommentLike({ commentId, reactions, userId }: {
  commentId: string; reactions: CommentReaction[]; userId: string | undefined;
}) {
  const { toggleCommentReaction } = useCricketStore();
  const thumbs = reactions.filter((r) => r.comment_id === commentId && r.emoji === '👍');
  const count = thumbs.length;
  const hasOwn = thumbs.some((r) => r.user_id === userId);

  return (
    <button
      onClick={() => userId && toggleCommentReaction(commentId, userId, '👍')}
      className="inline-flex items-center gap-0.5 cursor-pointer"
    >
      <MdFavorite size={12} style={{ color: hasOwn ? 'var(--red)' : 'var(--dim)' }} />
      {count > 0 && <span className="text-[10px] font-medium" style={{ color: hasOwn ? 'var(--red)' : 'var(--dim)' }}>{count}</span>}
    </button>
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
        rows={2} maxLength={500} className="w-full rounded-xl px-3 py-2.5 text-[14px] resize-none"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        placeholder="Edit caption... use @ to tag players" />
      {mentionQuery !== null && (
        <MentionDropdown query={mentionQuery} players={players}
          onSelect={(p) => insertMention(p.name)} onSelectAll={() => insertMention('Everyone')} position={mentionPos} />
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-[var(--dim)]">
          <kbd className="px-1 py-0.5 rounded text-[10px] bg-[var(--hover-bg)]">⌘↵</kbd> save · <kbd className="px-1 py-0.5 rounded text-[10px] bg-[var(--hover-bg)]">Esc</kbd> cancel
        </p>
        <div className="flex gap-1.5">
          <button onClick={onCancel} className="px-2.5 py-1 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--hover-bg)]" style={{ color: 'var(--muted)' }}>Cancel</button>
          <button onClick={() => onSave(text.trim())} className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-white cursor-pointer" style={{ background: 'var(--orange)' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Post Card ── */
export default function GalleryPostCard({
  post, tags, comments, likes, reactions, players,
}: {
  post: GalleryPostType;
  tags: GalleryTag[];
  comments: GalleryComment[];
  likes: GalleryLike[];
  reactions: CommentReaction[];
  players: CricketPlayer[];
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
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const isOwn = user?.id === post.user_id;
  const isLiked = likes.some((l) => l.user_id === user?.id);
  const likeCount = likes.length;
  const commentCount = comments.length;

  const authorPlayer = players.find((p) => p.email && p.name === post.posted_by);
  const visibleComments = showAllComments ? comments : comments.slice(-2);

  const handleLike = () => { if (user) toggleGalleryLike(post.id, user.id); };

  const handleComment = () => {
    if (!user || !commentText.trim()) return;
    const userEmail = user.email?.toLowerCase();
    const myPlayer = players.find((p) => p.is_active && p.email?.toLowerCase() === userEmail);
    const commentBy = myPlayer?.name ?? user.user_metadata?.full_name ?? user.email ?? 'Unknown';
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

  return (
    <>
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}>
        {/* Author header */}
        <div className="flex items-center gap-2.5 px-4 py-3">
          <Avatar player={authorPlayer} name={post.posted_by ?? 'U'} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-[var(--text)] truncate tracking-[-0.01em]">{post.posted_by}</p>
            <p className="text-[12px] text-[var(--dim)]">{timeAgo(post.created_at)}</p>
          </div>
          {isOwn && !editing && (
            <button ref={menuBtnRef} onClick={() => setShowMenu(true)}
              className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] cursor-pointer" title="More options">
              <MdMoreVert size={20} style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>

        {showMenu && <PostMenu anchorRef={menuBtnRef} onEdit={() => setEditing(true)} onDelete={() => setShowDeleteConfirm(true)} onClose={() => setShowMenu(false)} />}

        {/* Photo */}
        <div className="w-full cursor-pointer" onClick={() => setFullscreen(true)}>
          <img src={post.photo_url} alt={post.caption ?? 'Gallery photo'}
            className="w-full object-cover" style={{ maxHeight: 340 }} loading="lazy" />
        </div>

        {/* Caption */}
        {editing ? (
          <CaptionEditor initialCaption={captionText} players={players} onSave={handleSaveEdit} onCancel={() => setEditing(false)} />
        ) : post.caption && (
          <div className="px-4 pt-2.5">
            <p className="text-[14px] text-[var(--text)] leading-snug tracking-[-0.01em]">
              <span className="font-bold">{post.posted_by}</span>{' '}
              {expanded || !captionLong
                ? <RichText text={post.caption} players={players} />
                : <><RichText text={post.caption.slice(0, 120)} players={players} /><span>...</span>
                    <button onClick={() => setExpanded(true)} className="ml-1 text-[var(--muted)] font-semibold cursor-pointer">more</button></>
              }
            </p>
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-4 px-4 py-2">
          <button onClick={handleLike} className="flex items-center gap-1.5 cursor-pointer group">
            {isLiked
              ? <MdFavorite size={24} style={{ color: 'var(--red)' }} />
              : <MdFavoriteBorder size={24} className="text-[var(--text)] group-hover:text-[var(--red)] transition-colors" />}
          </button>
          <button onClick={() => setShowAllComments(!showAllComments)} className="flex items-center gap-1.5 cursor-pointer group">
            <MdChatBubbleOutline size={22} className="text-[var(--text)] group-hover:text-[var(--blue)] transition-colors" />
          </button>
        </div>
        {/* Like count */}
        {likeCount > 0 && (
          <p className="px-4 text-[13px] font-bold text-[var(--text)] tracking-[-0.01em]">
            {likeCount} {likeCount === 1 ? 'like' : 'likes'}
          </p>
        )}

        {/* Comments */}
        {comments.length > 0 && (
          <div className="px-4 pb-2">
            {comments.length > 2 && !showAllComments && (
              <button onClick={() => setShowAllComments(true)}
                className="text-[13px] font-semibold mb-2 cursor-pointer"
                style={{ color: 'var(--blue)' }}>
                View all {comments.length} comments
              </button>
            )}
            <div className="space-y-0.5">
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
                      style={{ background: 'var(--surface)', border: '1px solid var(--orange)', color: 'var(--text)' }} />
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => { if (editCommentText.trim()) { updateGalleryComment(c.id, editCommentText.trim()); setEditingCommentId(null); } }}
                        className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white cursor-pointer"
                        style={{ background: 'var(--orange)' }}>Save</button>
                      <button onClick={() => setEditingCommentId(null)}
                        className="text-[11px] font-medium cursor-pointer" style={{ color: 'var(--muted)' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={c.id} className="py-2">
                    <p className="text-[14px] text-[var(--text)] leading-snug tracking-[-0.01em]">
                      <span className="font-bold">{c.comment_by}</span>{'  '}{c.text}
                    </p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-[12px] font-medium text-[var(--dim)]">{timeAgo(c.created_at)}</span>
                      <CommentLike commentId={c.id} reactions={reactions} userId={user?.id} />
                      {c.user_id === user?.id && (
                        <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.text); }}
                          className="text-[12px] font-bold cursor-pointer" style={{ color: 'var(--muted)' }}>Edit</button>
                      )}
                      {canModify && (
                        <button onClick={() => deleteGalleryComment(c.id)}
                          className="text-[12px] font-bold cursor-pointer" style={{ color: 'var(--muted)' }}>Delete</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Comment input */}
        <div className="flex items-center gap-2 px-4 py-3 mt-1 border-t border-[var(--border)]">
          <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={handleKeyDown} placeholder="Add a comment..." maxLength={300}
            className="flex-1 text-[14px] bg-transparent outline-none tracking-[-0.01em]" style={{ color: 'var(--text)' }} />
          <button onClick={handleComment} disabled={!commentText.trim()}
            className="text-[14px] font-bold cursor-pointer disabled:opacity-30 disabled:cursor-default transition-opacity"
            style={{ color: 'var(--blue)' }}>
            Post
          </button>
        </div>
      </div>

      {fullscreen && <FullscreenViewer src={post.photo_url} caption={post.caption} players={players} onClose={() => setFullscreen(false)} />}
      {showDeleteConfirm && <ConfirmDelete onConfirm={() => { deleteGalleryPost(post.id); setShowDeleteConfirm(false); }} onCancel={() => setShowDeleteConfirm(false)} />}
    </>
  );
}
