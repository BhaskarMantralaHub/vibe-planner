'use client';

import { Text } from '@/components/ui';

interface FreeHitBannerProps {
  visible: boolean;
}

function FreeHitBanner({ visible }: FreeHitBannerProps) {
  if (!visible) return null;

  return (
    <div
      className="mx-4 px-3 py-2 rounded-xl flex items-center justify-center gap-2"
      style={{
        background: 'color-mix(in srgb, var(--cricket) 8%, var(--surface))',
        border: '1px solid color-mix(in srgb, var(--cricket) 25%, transparent)',
      }}
    >
      <Text size="xs" weight="bold" color="cricket">FREE HIT</Text>
      <Text size="xs" weight="medium" color="muted">—</Text>
      <Text size="xs" weight="medium" color="muted">Only Run Out dismissal</Text>
    </div>
  );
}

export { FreeHitBanner };
export type { FreeHitBannerProps };
