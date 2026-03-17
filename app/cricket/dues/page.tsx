'use client';

import { useEffect, useState } from 'react';

export default function PublicDuesPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Sunrisers Manteca - Team Dues';
    // Extract token from URL path: /cricket/dues/<token>
    const segments = window.location.pathname.split('/').filter(Boolean);
    // Expected: ['cricket', 'dues', '<token>']
    if (segments.length >= 3) {
      setToken(segments[2]);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Cricket branding */}
        <div className="mb-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FBBF24] to-[#F87171] text-3xl">
            🏏
          </div>
        </div>

        <h1 className="mb-2 text-[24px] font-bold text-[#E5E7EB]">
          Sunrisers Manteca
        </h1>
        <h2 className="mb-6 text-[16px] text-[#9CA3AF]">
          Team Dues
        </h2>

        <div className="rounded-2xl border border-[#3A3F6B] bg-[#1C1F3F] p-6">
          <div className="mb-4 text-4xl">🚧</div>
          <p className="mb-2 text-[16px] font-semibold text-[#E5E7EB]">
            Public dues page - Coming soon
          </p>
          <p className="mb-4 text-[14px] text-[#9CA3AF]">
            This page will show team dues and balances without requiring a login.
          </p>
          {token && (
            <div className="rounded-xl border border-[#3A3F6B] bg-[#141428] px-4 py-3">
              <p className="text-[12px] text-[#6B7280] mb-1">Share Token</p>
              <p className="text-[13px] text-[#9CA3AF] font-mono break-all">{token}</p>
            </div>
          )}
        </div>

        <p className="mt-6 text-[12px] text-[#6B7280]">
          Powered by Viber&apos;s Toolkit
        </p>
      </div>
    </div>
  );
}
