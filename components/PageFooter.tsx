'use client';

import { Text } from '@/components/ui';
import { cn } from '@/lib/utils';

interface PageFooterProps {
  className?: string;
}

function PageFooter({ className }: PageFooterProps) {
  return (
    <footer className={cn('mt-12 mb-6 text-center', className)}>
      <Text as="p" size="2xs" color="dim" tracking="wide">
        &copy; Designed by <Text weight="semibold" color="muted">Bhaskar Mantrala</Text>
      </Text>
    </footer>
  );
}

export { PageFooter };
