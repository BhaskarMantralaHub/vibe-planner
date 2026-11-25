'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronsRight } from 'lucide-react';

/**
 * SlideToConfirm — a drag-to-commit control for irreversible actions.
 *
 * A tap is too easy to land by accident on the one action that cannot be
 * undone, so confirming takes a deliberate full-width drag instead: pull
 * the thumb to the end of the track and the action fires once. Let go
 * early and it springs back with nothing done. The component is controlled
 * by gesture only — it holds no state after firing, so the parent closes
 * or swaps UI in its onConfirm handler.
 *
 * Accessibility: the thumb is a real button. Keyboard users focus it and
 * press Enter/Space to confirm (the drag is the pointer path, not the
 * only path), and the label says so for assistive tech. Under
 * prefers-reduced-motion the spring-back transition is removed.
 *
 * Theming: destructive by default (var(--red)); pass `tone="accent"` for
 * a non-destructive commit (var(--blue)).
 */
export interface SlideToConfirmProps {
  /** Text shown in the track before the drag, e.g. "Slide to delete forever". */
  label: string;
  /** Fired exactly once when the thumb reaches the end (or via keyboard). */
  onConfirm: () => void;
  tone?: 'danger' | 'accent';
  disabled?: boolean;
}

const THUMB = 44; // px — matches the app's 44px minimum touch target
const PAD = 4; // px — track inner padding around the thumb
const THRESHOLD = 0.92; // fraction of travel that counts as "at the end"

export function SlideToConfirm({ label, onConfirm, tone = 'danger', disabled = false }: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; max: number } | null>(null);
  const firedRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const color = tone === 'danger' ? 'var(--red)' : 'var(--blue)';

  const fire = useCallback(() => {
    if (firedRef.current || disabled) return;
    firedRef.current = true;
    setConfirmed(true);
    try { navigator.vibrate?.(10); } catch { /* haptics are a nicety, never a blocker */ }
    onConfirm();
  }, [disabled, onConfirm]);

  // A fresh mount per dialog open is the norm, but if the parent keeps the
  // component mounted across uses, re-arm when it becomes enabled again.
  useEffect(() => {
    if (!disabled) {
      firedRef.current = false;
      setConfirmed(false);
      setOffset(0);
    }
  }, [disabled]);

  const maxTravel = () => {
    const w = trackRef.current?.clientWidth ?? 0;
    return Math.max(0, w - THUMB - PAD * 2);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || firedRef.current) return;
    // Capture on the button itself (currentTarget), not e.target: the
    // pointer may land on the icon inside the thumb, and capture must
    // belong to the element the move/up handlers are attached to.
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startX: e.clientX - offset, max: maxTravel() };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const next = Math.min(d.max, Math.max(0, e.clientX - d.startX));
    setOffset(next);
    if (d.max > 0 && next / d.max >= THRESHOLD) {
      drag.current = null;
      setDragging(false);
      setOffset(d.max);
      fire();
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || e.pointerId !== drag.current.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (!firedRef.current) setOffset(0); // spring back — nothing happened
  };

  const progress = (() => {
    const max = maxTravel();
    return max > 0 ? offset / max : 0;
  })();

  return (
    <div
      ref={trackRef}
      className="relative h-[52px] w-full select-none overflow-hidden rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, touchAction: 'none' }}
      aria-disabled={disabled || undefined}
    >
      {/* Fill that follows the thumb */}
      <div
        className="slide-confirm-fill absolute inset-y-0 left-0"
        style={{
          width: offset + THUMB + PAD,
          background: `color-mix(in srgb, ${color} 28%, transparent)`,
          transition: dragging ? 'none' : 'width 0.25s cubic-bezier(0.2, 0.8, 0.3, 1)',
        }}
      />
      {/* Track label — centred in the space right of the thumb (the left
          padding reserves the thumb's home position, so the thumb never
          covers the first letter at rest), and fades as the drag
          progresses so it never fights the thumb. */}
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium"
        style={{
          color,
          opacity: confirmed ? 0 : 1 - progress * 1.4,
          paddingLeft: THUMB + PAD * 2,
          paddingRight: PAD * 2,
        }}
      >
        {label}
      </span>
      {/* Thumb */}
      <button
        type="button"
        aria-label={`${label}. Slide, or press Enter, to confirm.`}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fire();
          }
        }}
        className="slide-confirm-thumb absolute top-1 flex items-center justify-center rounded-full text-white shadow-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50"
        style={{
          left: PAD,
          width: THUMB,
          height: THUMB,
          background: color,
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.3, 1)',
          cursor: disabled ? 'not-allowed' : 'grab',
          touchAction: 'none',
        }}
      >
        {confirmed ? <Check size={20} /> : <ChevronsRight size={20} />}
      </button>
    </div>
  );
}
