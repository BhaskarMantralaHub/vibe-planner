'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCricketStore } from '@/stores/cricket-store';
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

export default function NotificationBell({ onNavigateToGallery }: { onNavigateToGallery: () => void }) {
  const { notifications, markNotificationsRead } = useCricketStore();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  };

  const handleMarkRead = () => {
    markNotificationsRead();
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="relative p-2 rounded-xl hover:bg-[var(--hover-bg)] cursor-pointer transition-colors"
        title="Notifications"
      >
        <MdNotifications size={22} style={{ color: unreadCount > 0 ? 'var(--orange)' : 'var(--muted)' }} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1" style={{ background: 'var(--red)' }}>
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
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkRead}
                  className="text-[11px] font-medium cursor-pointer"
                  style={{ color: 'var(--orange)' }}
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="overflow-y-auto max-h-[340px]">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[13px] text-[var(--muted)]">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      onNavigateToGallery();
                      setOpen(false);
                    }}
                    className="w-full flex items-start gap-2.5 px-4 py-3 text-left cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                    style={{ background: n.is_read ? 'transparent' : 'var(--hover-bg)' }}
                  >
                    <div className="mt-0.5 w-2 h-2 rounded-full shrink-0" style={{ background: n.is_read ? 'transparent' : 'var(--orange)' }} />
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
