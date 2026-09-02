'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Text, Button, Input, Card, Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody, Spinner } from '@/components/ui';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, Copy, Link, Users, Pencil, Camera, Share2, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/// Compress logo image to fit within max dimensions (keeps aspect ratio)
async function compressLogo(file: File, maxSize = 512): Promise<Blob> {
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  await new Promise((resolve) => { img.onload = resolve; });
  const canvas = document.createElement('canvas');
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png', 0.9));
}

interface Team {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  logo_url: string | null;
  owner_id: string;
  created_at: string;
  member_count?: number;
}

/** The one live invite for a team — token plus when it stops working. */
interface TeamInvite {
  token: string;
  expiresAt: string;
}

const COLOR_PRESETS = [
  { name: 'Ocean', hex: '#0369a1' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Sunset', hex: '#ea580c' },
  { name: 'Royal', hex: '#7c3aed' },
  { name: 'Cherry', hex: '#dc2626' },
  { name: 'Gold', hex: '#ca8a04' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Rose', hex: '#e11d48' },
];

export default function TeamManager() {
  const { user } = useAuthStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamInviteTokens, setTeamInviteTokens] = useState<Record<string, TeamInvite>>({});
  const [busyTeam, setBusyTeam] = useState<string | null>(null);
  // Refresh and Revoke both break links already sent out, so each confirms.
  const [inviteConfirm, setInviteConfirm] = useState<{ team: Team; action: 'refresh' | 'revoke' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newColor, setNewColor] = useState('#0369a1');
  const [creating, setCreating] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editLogoPreview, setEditLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const loadTeams = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = await supabase
      .from('cricket_teams')
      .select('*')
      .is('deleted_at', null)
      .order('created_at');

    if (data) {
      // Count roster players (not team_members — players is what users expect)
      const { data: players } = await supabase
        .from('cricket_players')
        .select('team_id')
        .eq('is_active', true);

      const counts = new Map<string, number>();
      players?.forEach((p: { team_id: string }) => {
        counts.set(p.team_id, (counts.get(p.team_id) || 0) + 1);
      });

      const teamList = data.map((t: Team) => ({ ...t, member_count: counts.get(t.id) || 0 }));
      setTeams(teamList);
      setLoading(false);

      // Load invite tokens in parallel (READ-ONLY — the old code silently
      // INSERTED a permanent, unlimited-use invite as a side effect of
      // rendering this tab; invite creation is now the explicit
      // generateInvite action below, with a real expiry).
      const tokenResults = await Promise.all(
        teamList.map(async (t: Team) => {
          const { data: inv } = await supabase
            .from('team_invites')
            .select('token, expires_at')
            .eq('team_id', t.id)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return inv ? { id: t.id, invite: { token: inv.token, expiresAt: inv.expires_at } } : null;
        })
      );

      const tokens: Record<string, TeamInvite> = {};
      tokenResults.forEach(r => { if (r) tokens[r.id] = r.invite; });
      setTeamInviteTokens(tokens);
    } else {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  const createTeam = async () => {
    if (!newName.trim() || !newSlug.trim()) { toast.error('Team name and slug are required'); return; }
    setCreating(true);
    const supabase = getSupabaseClient();
    if (!supabase) { setCreating(false); return; }
    const { error } = await supabase.rpc('create_team', { p_name: newName.trim(), p_slug: newSlug.trim().toLowerCase(), p_primary_color: newColor });
    if (error) { toast.error(error.message); }
    else { toast.success(`Team "${newName}" created`); setNewName(''); setNewSlug(''); setNewColor('#0369a1'); setShowCreateForm(false); loadTeams(); useAuthStore.getState().loadUserTeams(); }
    setCreating(false);
  };

  const startEditTeam = (team: Team) => {
    setEditName(team.name);
    setEditSlug(team.slug);
    setEditColor(team.primary_color);
    setEditLogoFile(null);
    setEditLogoPreview(team.logo_url);
    setEditingTeam(team);
  };

  const saveTeamSettings = async () => {
    if (!editingTeam) return;
    setSaving(true);
    const supabase = getSupabaseClient();
    if (!supabase) { setSaving(false); return; }

    const updates: Record<string, unknown> = {
      name: editName.trim(),
      slug: editSlug.trim().toLowerCase(),
      primary_color: editColor,
    };

    // Upload logo if changed
    if (editLogoFile) {
      try {
        const compressed = await compressLogo(editLogoFile);
        const path = `${editingTeam.id}/logo.png`;
        const { error: uploadErr } = await supabase.storage.from('team-logos').upload(path, compressed, { upsert: true, contentType: 'image/png' });
        if (uploadErr) {
          console.error('[team] logo upload error:', uploadErr);
          toast.error(`Logo upload failed: ${uploadErr.message}`);
        } else {
          const { data: { publicUrl } } = supabase.storage.from('team-logos').getPublicUrl(path);
          updates.logo_url = publicUrl;
        }
      } catch (err) {
        console.error('[team] logo upload exception:', err);
        toast.error('Logo upload failed');
      }
    }

    const { error } = await supabase.from('cricket_teams').update(updates).eq('id', editingTeam.id);
    if (error) { toast.error(error.message); }
    else { toast.success('Team settings saved'); setEditingTeam(null); loadTeams(); useAuthStore.getState().loadUserTeams(); }
    setSaving(false);
  };

  /**
   * Explicit invite management. Generating deactivates any previous link
   * (one live link per team keeps "who can join" auditable) and issues a
   * fresh 30-day token; Revoke kills the live link without a replacement.
   */
  /**
   * Invite lifecycle. Both actions are server-authoritative RPCs
   * (docs/invite-lifecycle-migration.sql): they verify the caller is an admin
   * OF THIS TEAM, and the 30-day expiry lives on the server — the client
   * cannot write team_invites at all any more, which is what stopped a
   * permanent 2099 token from being mintable.
   */
  const generateInvite = async (teamId: string, isRefresh = false) => {
    const supabase = getSupabaseClient();
    if (!supabase || busyTeam) return;
    setBusyTeam(teamId);
    const { data, error } = await supabase.rpc('generate_team_invite', { p_team_id: teamId });
    setBusyTeam(null);
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? 'Could not create the invite link');
      return;
    }
    setTeamInviteTokens((prev) => ({ ...prev, [teamId]: { token: data.token, expiresAt: data.expires_at } }));
    toast.success(isRefresh ? 'New link created — the old one no longer works' : 'Invite link created, valid 30 days');
  };

  const revokeInvite = async (teamId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || busyTeam) return;
    setBusyTeam(teamId);
    const { data, error } = await supabase.rpc('revoke_team_invite', { p_team_id: teamId });
    setBusyTeam(null);
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? 'Could not revoke the invite link');
      return;
    }
    setTeamInviteTokens((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    toast.success('Invite link revoked');
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/cricket?join=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
  };

  const shareInviteLink = async (token: string, teamName: string) => {
    const url = `${window.location.origin}/cricket?join=${token}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Join ${teamName}`, text: `You're invited to join ${teamName}!`, url }); return; } catch { /* cancelled */ }
    }
    navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
  };

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
          <Plus size={16} className="mr-1" /> New Team
        </Button>
      </div>

      {/* Team cards */}
      {teams.map((team) => (
        <Card key={team.id} padding="none" className="overflow-hidden">
          {/* Color banner */}
          <div className="h-2 w-full" style={{ background: team.primary_color }} />

          <div className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {/* Team logo or initial */}
                {team.logo_url ? (
                  <img src={team.logo_url} alt={team.name} className="w-11 h-11 rounded-xl object-cover" />
                ) : (
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-[16px] shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${team.primary_color}, ${team.primary_color}cc)` }}>
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <Text size="md" weight="bold">{team.name}</Text>
                  <Text size="2xs" color="muted" className="font-mono">/{team.slug}</Text>
                </div>
              </div>
            </div>

            {/* Stats + actions */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Users size={14} className="text-[var(--muted)]" />
                  <Text size="xs" weight="medium">{team.member_count}</Text>
                  <Text size="2xs" color="muted">players</Text>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => startEditTeam(team)}>
                <Pencil size={16} />
              </Button>
            </div>

            {/* Team invite — one live link per team, 30-day expiry, rotated
                and revoked through server RPCs. Nothing here is created by
                merely rendering the page. */}
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Link size={13} className="text-[var(--dim)]" />
                <Text size="2xs" weight="bold" uppercase tracking="wider" color="dim">Team invite</Text>
              </div>

              {teamInviteTokens[team.id] ? (
                <div
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--green)' }} />
                    <Text size="xs" weight="semibold" style={{ color: 'var(--green)' }}>Active</Text>
                    <Text size="2xs" color="muted" className="truncate">
                      Expires {new Date(teamInviteTokens[team.id].expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </div>
                  {/* Days remaining, not just a date — a link about to die is
                      the thing an admin needs to notice before a teammate
                      does. Turns orange in the last week. */}
                  {(() => {
                    const days = Math.max(0, Math.ceil(
                      (new Date(teamInviteTokens[team.id].expiresAt).getTime() - Date.now()) / 86_400_000));
                    const soon = days <= 7;
                    return (
                      <Text as="p" size="2xs" className="mb-2"
                        style={{ color: soon ? 'var(--orange)' : 'var(--dim)' }}>
                        {days === 0
                          ? 'Expires today — refresh it to keep people joining'
                          : `${days} ${days === 1 ? 'day' : 'days'} left${soon ? ' — refresh it soon' : ''}`}
                      </Text>
                    );
                  })()}
                  <Text size="2xs" color="dim" className="font-mono truncate block mb-2.5">
                    /cricket?join={teamInviteTokens[team.id].token.slice(0, 8)}…
                  </Text>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" brand="cricket"
                      onClick={() => copyInviteLink(teamInviteTokens[team.id].token)}>
                      <Copy size={13} className="mr-1.5" /> Copy link
                    </Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => shareInviteLink(teamInviteTokens[team.id].token, team.name)}>
                      <Share2 size={13} className="mr-1.5" /> Share
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyTeam === team.id}
                      onClick={() => setInviteConfirm({ team, action: 'refresh' })}>
                      <RefreshCw size={13} className="mr-1.5" /> Refresh
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyTeam === team.id}
                      onClick={() => setInviteConfirm({ team, action: 'revoke' })}>
                      <X size={13} className="mr-1.5" style={{ color: 'var(--red)' }} />
                      <span style={{ color: 'var(--red)' }}>Revoke</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <Text as="p" size="xs" color="muted" className="mb-2.5">
                    No active invite. Nobody can join this team with a link right now.
                  </Text>
                  <Button size="sm" variant="primary" brand="cricket" disabled={busyTeam === team.id}
                    onClick={() => generateInvite(team.id)}>
                    <Link size={13} className="mr-1.5" />
                    {busyTeam === team.id ? 'Creating…' : 'Generate invite'}
                  </Button>
                </div>
              )}
            </div>

          </div>
        </Card>
      ))}

      {teams.length === 0 && (
        <Text size="sm" color="muted" className="text-center py-8">No teams yet</Text>
      )}

      {/* Refresh / revoke both break links already sent to people, so each
          says exactly what will happen before it happens. */}
      {inviteConfirm && (
        <Dialog open onOpenChange={(o) => { if (!o) setInviteConfirm(null); }}>
          <DialogContent className="max-w-xs" showClose={false}>
            <DialogTitle className="text-[15px]">
              {inviteConfirm.action === 'refresh' ? 'Create a new invite link?' : 'Revoke the invite link?'}
            </DialogTitle>
            <DialogDescription className="text-[13px] mt-1.5">
              {inviteConfirm.action === 'refresh'
                ? `The current link for ${inviteConfirm.team.name} stops working immediately. Anyone still using it will need the new one.`
                : `The current link for ${inviteConfirm.team.name} stops working immediately and no new link is created. Nobody can join by link until you generate one.`}
            </DialogDescription>
            <DialogFooter>
              <Button variant="secondary" size="md" onClick={() => setInviteConfirm(null)}>Cancel</Button>
              <Button
                variant={inviteConfirm.action === 'revoke' ? 'danger' : 'primary'}
                brand={inviteConfirm.action === 'refresh' ? 'cricket' : undefined}
                size="md"
                onClick={() => {
                  const { team, action } = inviteConfirm;
                  setInviteConfirm(null);
                  if (action === 'refresh') void generateInvite(team.id, true);
                  else void revokeInvite(team.id);
                }}
              >
                {inviteConfirm.action === 'refresh' ? 'Create new link' : 'Revoke'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Create Team Drawer ── */}
      <Drawer open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DrawerHandle />
        <DrawerHeader><DrawerTitle>Create New Team</DrawerTitle></DrawerHeader>
        <DrawerBody>
          <div className="space-y-4 pb-6">
            <Input label="Team Name" value={newName} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Bay Area Warriors" />
            <Input label="URL Slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="e.g. bay-area-warriors" />

            {/* Color presets */}
            <div>
              <Text size="xs" weight="medium" className="mb-2">Team Color</Text>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {COLOR_PRESETS.map((c) => (
                  <button key={c.hex} onClick={() => setNewColor(c.hex)}
                    className={`h-10 rounded-xl cursor-pointer transition-all ${newColor === c.hex ? 'ring-2 ring-offset-2 ring-offset-[var(--card)] ring-[var(--text)] scale-105' : 'ring-1 ring-[var(--border)] hover:scale-105'}`}
                    style={{ background: c.hex }} title={c.name} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--border)] shrink-0" />
                <Text size="2xs" color="muted">Custom: {newColor}</Text>
              </div>
            </div>

            {/* Live preview */}
            {newName.trim() && (
              <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                <Text size="2xs" color="dim" className="uppercase tracking-wider mb-2">Preview</Text>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm"
                    style={{ background: newColor }}>{newName.charAt(0).toUpperCase()}</div>
                  <div>
                    <Text size="sm" weight="semibold">{newName}</Text>
                    <Text size="2xs" color="muted" className="font-mono">/{newSlug || '...'}</Text>
                  </div>
                </div>
              </div>
            )}

            <Button onClick={createTeam} disabled={creating || !newName.trim() || !newSlug.trim()} className="w-full" variant="primary" brand="cricket">
              {creating ? <Spinner size="sm" /> : 'Create Team'}
            </Button>
          </div>
        </DrawerBody>
      </Drawer>

      {/* ── Edit Team Drawer ── */}
      <Drawer open={!!editingTeam} onOpenChange={() => setEditingTeam(null)}>
        <DrawerHandle />
        <DrawerHeader><DrawerTitle>Team Settings</DrawerTitle></DrawerHeader>
        <DrawerBody>
          {editingTeam && (
            <div className="space-y-4 pb-6">
              {/* Logo */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="relative w-20 h-20 rounded-2xl overflow-hidden cursor-pointer group border-2"
                  onClick={() => logoInputRef.current?.click()}
                  style={{ borderColor: editColor + '40' }}
                >
                  {editLogoPreview ? (
                    <img src={editLogoPreview} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white"
                      style={{ background: `linear-gradient(135deg, ${editColor}, ${editColor}cc)` }}>
                      <Text size="2xl" weight="bold">{editName.charAt(0).toUpperCase()}</Text>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={24} className="text-white" />
                  </div>
                </div>
                <Text size="2xs" color="dim">Tap to change logo</Text>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { setEditLogoFile(file); setEditLogoPreview(URL.createObjectURL(file)); }
                    e.target.value = '';
                  }} />
              </div>

              {/* Name */}
              <Input label="Team Name" value={editName} onChange={(e) => setEditName(e.target.value)} />

              {/* Slug */}
              <Input label="URL Slug" value={editSlug} onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />

              {/* Color presets */}
              <div>
                <Text size="xs" weight="medium" className="mb-2">Team Color</Text>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {COLOR_PRESETS.map((c) => (
                    <button key={c.hex} onClick={() => setEditColor(c.hex)}
                      className={`h-10 rounded-xl cursor-pointer transition-all ${editColor === c.hex ? 'ring-2 ring-offset-2 ring-offset-[var(--card)] ring-[var(--text)] scale-105' : 'ring-1 ring-[var(--border)] hover:scale-105'}`}
                      style={{ background: c.hex }} title={c.name} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-[var(--border)] shrink-0" />
                  <Text size="2xs" color="muted">Custom: {editColor}</Text>
                </div>
              </div>

              {/* Preview */}
              <div className="p-3 rounded-xl border border-[var(--border)]">
                <Text size="2xs" color="dim" className="uppercase tracking-wider mb-2">Preview</Text>
                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                  <div className="h-2 w-full" style={{ background: editColor }} />
                  <div className="flex items-center gap-3 p-3">
                    {editLogoPreview ? (
                      <img src={editLogoPreview} alt="Logo" className="w-10 h-10 rounded-xl object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-sm"
                        style={{ background: editColor }}>{editName.charAt(0).toUpperCase()}</div>
                    )}
                    <div>
                      <Text size="sm" weight="semibold">{editName}</Text>
                      <Text size="2xs" color="muted" className="font-mono">/{editSlug}</Text>
                    </div>
                  </div>
                </div>
              </div>

              <Button onClick={saveTeamSettings} disabled={saving || !editName.trim()} className="w-full" variant="primary" brand="cricket" loading={saving}>
                Save Settings
              </Button>
            </div>
          )}
        </DrawerBody>
      </Drawer>

    </div>
  );
}
