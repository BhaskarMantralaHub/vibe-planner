'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Text, Button, Input, Card, Badge, Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody, Spinner } from '@/components/ui';
import { MdAdd, MdContentCopy, MdLink, MdPeople, MdRefresh } from 'react-icons/md';
import { toast } from 'sonner';

interface Team {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  owner_id: string;
  created_at: string;
  member_count?: number;
}

interface Invite {
  id: string;
  token: string;
  expires_at: string;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_at: string;
}

export default function TeamManager() {
  const { user } = useAuthStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Record<string, Invite[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInvites, setShowInvites] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newColor, setNewColor] = useState('#0369a1');
  const [creating, setCreating] = useState(false);

  const loadTeams = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from('cricket_teams')
      .select('*')
      .is('deleted_at', null)
      .order('created_at');

    if (data) {
      // Get member counts
      const { data: members } = await supabase
        .from('team_members')
        .select('team_id');

      const counts = new Map<string, number>();
      members?.forEach((m: { team_id: string }) => {
        counts.set(m.team_id, (counts.get(m.team_id) || 0) + 1);
      });

      setTeams(data.map((t: Team) => ({ ...t, member_count: counts.get(t.id) || 0 })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  const loadInvites = async (teamId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from('team_invites')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (data) {
      setInvites(prev => ({ ...prev, [teamId]: data as Invite[] }));
    }
  };

  const createTeam = async () => {
    if (!newName.trim() || !newSlug.trim()) {
      toast.error('Team name and slug are required');
      return;
    }
    setCreating(true);
    const supabase = getSupabaseClient();
    if (!supabase) { setCreating(false); return; }

    const { data, error } = await supabase.rpc('create_team', {
      p_name: newName.trim(),
      p_slug: newSlug.trim().toLowerCase(),
      p_primary_color: newColor,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Team "${newName}" created`);
      setNewName('');
      setNewSlug('');
      setNewColor('#0369a1');
      setShowCreateForm(false);
      loadTeams();
      // Reload user teams in auth store
      useAuthStore.getState().loadUserTeams();
    }
    setCreating(false);
  };

  const generateInvite = async (teamId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;

    const { error } = await supabase.from('team_invites').insert({
      team_id: teamId,
      created_by: user.id,
    });

    if (error) {
      toast.error('Failed to generate invite');
    } else {
      toast.success('Invite link generated');
      loadInvites(teamId);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/cricket?join=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Invite link copied to clipboard');
  };

  const deactivateInvite = async (inviteId: string, teamId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase.from('team_invites').update({ is_active: false }).eq('id', inviteId);
    toast.success('Invite deactivated');
    loadInvites(teamId);
  };

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setNewName(name);
    setNewSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  };

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Text size="lg" weight="bold">Teams</Text>
        <Button size="sm" onClick={() => setShowCreateForm(true)}>
          <MdAdd size={16} className="mr-1" /> New Team
        </Button>
      </div>

      {/* Team list */}
      {teams.map((team) => (
        <Card key={team.id} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                style={{ background: team.primary_color }}
              >
                {team.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <Text size="sm" weight="semibold">{team.name}</Text>
                <Text size="2xs" color="muted">/{team.slug}</Text>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="muted">
                <MdPeople size={12} className="mr-1" /> {team.member_count}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowInvites(team.id);
                  loadInvites(team.id);
                }}
              >
                <MdLink size={16} />
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {teams.length === 0 && (
        <Text size="sm" color="muted" className="text-center py-8">No teams yet</Text>
      )}

      {/* Create Team Drawer */}
      <Drawer open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DrawerHandle />
        <DrawerHeader>
          <DrawerTitle>Create New Team</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <div className="space-y-4 pb-6">
            <Input
              label="Team Name"
              value={newName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Bay Area Warriors"
            />
            <Input
              label="URL Slug"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. bay-area-warriors"
            />
            <div>
              <Text size="xs" weight="medium" className="mb-1.5">Team Color</Text>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-[var(--border)]"
                />
                <Text size="xs" color="muted">{newColor}</Text>
              </div>
            </div>
            <Button onClick={createTeam} disabled={creating || !newName.trim() || !newSlug.trim()} className="w-full">
              {creating ? <Spinner size="sm" /> : 'Create Team'}
            </Button>
          </div>
        </DrawerBody>
      </Drawer>

      {/* Invite Links Drawer */}
      <Drawer open={!!showInvites} onOpenChange={() => setShowInvites(null)}>
        <DrawerHandle />
        <DrawerHeader>
          <div className="flex items-center justify-between w-full">
            <DrawerTitle>Invite Links</DrawerTitle>
            <Button size="sm" onClick={() => showInvites && generateInvite(showInvites)}>
              <MdAdd size={16} className="mr-1" /> New Link
            </Button>
          </div>
        </DrawerHeader>
        <DrawerBody>
          <div className="space-y-3 pb-6">
            {showInvites && (invites[showInvites] ?? []).map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const exhausted = inv.max_uses !== null && inv.use_count >= inv.max_uses;
              const active = inv.is_active && !expired && !exhausted;

              return (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                  <div>
                    <Text size="2xs" color="muted" className="font-mono">{inv.token.slice(0, 8)}...</Text>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Text size="2xs" color="muted">{inv.use_count} uses</Text>
                      {active ? (
                        <Badge variant="muted" className="text-green-500 border-green-500/30">Active</Badge>
                      ) : (
                        <Badge variant="muted" className="text-red-400 border-red-400/30">{expired ? 'Expired' : exhausted ? 'Exhausted' : 'Inactive'}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {active && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => copyInviteLink(inv.token)}>
                          <MdContentCopy size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => showInvites && deactivateInvite(inv.id, showInvites)}>
                          <Text size="2xs" color="muted">Revoke</Text>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {showInvites && (!invites[showInvites] || invites[showInvites].length === 0) && (
              <Text size="sm" color="muted" className="text-center py-4">No invite links yet. Generate one to share.</Text>
            )}
          </div>
        </DrawerBody>
      </Drawer>
    </div>
  );
}
