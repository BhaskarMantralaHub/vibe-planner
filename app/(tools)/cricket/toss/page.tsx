'use client';

import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { Text } from '@/components/ui';
import { MdSportsCricket } from 'react-icons/md';
import TossWidget from '../components/TossWidget';

export default function TossPage() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <div className="px-4 py-4 space-y-4">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
              <MdSportsCricket size={20} className="text-white" />
            </div>
            <div>
              <Text as="h1" size="lg" weight="bold">Coin Toss</Text>
              <Text as="p" size="2xs" color="muted">Fair, cryptographic coin flip</Text>
            </div>
          </div>

          <TossWidget />
        </div>
      </RoleGate>
    </AuthGate>
  );
}
