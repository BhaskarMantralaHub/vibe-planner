'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

interface RoleGateProps {
  allowed: string[];
  feature?: string;
  children: React.ReactNode;
}

export function RoleGate({ allowed, feature, children }: RoleGateProps) {
  const { user, loading, userAccess, userFeatures, isCloud } = useAuthStore();
  const router = useRouter();

  const hasRole = userAccess.some((a) => allowed.includes(a)) || userAccess.includes('admin');
  const hasFeature = !feature || userFeatures.includes(feature);
  const hasPermission = !isCloud || (hasRole && hasFeature);

  useEffect(() => {
    if (loading || !isCloud || !user) return;
    if (!hasPermission) {
      // Redirect to role-appropriate home
      if (userFeatures.includes('cricket')) {
        router.replace('/cricket');
      } else if (userFeatures.includes('vibe-planner')) {
        router.replace('/vibe-planner');
      } else if (userAccess.includes('cricket')) {
        router.replace('/cricket');
      } else {
        router.replace('/vibe-planner');
      }
    }
  }, [loading, isCloud, user, hasPermission, userAccess, userFeatures, router]);

  if (loading) return null;
  if (!isCloud) return <>{children}</>;
  if (!hasPermission) return null;

  return <>{children}</>;
}
