'use client';

import { Text } from '@/components/ui';
import { cn } from '@/lib/utils';

interface ButtonGridProps {
  onScore: (type: string, value?: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onEndMatch?: () => void;
  onRetire?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

/**
 * Premium cricket scoring pad — compact layout optimized for
 * keeping scoreboard visible above the fold. Larger touch targets,
 * stronger visual hierarchy between primary (runs) and secondary (extras/actions).
 */
function ButtonGrid({ onScore, onUndo, onRedo, onEndMatch, onRetire, canUndo = false, canRedo = false }: ButtonGridProps) {
  return (
    <div
      className="mx-4 rounded-2xl overflow-hidden"
      style={{
        background: 'var(--card)',
        border: '1px solid color-mix(in srgb, var(--cricket) 12%, var(--border))',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06), inset 0 1px 0 0 var(--inner-glow)',
      }}
    >
      {/* ── Primary: Runs + Boundaries (2 rows) ── */}
      <div className="px-3 pt-3 pb-2">
        {/* Row 1: dot + 1 + 2 + 3 — all equal width */}
        <div className="grid grid-cols-4 gap-2 mb-2">
          {/* Dot */}
          <button
            onClick={() => onScore('runs', 0)}
            className="flex items-center justify-center rounded-xl cursor-pointer select-none transition-all duration-150 active:scale-[0.88]"
            style={{
              height: 52,
              background: 'color-mix(in srgb, var(--border) 30%, var(--surface))',
              border: '1.5px solid var(--border)',
            }}
          >
            <span className="text-[24px] leading-none font-bold" style={{ color: 'var(--muted)' }}>·</span>
          </button>

          {/* 1, 2, 3 */}
          {[1, 2, 3].map((v) => (
            <button
              key={v}
              onClick={() => onScore('runs', v)}
              className="flex items-center justify-center rounded-xl cursor-pointer select-none transition-all duration-150 active:scale-[0.88]"
              style={{
                height: 52,
                background: 'color-mix(in srgb, var(--cricket) 8%, var(--surface))',
                border: '1.5px solid color-mix(in srgb, var(--cricket) 25%, var(--border))',
              }}
            >
              <span className="text-[22px] leading-none font-bold tabular-nums" style={{ color: 'var(--text)' }}>{v}</span>
            </button>
          ))}
        </div>

        {/* Row 2: FOUR + SIX — full width gradient pills */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={() => onScore('runs', 4)}
            className="flex items-center justify-center gap-2 rounded-xl cursor-pointer select-none transition-all duration-150 active:scale-[0.92]"
            style={{
              height: 50,
              background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
              boxShadow: '0 3px 12px color-mix(in srgb, var(--cricket) 30%, transparent)',
            }}
          >
            <span className="text-[22px] leading-none font-extrabold tabular-nums text-white">4</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">FOUR</span>
          </button>

          <button
            onClick={() => onScore('runs', 6)}
            className="flex items-center justify-center gap-2 rounded-xl cursor-pointer select-none transition-all duration-150 active:scale-[0.92]"
            style={{
              height: 50,
              background: 'linear-gradient(135deg, var(--green-deep), var(--green))',
              boxShadow: '0 3px 12px color-mix(in srgb, var(--green) 30%, transparent)',
            }}
          >
            <span className="text-[22px] leading-none font-extrabold tabular-nums text-white">6</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">SIX</span>
          </button>
        </div>

        {/* Row 3: WICKET — dramatic full-width */}
        <button
          onClick={() => onScore('wicket')}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl cursor-pointer select-none transition-all duration-150 active:scale-[0.95]"
          style={{
            height: 50,
            background: 'linear-gradient(135deg, var(--red-deep), var(--red))',
            boxShadow: '0 3px 12px color-mix(in srgb, var(--red) 30%, transparent)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-80">
            <rect x="5" y="3" width="2" height="18" rx="1" fill="white" />
            <rect x="11" y="3" width="2" height="18" rx="1" fill="white" />
            <rect x="17" y="3" width="2" height="18" rx="1" fill="white" />
            <rect x="4" y="5" width="16" height="2" rx="1" fill="white" opacity="0.6" />
          </svg>
          <span className="text-[15px] font-bold uppercase tracking-[0.06em] text-white">Wicket</span>
        </button>
      </div>

      {/* ── Secondary: Extras + Actions (compact) ── */}
      <div
        className="px-3 pt-2 pb-2.5"
        style={{ borderTop: '1px solid color-mix(in srgb, var(--cricket) 8%, var(--border))' }}
      >
        {/* Extras: Wide / No Ball / Bye — single compact row */}
        <div className="grid grid-cols-3 gap-1.5 mb-1.5">
          {(['wide', 'noball', 'bye'] as const).map((type) => (
            <button
              key={type}
              onClick={() => onScore(type)}
              className="flex items-center justify-center rounded-lg cursor-pointer select-none transition-all duration-150 active:scale-[0.92]"
              style={{
                height: 36,
                background: 'color-mix(in srgb, var(--orange) 8%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--orange) 25%, var(--border))',
              }}
            >
              <span className="text-[11px] font-semibold" style={{ color: 'var(--orange)' }}>
                {type === 'noball' ? 'No Ball' : type === 'wide' ? 'Wide' : 'Bye'}
              </span>
            </button>
          ))}
        </div>

        {/* Actions: Retire / Undo / Redo / End — compact row */}
        <div className="grid grid-cols-4 gap-1.5">
          {onRetire && (
            <button
              onClick={onRetire}
              className="flex items-center justify-center gap-1 rounded-lg cursor-pointer select-none transition-all duration-150 active:scale-[0.92]"
              style={{
                height: 36,
                background: 'color-mix(in srgb, #14B8A6 8%, var(--surface))',
                border: '1px solid color-mix(in srgb, #14B8A6 25%, var(--border))',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="text-[10px] font-semibold" style={{ color: '#14B8A6' }}>Retire</span>
            </button>
          )}
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={cn(
                'flex items-center justify-center gap-1 rounded-lg cursor-pointer select-none transition-all duration-150 active:scale-[0.92]',
                !canUndo && 'opacity-30 cursor-not-allowed active:scale-100',
              )}
              style={{
                height: 36,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
                <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
              <span className="text-[10px] font-medium" style={{ color: 'var(--muted)' }}>Undo</span>
            </button>
          )}
          {onRedo && (
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={cn(
                'flex items-center justify-center gap-1 rounded-lg cursor-pointer select-none transition-all duration-150 active:scale-[0.92]',
                !canRedo && 'opacity-30 cursor-not-allowed active:scale-100',
              )}
              style={{
                height: 36,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
                <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
              </svg>
              <span className="text-[10px] font-medium" style={{ color: 'var(--muted)' }}>Redo</span>
            </button>
          )}
          {onEndMatch && (
            <button
              onClick={onEndMatch}
              className="flex items-center justify-center gap-1 rounded-lg cursor-pointer select-none transition-all duration-150 active:scale-[0.92]"
              style={{
                height: 36,
                background: 'color-mix(in srgb, var(--red) 8%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--red) 25%, var(--border))',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--red)">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--red)' }}>End</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { ButtonGrid };
export type { ButtonGridProps };
