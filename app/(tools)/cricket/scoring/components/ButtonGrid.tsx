'use client';

import { Text } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ButtonGridProps {
  onScore: (type: string, value?: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onEndMatch?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

/**
 * Premium cricket scoring pad — dark elevated card with
 * circular run buttons, gradient boundary pills, dramatic
 * wicket bar, and compact extras row.
 */
function ButtonGrid({ onScore, onUndo, onRedo, onEndMatch, canUndo = false, canRedo = false }: ButtonGridProps) {
  return (
    <div
      className="mx-4 rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--cricket) 8%, var(--surface)), var(--surface))',
        border: '1px solid color-mix(in srgb, var(--cricket) 15%, var(--border))',
      }}
    >
      {/* ── Run Buttons: circular, like cricket balls ── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-center gap-4">
          {/* Dot ball — muted */}
          <button
            onClick={() => onScore('runs', 0)}
            className={cn(
              'flex items-center justify-center rounded-full cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.88]',
              'border-2 border-[var(--border)]',
            )}
            style={{
              width: 48, height: 48,
              background: 'var(--card)',
            }}
          >
            <span className="text-[22px] leading-none font-bold tabular-nums" style={{ color: 'var(--muted)' }}>
              ·
            </span>
          </button>

          {/* 1, 2, 3 — themed circles */}
          {[1, 2, 3].map((v) => (
            <button
              key={v}
              onClick={() => onScore('runs', v)}
              className={cn(
                'flex items-center justify-center rounded-full cursor-pointer select-none',
                'transition-all duration-150 active:scale-[0.88]',
                'border-2',
              )}
              style={{
                width: 48, height: 48,
                background: 'color-mix(in srgb, var(--cricket) 10%, var(--card))',
                borderColor: 'color-mix(in srgb, var(--cricket) 30%, transparent)',
              }}
            >
              <span className="text-[18px] leading-none font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                {v}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Boundary Row: FOUR + SIX ── */}
      <div className="px-4 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {/* FOUR */}
          <button
            onClick={() => onScore('runs', 4)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-xl cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
            )}
            style={{
              height: 48,
              background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
              boxShadow: '0 3px 12px color-mix(in srgb, var(--cricket) 25%, transparent)',
            }}
          >
            <span className="text-[20px] leading-none font-extrabold tabular-nums text-white">4</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">FOUR</span>
          </button>

          {/* SIX */}
          <button
            onClick={() => onScore('runs', 6)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-xl cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
            )}
            style={{
              height: 48,
              background: 'linear-gradient(135deg, var(--green, #15803D), color-mix(in srgb, var(--green, #22C55E) 80%, white))',
              boxShadow: '0 3px 12px color-mix(in srgb, var(--green, #22C55E) 25%, transparent)',
            }}
          >
            <span className="text-[20px] leading-none font-extrabold tabular-nums text-white">6</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">SIX</span>
          </button>
        </div>
      </div>

      {/* ── WICKET — dramatic full-width ── */}
      <div className="px-4 pb-2">
        <button
          onClick={() => onScore('wicket')}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl cursor-pointer select-none',
            'transition-all duration-150 active:scale-[0.95]',
          )}
          style={{
            height: 48,
            background: 'linear-gradient(135deg, var(--red, #B91C1C), color-mix(in srgb, var(--red, #EF4444) 80%, white))',
            boxShadow: '0 3px 12px color-mix(in srgb, var(--red, #EF4444) 25%, transparent)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="opacity-80">
            <rect x="5" y="3" width="2" height="18" rx="1" fill="white" />
            <rect x="11" y="3" width="2" height="18" rx="1" fill="white" />
            <rect x="17" y="3" width="2" height="18" rx="1" fill="white" />
            <rect x="4" y="5" width="16" height="2" rx="1" fill="white" opacity="0.6" />
          </svg>
          <span className="text-[14px] font-bold uppercase tracking-[0.08em] text-white">
            Wicket
          </span>
        </button>
      </div>

      {/* ── Extras + Actions ── */}
      <div
        className="px-4 pt-2 pb-2 flex flex-col gap-1.5"
        style={{ borderTop: '1px solid color-mix(in srgb, var(--cricket) 10%, var(--border))' }}
      >
        {/* Extras row */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onScore('wide')}
            className={cn(
              'flex-1 flex items-center justify-center rounded-lg cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
              'border border-amber-500/50 bg-amber-500/10',
            )}
            style={{ height: 40 }}
          >
            <span className="text-[11px] font-semibold text-amber-500">Wide</span>
          </button>
          <button
            onClick={() => onScore('noball')}
            className={cn(
              'flex-1 flex items-center justify-center rounded-lg cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
              'border border-amber-500/50 bg-amber-500/10',
            )}
            style={{ height: 40 }}
          >
            <span className="text-[11px] font-semibold text-amber-500">No Ball</span>
          </button>
          <button
            onClick={() => onScore('bye')}
            className={cn(
              'flex-1 flex items-center justify-center rounded-lg cursor-pointer select-none',
              'transition-all duration-150 active:scale-[0.92]',
              'border border-amber-500/50 bg-amber-500/10',
            )}
            style={{ height: 40 }}
          >
            <span className="text-[11px] font-semibold text-amber-500">Bye/LB</span>
          </button>
        </div>

        {/* Undo / Redo / End row */}
        <div className="flex items-center gap-1.5">
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 rounded-lg cursor-pointer select-none',
                'transition-all duration-150 active:scale-[0.92]',
                'border border-[var(--border)] bg-[var(--card)]',
                !canUndo && 'opacity-30 cursor-not-allowed active:scale-100',
              )}
              style={{ height: 40 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
                <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
              <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Undo</span>
            </button>
          )}
          {onRedo && (
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 rounded-lg cursor-pointer select-none',
                'transition-all duration-150 active:scale-[0.92]',
                'border border-[var(--border)] bg-[var(--card)]',
                !canRedo && 'opacity-30 cursor-not-allowed active:scale-100',
              )}
              style={{ height: 40 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
                <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
              </svg>
              <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Redo</span>
            </button>
          )}
          {onEndMatch && (
            <button
              onClick={onEndMatch}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 rounded-lg cursor-pointer select-none',
                'transition-all duration-150 active:scale-[0.92]',
                'border border-[var(--red)]/40 bg-[var(--red)]/8',
              )}
              style={{ height: 40 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--red)]">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span className="text-[11px] font-medium" style={{ color: 'var(--red)' }}>End</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { ButtonGrid };
export type { ButtonGridProps };
