'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Text, Button, Input, Card, Badge, Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody, Spinner } from '@/components/ui';
import { MdAdd, MdContentCopy, MdLink, MdPeople, MdEdit, MdCameraAlt, MdShare } from 'react-icons/md';
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

interface Invite {
  id: string;
  token: string;
  expires_at: string;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_at: string;
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
  const [invites, setInvites] = useState<Record<string, Invite[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInvites, setShowInvites] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newColor, setNewColor] = useState('#0369a1');
  const [creating, setCreating] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
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
    const { data } = await supabase.from('team_invites').select('*').eq('team_id', teamId).order('created_at', { ascending: false });
    if (data) setInvites(prev => ({ ...prev, [teamId]: data as Invite[] }));
  };

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

  const generateInvite = async (teamId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;
    const { error } = await supabase.from('team_invites').insert({ team_id: teamId, created_by: user.id });
    if (error) { toast.error('Failed to generate invite'); }
    else { toast.success('Invite link generated'); loadInvites(teamId); }
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

  const deactivateInvite = async (inviteId: string, teamId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from('team_invites').update({ is_active: false }).eq('id', inviteId);
    toast.success('Invite revoked');
    loadInvites(teamId);
  };

  const handleNameChange = (name: string) => {
    setNewName(name);
    setNewSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  };

  const getExpiryText = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
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
                  <MdPeople size={14} className="text-[var(--muted)]" />
                  <Text size="xs" weight="medium">{team.member_count}</Text>
                  <Text size="2xs" color="muted">members</Text>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setShowInvites(team.id); loadInvites(team.id); }}>
                  <MdLink size={16} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => startEditTeam(team)}>
                  <MdEdit size={16} />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}

      {teams.length === 0 && (
        <Text size="sm" color="muted" className="text-center py-8">No teams yet</Text>
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
                    <MdCameraAlt size={24} className="text-white" />
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
                      <Text size="2xs" color="muted" className="font-mono">/{editingTeam.slug}</Text>
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

      {/* ── Invite Links Drawer ── */}
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
          <div className="space-y-2 pb-6">
            {showInvites && (invites[showInvites] ?? []).map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const exhausted = inv.max_uses !== null && inv.use_count >= inv.max_uses;
              const active = inv.is_active && !expired && !exhausted;
              const invTeam = teams.find(t => t.id === showInvites);

              return (
                <div key={inv.id} className={`p-3 rounded-xl border transition-colors ${active ? 'bg-[var(--surface)] border-[var(--border)]' : 'bg-[var(--surface)]/50 border-[var(--border)]/50 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Text size="2xs" className="font-mono text-[var(--muted)]">{inv.token.slice(0, 12)}...</Text>
                    {active ? (
                      <Badge variant="green" size="sm">Active</Badge>
                    ) : (
                      <Badge variant="red" size="sm">{expired ? 'Expired' : exhausted ? 'Full' : 'Revoked'}</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Text size="2xs" color="muted">{inv.use_count} uses</Text>
                      {active && <Text size="2xs" color="muted">{getExpiryText(inv.expires_at)}</Text>}
                    </div>
                    {active && (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => shareInviteLink(inv.token, invTeam?.name ?? 'Team')}>
                          <MdShare size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => copyInviteLink(inv.token)}>
                          <MdContentCopy size={14} />
                        </Button>
                        <button onClick={() => showInvites && deactivateInvite(inv.id, showInvites)}
                          className="text-[11px] text-[var(--red)] font-medium cursor-pointer hover:underline px-1">
                          Revoke
                        </button>
                      </div>
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
