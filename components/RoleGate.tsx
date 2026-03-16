'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

interface RoleGateProps {
  allowed: string[];
  children: React.ReactNode;
}

export function RoleGate({ allowed, children }: RoleGateProps) {
  const { user, loading, userAccess, isCloud } = useAuthStore();
  const router = useRouter();

  const hasPermission = !isCloud || userAccess.some((a) => allowed.includes(a)) || userAccess.includes('admin');

  useEffect(() => {
    if (loading || !isCloud || !user) return;
    if (!hasPermission) {
      // Redirect to role-appropriate home
      if (userAccess.includes('cricket')) {
        router.replace('/cricket');
      } else {
        router.replace('/vibe-planner');
      }
    }
  }, [loading, isCloud, user, hasPermission, userAccess, router]);

  if (loading) return null;
  if (!isCloud) return <>{children}</>;
  if (!hasPermission) return null;

  return <>{children}</>;
}
