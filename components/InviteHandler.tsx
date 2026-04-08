'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Text, Button, Spinner, Card } from '@/components/ui';
import { MdCheck, MdGroupAdd } from 'react-icons/md';
import { toast } from 'sonner';

/// Handles `?join=<token>` invite links on the cricket page.
/// If user is logged in, auto-accepts the invite and adds them to the team.
/// If not logged in, stores the token for after login.

const PENDING_INVITE_KEY = 'vibe_pending_invite';

export function savePendingInvite(token: string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(PENDING_INVITE_KEY, token);
  }
}

export function getPendingInvite(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(PENDING_INVITE_KEY);
}

export function clearPendingInvite() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  }
}

export default function InviteHandler() {
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const [processing, setProcessing] = useState(false);
  const [teamInfo, setTeamInfo] = useState<{ team_name: string; team_slug: string } | null>(null);
  const [joined, setJoined] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [error, setError] = useState('');

  const joinToken = searchParams.get('join') || getPendingInvite();

  useEffect(() => {
    if (!joinToken) return;

    // If not logged in, save for after login
    if (!user) {
      savePendingInvite(joinToken);
      return;
    }

    // Validate the token first
    const supabase = getSupabaseClient();
    if (!supabase) return;

    (async () => {
      const { data } = await supabase.rpc('validate_invite_token', { p_token: joinToken });
      if (!data || data.error) {
        setError('This invite link is invalid or has expired.');
        clearPendingInvite();
        return;
      }

      // Check if already a member of this team
      const { data: membership } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', data.team_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membership) {
        // Already a member — clear invite and clean URL
        clearPendingInvite();
        const url = new URL(window.location.href);
        url.searchParams.delete('join');
        window.history.replaceState({}, '', url.pathname + url.search);
        return; // Don't show join prompt
      }

      setTeamInfo(data);
    })();
  }, [joinToken, user]);

  const handleAccept = async () => {
    if (!joinToken) return;
    setProcessing(true);

    const supabase = getSupabaseClient();
    if (!supabase) { setProcessing(false); return; }

    const { data, error: rpcError } = await supabase.rpc('accept_invite', { p_token: joinToken });

    if (rpcError || data?.error) {
      setError(rpcError?.message || data?.error || 'Failed to join team');
      setProcessing(false);
      return;
    }

    clearPendingInvite();
    setProcessing(false);

    // Remove ?join= from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState({}, '', url.pathname + url.search);

    if (data.pending_approval) {
      // Unknown player — needs admin approval
      setPendingApproval(true);
      toast('Request sent to team admin for approval');
    } else {
      // Pre-added or existing player — auto-approved
      setJoined(true);
      toast.success(`Welcome to ${data.team_name}!`);
      await useAuthStore.getState().loadUserTeams();
      setTimeout(() => window.location.reload(), 1500);
    }
  };

  // No invite token in URL
  if (!joinToken) return null;

  // Error state
  if (error) {
    return (
      <Card className="mx-4 my-4 p-6 text-center">
        <Text size="sm" color="muted">{error}</Text>
      </Card>
    );
  }

  // Pending approval
  if (pendingApproval) {
    return (
      <Card className="mx-4 my-4 p-6 text-center">
        <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--orange) 12%, transparent)' }}>
          <Text size="xl">⏳</Text>
        </div>
        <Text size="sm" weight="semibold">Request sent</Text>
        <Text size="xs" color="muted" className="mt-1">
          The team admin has been notified. You'll get access once they approve your request.
        </Text>
      </Card>
    );
  }

  // Already joined
  if (joined) {
    return (
      <Card className="mx-4 my-4 p-6 text-center">
        <MdCheck size={32} className="mx-auto mb-2 text-green-500" />
        <Text size="sm" weight="semibold">You've joined the team!</Text>
        <Text size="xs" color="muted">Reloading...</Text>
      </Card>
    );
  }

  // Team info loaded, show accept prompt
  if (teamInfo && user) {
    return (
      <Card className="mx-4 my-4 p-6">
        <div className="flex flex-col items-center gap-3">
          <MdGroupAdd size={36} className="text-[var(--cricket)]" />
          <Text size="md" weight="bold">Join {teamInfo.team_name}?</Text>
          <Text size="xs" color="muted" className="text-center">
            You've been invited to join this cricket team.
          </Text>
          <Button onClick={handleAccept} disabled={processing} className="w-full mt-2">
            {processing ? <Spinner size="sm" /> : 'Join Team'}
          </Button>
        </div>
      </Card>
    );
  }

  // Loading state
  if (joinToken && user) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return null;
}
