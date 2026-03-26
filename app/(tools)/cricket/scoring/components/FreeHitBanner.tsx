'use client';

import { Text } from '@/components/ui';

interface FreeHitBannerProps {
  visible: boolean;
}

function FreeHitBanner({ visible }: FreeHitBannerProps) {
  if (!visible) return null;

  return (
    <div
      className="mx-4 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 animate-free-hit-pulse"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.1))',
        border: '1px solid rgba(245,158,11,0.4)',
      }}
    >
      <span className="text-[16px]" aria-hidden>
        &#x26A1;
      </span>
      <Text size="sm" weight="semibold" className="text-amber-400">
        FREE HIT — Batsman can only be out: Run Out
      </Text>

      {/* Pulsing glow animation via inline style tag (scoped) */}
      <style>{`
        @keyframes freeHitPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(245,158,11,0.2); }
          50% { box-shadow: 0 0 20px rgba(245,158,11,0.4); }
        }
        .animate-free-hit-pulse {
          animation: freeHitPulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export { FreeHitBanner };
export type { FreeHitBannerProps };
