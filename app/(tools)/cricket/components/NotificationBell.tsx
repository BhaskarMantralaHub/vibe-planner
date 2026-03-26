'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { useCricketStore } from '@/stores/cricket-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { MdNotifications } from 'react-icons/md';

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

export default function NotificationBell() {
  const { notifications, clearNotifications } = useCricketStore();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markOneRead = (notifId: string) => {
    useCricketStore.setState({
      notifications: useCricketStore.getState().notifications.map((n) =>
        n.id === notifId ? { ...n, is_read: true } : n,
      ),
    });
    const supabase = getSupabaseClient();
    supabase?.from('cricket_notifications').update({ is_read: true }).eq('id', notifId).then(() => {});
  };

  const handleNotificationClick = (notifId: string, postId: string) => {
    setOpen(false);
    markOneRead(notifId);
    if (pathname === '/cricket') {
      window.location.hash = 'gallery';
      window.dispatchEvent(new CustomEvent('gallery-scroll-to', { detail: postId }));
    } else {
      router.push('/cricket#gallery');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('gallery-scroll-to', { detail: postId }));
      }, 500);
    }
  };

  const handleClear = () => {
    clearNotifications();
    setOpen(false);
  };

  const handleOpen = () => {
    if (open) { setOpen(false); return; }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="relative p-2 rounded-xl hover:bg-[var(--hover-bg)] cursor-pointer transition-colors"
        title="Notifications"
      >
        <MdNotifications size={20} style={{ color: unreadCount > 0 ? 'var(--cricket)' : 'var(--muted)' }} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold text-white px-0.5" style={{ background: 'var(--red)' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[98]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[99] w-[300px] max-h-[400px] rounded-2xl overflow-hidden shadow-2xl"
            style={{ top: pos.top, right: pos.right, background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h4 className="text-[14px] font-bold text-[var(--text)]">Notifications</h4>
              {notifications.length > 0 && (
                <button onClick={handleClear}
                  className="text-[11px] font-semibold cursor-pointer" style={{ color: 'var(--red)' }}>
                  Clear all
                </button>
              )}
            </div>
            <div className="overflow-y-auto max-h-[340px]">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[13px] text-[var(--muted)]">All caught up!</p>
                </div>
              ) : (
                notifications.slice(0, 30).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n.id, n.post_id)}
                    className="w-full flex items-start gap-2.5 px-4 py-3 text-left cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                    style={{ background: n.is_read ? 'transparent' : 'color-mix(in srgb, var(--cricket) 6%, transparent)' }}
                  >
                    <div className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: n.is_read ? 'transparent' : 'var(--cricket)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[var(--text)] leading-snug">{n.message}</p>
                      <p className="text-[11px] text-[var(--dim)] mt-0.5">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
