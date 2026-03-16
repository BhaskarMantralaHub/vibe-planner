'use client';

import { useEffect } from 'react';
import { AuthGate } from '@/components/AuthGate';

function CricketContent() {
  useEffect(() => {
    document.title = 'Sunrisers Manteca';
  }, []);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-4 text-5xl">🏏</div>
        <h2 className="mb-2 text-2xl font-bold text-[var(--text)]">Sunrisers Manteca</h2>
        <p className="text-[var(--muted)]">Cricket Team Dashboard — Coming Soon</p>
      </div>
    </div>
  );
}

export default function CricketPage() {
  return (
    <AuthGate variant="cricket">
      <CricketContent />
    </AuthGate>
  );
}
