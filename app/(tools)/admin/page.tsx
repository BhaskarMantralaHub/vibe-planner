'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  Search, Users, Shield, ShieldCheck, UserX, AlertTriangle, Ban,
  MoreVertical, Crown, ShieldOff, UserCheck, Lock,
  Activity, CheckCircle, Zap, BarChart3, Settings2, UsersRound
} from 'lucide-react';
import TeamManager from '@/components/TeamManager';
import { AuthGate } from '@/components/AuthGate';
import { Text, Drawer, DrawerHandle, DrawerHeader, DrawerBody, DrawerTitle } from '@/components/ui';
import { toast } from 'sonner';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  disabled: boolean;
  created_at: string;
  access: string[];
  features: string[];
}

interface UserStats {
  user_id: string;
  total: number;
  active: number;
  done: number;
  deleted: number;
}

interface UserActivity {
  user_id: string;
  last_login: string | null;
  last_seen: string | null;
  login_count: number;
  page_views_30d: number;
}

type AdminTab = 'users' | 'analytics' | 'teams';

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

const SUPER_ADMIN = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || '';

function getSuspiciousFlags(profile: Profile): string[] {
  const flags: string[] = [];
  const name = (profile.full_name || '').toLowerCase();
  const email = (profile.email || '').toLowerCase();

  // No name provided
  if (!profile.full_name || profile.full_name.trim().length < 2) flags.push('No name');

  // Disposable email domains
  const disposable = ['tempmail', 'guerrilla', 'mailinator', 'throwaway', 'yopmail', 'sharklasers', 'trashmail', 'fakeinbox', '10minute', 'temp-mail'];
  if (disposable.some(d => email.includes(d))) flags.push('Disposable email');

  // Random-looking name (no vowels, too short, all same char)
  if (name.length >= 2 && !/[aeiou]/i.test(name)) flags.push('Unusual name');
  if (/(.)\1{3,}/.test(name)) flags.push('Repeated chars');

  // Email doesn't match common providers and has numbers
  const trustedDomains = ['gmail.com', 'yahoo.com', 'yahoo.in', 'outlook.com', 'hotmail.com', 'icloud.com', 'protonmail.com', 'proton.me', 'aol.com', 'zoho.com', 'zoho.in', 'live.com', 'rediffmail.com'];
  const emailDomain = email.split('@')[1] || '';
  const isTrusted = trustedDomains.includes(emailDomain);
  if (!isTrusted && /\d{4,}/.test(email)) flags.push('Suspicious email');

  // Name contains special characters or numbers
  if (/[0-9<>{}[\]|\\]/.test(profile.full_name || '')) flags.push('Name has numbers/symbols');

  // Very long name (possible injection attempt)
  if ((profile.full_name || '').length > 50) flags.push('Unusually long name');

  return flags;
}

function AdminContent() {
  const { user } = useAuthStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<UserStats[]>([]);
  const [activity, setActivity] = useState<UserActivity[]>([]);
  const [pageStats, setPageStats] = useState<{ path: string; count: number }[]>([]);
  const [allSeasons, setAllSeasons] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<'all' | 'admin' | 'user' | 'flagged' | 'disabled'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 5;
  const [maxUsers, setMaxUsers] = useState(15);
  const [editingMaxUsers, setEditingMaxUsers] = useState(false);
  const [maxUsersInput, setMaxUsersInput] = useState('15');
  const [featureDrawerProfile, setFeatureDrawerProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'analytics' || hash === 'teams') return hash as AdminTab;
    }
    return 'users';
  });

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    (async () => {
      // Check if current user is admin
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!myProfile?.is_admin) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(true);

      // Fetch all profiles
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      // Fetch cricket player names (source of truth — admin can update these)
      // Overlay onto profiles so admin page shows up-to-date names
      const { data: players } = await supabase
        .from('cricket_players')
        .select('user_id, name')
        .not('user_id', 'is', null);

      const playerNameMap = new Map<string, string>();
      players?.forEach((p: { user_id: string; name: string }) => {
        playerNameMap.set(p.user_id, p.name);
      });

      const merged = (allProfiles || []).map((p: Profile) => {
        const playerName = playerNameMap.get(p.id);
        return playerName ? { ...p, full_name: playerName } : p;
      });

      setProfiles(merged);

      // Fetch vibe stats per user
      const { data: vibes } = await supabase
        .from('vibes')
        .select('user_id, status, deleted_at');

      if (vibes) {
        const userMap = new Map<string, UserStats>();
        vibes.forEach((v: { user_id: string; status: string; deleted_at: string | null }) => {
          if (!userMap.has(v.user_id)) {
            userMap.set(v.user_id, { user_id: v.user_id, total: 0, active: 0, done: 0, deleted: 0 });
          }
          const s = userMap.get(v.user_id)!;
          s.total++;
          if (v.deleted_at) s.deleted++;
          else if (v.status === 'done') s.done++;
          else s.active++;
        });
        setStats(Array.from(userMap.values()));
      }

      // Fetch user activity
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: activityData } = await supabase
        .from('user_activity')
        .select('user_id, activity_type, page_path, created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false });

      if (activityData) {
        const actMap = new Map<string, UserActivity>();
        const pageMap = new Map<string, number>();
        activityData.forEach((a: { user_id: string; activity_type: string; page_path: string | null; created_at: string }) => {
          // Count page visits
          if (a.activity_type === 'page_view' && a.page_path) {
            pageMap.set(a.page_path, (pageMap.get(a.page_path) || 0) + 1);
          }
          if (!actMap.has(a.user_id)) {
            actMap.set(a.user_id, { user_id: a.user_id, last_login: null, last_seen: null, login_count: 0, page_views_30d: 0 });
          }
          const u = actMap.get(a.user_id)!;
          if (a.activity_type === 'login') {
            u.login_count++;
            if (!u.last_login || a.created_at > u.last_login) u.last_login = a.created_at;
          }
          if (!u.last_seen || a.created_at > u.last_seen) u.last_seen = a.created_at;
          if (a.activity_type === 'page_view') u.page_views_30d++;
        });
        setActivity(Array.from(actMap.values()));
        setPageStats(
          Array.from(pageMap.entries())
            .map(([path, count]) => ({ path, count }))
            .sort((a, b) => b.count - a.count)
        );
      }

      // Fetch seasons for active season management
      const { data: seasonData } = await supabase
        .from('cricket_seasons')
        .select('id, name, is_active')
        .order('year', { ascending: false });
      if (seasonData) setAllSeasons(seasonData);

      // Fetch max_users setting
      const { data: setting } = await supabase.from('app_settings').select('value').eq('key', 'max_users').single();
      if (setting?.value) {
        setMaxUsers(parseInt(setting.value, 10));
        setMaxUsersInput(setting.value);
      }

      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--toolkit)] border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <Text as="h2" size="xl" weight="bold" className="mb-2">Access Denied</Text>
          <Text as="p" size="lg" color="muted">Admin access required.</Text>
        </div>
      </div>
    );
  }

  const toggleAdmin = async (profileId: string, currentStatus: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Only super admin can manage roles
    if (user?.email !== SUPER_ADMIN) return;

    // Don't let admin remove their own admin
    if (profileId === user?.id) return;

    // Super admin cannot be revoked
    const target = profiles.find(p => p.id === profileId);
    if (target?.email === SUPER_ADMIN) return;

    // Can't make disabled user an admin
    if (target?.disabled && !currentStatus) return;

    // Sync both is_admin boolean AND 'admin' in access array (cricket checks access array)
    const currentAccess: string[] = target?.access ?? [];
    const newAccess = !currentStatus
      ? [...new Set([...currentAccess, 'admin'])]
      : currentAccess.filter((a) => a !== 'admin');

    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !currentStatus, access: newAccess })
      .eq('id', profileId);

    if (!error) {
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_admin: !currentStatus, access: newAccess } : p));
    }
  };

  const isSuperAdmin = user?.email === SUPER_ADMIN;
  const activeProfiles = profiles.filter(p => !p.disabled);
  const totalUsers = profiles.length;
  const disabledCount = profiles.filter(p => p.disabled).length;
  const adminCount = profiles.filter(p => p.is_admin && !p.disabled).length;
  const totalVibes = stats.reduce((sum, s) => sum + s.total, 0);
  const totalActive = stats.reduce((sum, s) => sum + s.active, 0);
  const totalDone = stats.reduce((sum, s) => sum + s.done, 0);

  const saveMaxUsers = async () => {
    const val = parseInt(maxUsersInput, 10);
    if (isNaN(val) || val < 1) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from('app_settings').update({ value: String(val) }).eq('key', 'max_users');
    setMaxUsers(val);
    setEditingMaxUsers(false);
  };

  // Tab definitions for bottom bar
  const TABS: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: 'users', label: 'Users', icon: <Users size={20} /> },
    { key: 'analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
    { key: 'teams', label: 'Teams', icon: <UsersRound size={20} /> },
  ];

  // Analytics: users sorted by last_seen
  const analyticsUsers = [...profiles].map((p) => {
    const act = activity.find(a => a.user_id === p.id);
    return { ...p, activity: act || null };
  }).sort((a, b) => {
    // Users with last_seen first (most recent), then never-logged-in at bottom
    if (!a.activity?.last_seen && !b.activity?.last_seen) return 0;
    if (!a.activity?.last_seen) return 1;
    if (!b.activity?.last_seen) return -1;
    return new Date(b.activity.last_seen).getTime() - new Date(a.activity.last_seen).getTime();
  });

  return (
    <div className="relative min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <Text as="h1" size="2xl" weight="bold" className="lg:text-[30px] mb-1">Admin Dashboard</Text>
          <Text as="p" size="lg" color="muted">User management & activity overview</Text>
        </div>

        {/* Stats cards — shown on both tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard label="Users" value={totalUsers} subtext={`/ ${maxUsers} max`} color="var(--toolkit)" icon={Users} />
          <StatCard
            label="Active Today"
            value={activity.filter(a => a.last_seen && new Date(a.last_seen).toDateString() === new Date().toDateString()).length}
            subtext={`of ${totalUsers}`}
            color="var(--green)"
            icon={Zap}
          />
          <StatCard
            label="Active This Week"
            value={activity.filter(a => a.last_seen && Date.now() - new Date(a.last_seen).getTime() < 7 * 86400000).length}
            subtext={`of ${totalUsers}`}
            color="var(--blue)"
            icon={Activity}
          />
          <StatCard
            label="Logins (30d)"
            value={activity.reduce((s, a) => s + a.login_count, 0)}
            color="var(--orange)"
            icon={BarChart3}
          />
        </div>

        {/* ── Users Tab Content ── */}
        {activeTab === 'users' && (
          <>
            {/* User capacity */}
            <div className="mb-8 bg-[var(--surface)] rounded-2xl p-5 border border-[var(--border)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Text as="div" size="sm" color="muted" className="mb-1">User Capacity</Text>
                  <div className="flex items-baseline gap-1">
                    <Text size="2xl" weight="bold" tabular className="text-[28px]" style={{ color: totalUsers >= maxUsers ? 'var(--red)' : totalUsers >= maxUsers * 0.8 ? 'var(--orange)' : 'var(--green)' }}>{totalUsers}</Text>
                    <Text size="lg" color="dim">/ {maxUsers}</Text>
                  </div>
                </div>

                {isSuperAdmin && (
                  editingMaxUsers ? (
                    <div className="flex items-center gap-2 bg-[var(--card)] border border-[var(--border)] rounded-xl p-2">
                      <span className="text-[12px] text-[var(--muted)]">Max</span>
                      <input
                        type="number"
                        value={maxUsersInput}
                        onChange={(e) => setMaxUsersInput(e.target.value)}
                        className="w-14 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[15px] text-[var(--text)] outline-none text-center font-bold"
                        min={1}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveMaxUsers(); if (e.key === 'Escape') setEditingMaxUsers(false); }}
                        autoFocus
                      />
                      <button onClick={saveMaxUsers} className="px-2.5 py-1.5 rounded-lg bg-[var(--green)]/15 text-[var(--green)] text-[13px] font-medium cursor-pointer">Save</button>
                      <button onClick={() => { setEditingMaxUsers(false); setMaxUsersInput(String(maxUsers)); }} className="px-2.5 py-1.5 rounded-lg text-[var(--muted)] text-[13px] cursor-pointer hover:bg-[var(--hover-bg)]">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingMaxUsers(true)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--toolkit)] text-white text-[13px] font-medium cursor-pointer hover:opacity-90 transition-all shadow-sm"
                    >
                      <Zap size={14} />
                      Change Limit
                    </button>
                  )
                )}
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min((totalUsers / maxUsers) * 100, 100)}%`,
                    background: totalUsers >= maxUsers ? 'var(--red)' : totalUsers >= maxUsers * 0.8 ? 'var(--orange)' : 'var(--green)',
                  }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <Text size="2xs" color="dim">{maxUsers - totalUsers} slots remaining</Text>
                <Text size="2xs" color="dim">{Math.round((totalUsers / maxUsers) * 100)}% used</Text>
              </div>
            </div>

            {/* Active Season (super admin only) */}
            {isSuperAdmin && allSeasons.length > 0 && (
              <div className="mb-8 bg-[var(--surface)] rounded-2xl p-5 border border-[var(--border)]">
                <Text as="div" size="sm" color="muted" className="mb-2">Active Season</Text>
                <Text as="div" size="2xs" color="dim" className="mb-3">Used by monthly reports and as default for all users.</Text>
                <div className="flex flex-wrap gap-2">
                  {allSeasons.map((s) => (
                    <button
                      key={s.id}
                      onClick={async () => {
                        const supabase = getSupabaseClient();
                        if (!supabase) return;
                        await supabase.from('cricket_seasons').update({ is_active: false }).neq('id', s.id);
                        await supabase.from('cricket_seasons').update({ is_active: true }).eq('id', s.id);
                        setAllSeasons((prev) => prev.map((x) => ({ ...x, is_active: x.id === s.id })));
                        toast.success(`${s.name} set as active season`);
                      }}
                      className="px-4 py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all active:scale-95"
                      style={s.is_active ? {
                        background: 'var(--cricket)',
                        color: 'white',
                        border: '1.5px solid var(--cricket)',
                      } : {
                        background: 'transparent',
                        color: 'var(--muted)',
                        border: '1.5px solid var(--border)',
                      }}
                    >
                      {s.name} {s.is_active ? '✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Users list */}
            <div className="mb-6">
              <Text as="h2" size="xl" weight="semibold" className="text-[18px] mb-3">Enrolled Users</Text>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--dim)]" size={16} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search by name or email..."
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-2xl pl-10 pr-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus:border-[var(--toolkit)] focus:ring-1 focus:ring-[var(--toolkit)]/30 transition-all"
                />
              </div>

              {/* Filter tabs */}
              <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                {([
                  { key: 'all', label: 'All Users', icon: Users, count: profiles.length, total: maxUsers, color: 'var(--toolkit)' },
                  { key: 'admin', label: 'Admins', icon: ShieldCheck, count: adminCount, total: profiles.length, color: 'var(--toolkit-accent)' },
                  { key: 'user', label: 'Users', icon: UserCheck, count: activeProfiles.length - adminCount, total: profiles.length, color: 'var(--blue)' },
                  { key: 'flagged', label: 'Flagged', icon: AlertTriangle, count: profiles.filter(p => getSuspiciousFlags(p).length > 0).length, total: profiles.length, color: 'var(--orange)' },
                  { key: 'disabled', label: 'Disabled', icon: Ban, count: disabledCount, total: profiles.length, color: 'var(--red)' },
                ] as const).map((f) => {
                  const Icon = f.icon;
                  const isActive = filter === f.key;
                  const pct = f.total > 0 ? (f.count / f.total) * 100 : 0;
                  return (
                    <button
                      key={f.key}
                      onClick={() => { setFilter(f.key as typeof filter); setPage(1); }}
                      className={`relative overflow-hidden rounded-2xl p-3 text-left transition-all cursor-pointer border ${
                        isActive
                          ? 'border-transparent ring-2 shadow-lg'
                          : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--muted)]'
                      }`}
                      style={isActive ? { borderColor: f.color, background: `linear-gradient(135deg, var(--surface), var(--card))` } : undefined}
                    >
                      {/* Progress bar background */}
                      <div
                        className="absolute bottom-0 left-0 h-1 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: f.color, opacity: isActive ? 1 : 0.4 }}
                      />

                      <div className="flex items-center justify-between mb-2">
                        <Icon size={18} style={{ color: f.color }} />
                        <span className="text-[22px] font-bold" style={{ color: isActive ? f.color : 'var(--text)' }}>{f.count}</span>
                      </div>
                      <Text as="div" size="2xs" weight="medium" color="muted">{f.label}</Text>
                    </button>
                  );
                })}
              </div>

              {/* Filtered + paginated list */}
              {(() => {
                const filtered = profiles
                  .filter(p => filter === 'all' ? true : filter === 'admin' ? p.is_admin : filter === 'flagged' ? getSuspiciousFlags(p).length > 0 : filter === 'disabled' ? p.disabled : !p.is_admin && !p.disabled)
                  .filter(p => {
                    if (!search.trim()) return true;
                    const q = search.toLowerCase();
                    return (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
                  });

                const totalPages = Math.ceil(filtered.length / perPage);
                const paginated = filtered.slice((page - 1) * perPage, page * perPage);

                return (
                  <>
              <div className="space-y-3">
                {paginated.length === 0 ? (
                  <Text as="div" size="lg" color="dim" align="center" className="py-8">No users found</Text>
                ) : paginated.map((profile) => {
                  const userStats = stats.find(s => s.user_id === profile.id);
                  const flags = getSuspiciousFlags(profile);
                  return (
                    <div
                      key={profile.id}
                      className={`bg-[var(--surface)] border rounded-2xl p-4 flex flex-wrap items-center gap-3 ${
                        flags.length > 0 ? 'border-[var(--orange)]/40' : 'border-[var(--border)]'
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-[18px] font-bold text-white shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${profile.is_admin ? 'var(--toolkit), var(--toolkit-accent)' : 'var(--blue), var(--green)'})`,
                        }}
                      >
                        {(profile.full_name || profile.email || '?')[0].toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Text size="lg" weight="medium" truncate>
                            {profile.full_name || 'No name'}
                          </Text>
                          {profile.email === SUPER_ADMIN ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gradient-to-r from-[var(--toolkit)] to-[var(--toolkit-accent)] text-white font-semibold shrink-0">
                              SUPER ADMIN
                            </span>
                          ) : profile.is_admin ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--toolkit)]/15 text-[var(--toolkit)] font-semibold shrink-0">
                              ADMIN
                            </span>
                          ) : null}
                          {profile.disabled && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--red)]/15 text-[var(--red)] font-semibold shrink-0">
                              DISABLED
                            </span>
                          )}
                        </div>
                        {/* Feature badges */}
                        {(profile.features?.length > 0) && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {profile.features.includes('vibe-planner') && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--toolkit)]/15 text-[var(--toolkit)] font-semibold">VP</span>
                            )}
                            {profile.features.includes('id-tracker') && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--toolkit)]/15 text-[var(--toolkit)] font-semibold">ID</span>
                            )}
                            {profile.features.includes('cricket') && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--cricket)]/15 text-[var(--cricket)] font-semibold">CR</span>
                            )}
                          </div>
                        )}
                        <Text as="div" size="sm" color="muted" truncate>{profile.email}</Text>
                        <Text as="div" size="xs" color="dim" className="mt-0.5">
                          Joined {fmtDate(profile.created_at)}{(() => {
                            const act = activity.find(a => a.user_id === profile.id);
                            return act?.last_seen ? ` · Last seen ${timeAgo(act.last_seen)}` : ' · Never logged in';
                          })()}
                        </Text>
                        {flags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {flags.map((flag) => (
                              <span key={flag} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--orange)]/15 text-[var(--orange)] font-medium">
                                ⚠ {flag}
                              </span>
                            ))}
                            {isSuperAdmin && profile.email !== SUPER_ADMIN && profile.id !== user?.id && (
                              <>
                                <button
                                  onClick={async () => {
                                    // Accept — clear flag by acknowledging (no action needed, just visual)
                                    setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, full_name: p.full_name || 'Accepted User' } : p));
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--green)]/15 text-[var(--green)] font-medium cursor-pointer hover:bg-[var(--green)]/25 ml-1"
                                >
                                  ✓ Accept
                                </button>
                                <button
                                  onClick={async () => {
                                    const supabase = getSupabaseClient();
                                    if (!supabase) return;
                                    await supabase.from('vibes').delete().eq('user_id', profile.id);
                                    await supabase.from('profiles').delete().eq('id', profile.id);
                                    setProfiles(prev => prev.filter(p => p.id !== profile.id));
                                    setStats(prev => prev.filter(s => s.user_id !== profile.id));
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--red)]/15 text-[var(--red)] font-medium cursor-pointer hover:bg-[var(--red)]/25"
                                >
                                  ✕ Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Activity stats */}
                      <div className="hidden lg:flex items-center gap-3 shrink-0">
                        {userStats ? (
                          <>
                            <MiniStat label="Active" value={userStats.active} color="var(--blue)" />
                            <MiniStat label="Done" value={userStats.done} color="var(--green)" />
                            <MiniStat label="Total" value={userStats.total} color="var(--muted)" />
                          </>
                        ) : (
                          <Text size="sm" color="dim">No activity</Text>
                        )}
                      </div>

                      {/* Actions menu — only super admin can manage users */}
                      {isSuperAdmin && profile.id !== user?.id && profile.email !== SUPER_ADMIN && (
                        <UserMenu
                          profile={profile}
                          onToggleAdmin={() => toggleAdmin(profile.id, profile.is_admin)}
                          onToggleDisable={async () => {
                            const supabase = getSupabaseClient();
                            if (!supabase) return;
                            const newStatus = !profile.disabled;
                            await supabase.from('profiles').update({ disabled: newStatus }).eq('id', profile.id);
                            setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, disabled: newStatus } : p));
                          }}
                          onManageFeatures={() => setFeatureDrawerProfile(profile)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <Text size="sm" color="muted">
                          Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
                        </Text>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 rounded-xl text-[13px] bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-[var(--hover-bg)] transition-colors"
                          >
                            ← Prev
                          </button>
                          {Array.from({ length: totalPages }, (_, i) => (
                            <button
                              key={i}
                              onClick={() => setPage(i + 1)}
                              className={`w-8 h-8 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${
                                page === i + 1
                                  ? 'bg-[var(--toolkit)] text-white'
                                  : 'text-[var(--muted)] hover:bg-[var(--hover-bg)]'
                              }`}
                            >
                              {i + 1}
                            </button>
                          ))}
                          <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 rounded-xl text-[13px] bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed hover:bg-[var(--hover-bg)] transition-colors"
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        )}

        {/* ── Analytics Tab Content ── */}
        {activeTab === 'analytics' && (
          <div className="mb-6">
            <Text as="h2" size="xl" weight="semibold" className="text-[18px] mb-4">Login Activity</Text>

            {/* Table */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center px-4 py-2.5 border-b border-[var(--border)]" style={{ background: 'var(--card)' }}>
                <Text size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="flex-1">User</Text>
                <Text size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="w-14 text-center">Logins</Text>
                <Text size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="w-20 text-right">Last Login</Text>
              </div>

              {/* Rows */}
              {analyticsUsers.map((u, i) => {
                const act = u.activity;
                const hasLogin = !!act?.last_login;
                return (
                  <div
                    key={u.id}
                    className="flex items-center px-4 py-3"
                    style={{ borderBottom: i < analyticsUsers.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 1 ? 'var(--card)' : 'transparent' }}
                  >
                    {/* User */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                        style={{ background: `linear-gradient(135deg, ${u.is_admin ? 'var(--toolkit), var(--toolkit-accent)' : 'var(--blue), var(--green)'})` }}
                      >
                        {(u.full_name || u.email || '?')[0].toUpperCase()}
                      </div>
                      <Text size="sm" weight="medium" truncate>{u.full_name || 'No name'}</Text>
                    </div>

                    {/* Login count */}
                    <Text size="md" weight="bold" tabular className="w-14 text-center" style={{ color: hasLogin ? 'var(--toolkit)' : 'var(--dim)' }}>
                      {act?.login_count || 0}
                    </Text>

                    {/* Last login */}
                    <div className="w-20 text-right">
                      {hasLogin ? (
                        <Text size="xs" color="muted">{timeAgo(act!.last_login!)}</Text>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'color-mix(in srgb, var(--red) 12%, transparent)', color: 'var(--red)' }}>
                          Never
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Top Pages */}
            {pageStats.length > 0 && (
              <div className="mt-6">
                <Text as="h2" size="lg" weight="semibold" className="mb-3">Top Pages (30d)</Text>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                  {pageStats.slice(0, 10).map((p, i) => {
                    const maxCount = pageStats[0]?.count || 1;
                    const pct = Math.round((p.count / maxCount) * 100);
                    return (
                      <div
                        key={p.path}
                        className="flex items-center gap-3 px-4 py-2.5"
                        style={{ borderBottom: i < Math.min(pageStats.length, 10) - 1 ? '1px solid var(--border)' : 'none' }}
                      >
                        <Text size="sm" weight="medium" className="flex-1 min-w-0" truncate>{p.path}</Text>
                        <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--card)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--toolkit)' }} />
                        </div>
                        <Text size="sm" weight="bold" tabular style={{ color: 'var(--toolkit)' }} className="w-10 text-right">{p.count}</Text>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feature Toggle Drawer */}
        <Drawer open={!!featureDrawerProfile} onOpenChange={(open) => { if (!open) setFeatureDrawerProfile(null); }}>
          <DrawerHandle />
          <DrawerHeader>
            <DrawerTitle>Manage Features</DrawerTitle>
            <Text size="sm" color="muted">{featureDrawerProfile?.full_name || featureDrawerProfile?.email}</Text>
          </DrawerHeader>
          <DrawerBody>
            {featureDrawerProfile && (
              <div className="space-y-3 pb-4">
                {FEATURE_TOGGLES.map((ft) => {
                  const enabled = (featureDrawerProfile.features ?? []).includes(ft.key);
                  return (
                    <div key={ft.key} className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                          style={{ background: enabled ? ft.gradient : 'var(--muted)' }}
                        >
                          {ft.icon}
                        </div>
                        <div>
                          <Text size="md" weight="medium">{ft.label}</Text>
                          <Text size="xs" color="muted">{ft.description}</Text>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          const supabase = getSupabaseClient();
                          if (!supabase || !featureDrawerProfile) return;
                          const current = featureDrawerProfile.features ?? [];
                          const updated = enabled
                            ? current.filter((f) => f !== ft.key)
                            : [...current, ft.key];
                          const { error } = await supabase
                            .from('profiles')
                            .update({ features: updated })
                            .eq('id', featureDrawerProfile.id);
                          if (error) {
                            toast.error('Failed to update features');
                            return;
                          }
                          // Update local state
                          setProfiles(prev => prev.map(p =>
                            p.id === featureDrawerProfile.id ? { ...p, features: updated } : p
                          ));
                          setFeatureDrawerProfile(prev => prev ? { ...prev, features: updated } : null);
                          toast.success(`${ft.label} ${enabled ? 'disabled' : 'enabled'}`);
                        }}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          enabled ? 'bg-[var(--toolkit)]' : 'bg-[var(--border)]'
                        }`}
                        style={enabled ? { background: ft.toggleColor } : undefined}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          enabled ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </DrawerBody>
        </Drawer>

        {/* ── Teams Tab Content ── */}
        {activeTab === 'teams' && <TeamManager />}

        {/* Bottom spacer for tab bar */}
        <div className="h-24" />
      </div>

      {/* Bottom tab bar — portaled to body to avoid iOS Safari fixed positioning bugs */}
      {typeof document !== 'undefined' && createPortal(
        <div
          className="fixed left-0 right-0 z-40"
          style={{
            bottom: 0,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            background: 'color-mix(in srgb, var(--card) 85%, transparent)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            boxShadow: '0 -1px 0 0 color-mix(in srgb, var(--border) 40%, transparent), 0 -8px 32px rgba(0,0,0,0.12)',
          }}
        >
          <div className="flex items-center justify-around px-2 pt-1.5 pb-2">
            {TABS.map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setActiveTab(t.key); window.location.hash = t.key; }}
                  className="relative flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 active:scale-90 min-w-[80px] py-1.5 px-3"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {/* Pill background on active */}
                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-2xl"
                      style={{
                        background: 'color-mix(in srgb, var(--toolkit) 15%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--toolkit) 25%, transparent)',
                      }}
                    />
                  )}
                  {/* Icon with glow on active */}
                  <span
                    className="relative z-10 transition-all duration-200"
                    style={{
                      color: isActive ? 'var(--toolkit)' : 'var(--muted)',
                      filter: isActive ? 'drop-shadow(0 0 6px color-mix(in srgb, var(--toolkit) 60%, transparent))' : 'none',
                      transform: isActive ? 'scale(1.15) translateY(-1px)' : 'scale(1)',
                      display: 'flex',
                    }}
                  >
                    {t.icon}
                  </span>
                  {/* Label */}
                  <span
                    className="relative z-10 text-[10px] transition-all duration-200"
                    style={{
                      color: isActive ? 'var(--toolkit)' : 'var(--muted)',
                      fontWeight: isActive ? 700 : 500,
                      letterSpacing: isActive ? '0.03em' : '0.02em',
                    }}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const FEATURE_TOGGLES = [
  {
    key: 'vibe-planner',
    label: 'Vibe Planner',
    description: 'Kanban board for tasks',
    gradient: 'linear-gradient(135deg, var(--toolkit), var(--toolkit-accent))',
    toggleColor: 'var(--toolkit)',
    icon: <span className="text-sm">📋</span>,
  },
  {
    key: 'id-tracker',
    label: 'ID Tracker',
    description: 'Identity document tracker',
    gradient: 'linear-gradient(135deg, var(--toolkit), var(--toolkit-accent))',
    toggleColor: 'var(--toolkit)',
    icon: <span className="text-sm">🪪</span>,
  },
  {
    key: 'cricket',
    label: 'Cricket',
    description: 'Team expenses & scoring',
    gradient: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
    toggleColor: 'var(--cricket)',
    icon: <span className="text-sm">🏏</span>,
  },
];

function StatCard({ label, value, subtext, color, icon: Icon }: { label: string; value: number; subtext?: string; color: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-[var(--muted)]" />
        <Text size="sm" color="muted">{label}</Text>
      </div>
      <Text as="div" size="2xl" weight="bold" tabular className="text-[28px]" style={{ color }}>
        {value}
        {subtext && <Text size="md" color="dim"> {subtext}</Text>}
      </Text>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <Text as="div" size="lg" weight="bold" tabular style={{ color }}>{value}</Text>
      <Text as="div" size="2xs" color="dim" className="text-[10px]">{label}</Text>
    </div>
  );
}

function UserMenu({ profile, onToggleAdmin, onToggleDisable, onManageFeatures }: {
  profile: Profile;
  onToggleAdmin: () => void;
  onToggleDisable: () => void;
  onManageFeatures: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 bg-[var(--card)] border border-[var(--border)] rounded-xl p-1.5 shadow-xl min-w-[180px] animate-[scaleIn_0.15s]">
            {/* Manage Features */}
            <button
              onClick={() => { onManageFeatures(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-[14px] rounded-lg transition-colors cursor-pointer text-[var(--text)] hover:bg-[var(--hover-bg)]"
            >
              <Settings2 size={16} />
              <span>Manage Features</span>
            </button>
            <div className="border-t border-[var(--border)] my-1" />

            {/* Hide Make Admin for disabled users */}
            {!(profile.disabled && !profile.is_admin) && (
              <>
                <button
                  onClick={() => { onToggleAdmin(); setOpen(false); }}
                  className={`flex items-center gap-2 w-full px-3 py-2.5 text-[14px] rounded-lg transition-colors cursor-pointer ${
                    profile.is_admin
                      ? 'text-[var(--red)] hover:bg-[var(--red)]/10'
                      : 'text-[var(--toolkit)] hover:bg-[var(--toolkit)]/10'
                  }`}
                >
                  <span>{profile.is_admin ? '🛡️' : '👑'}</span>
                  <span>{profile.is_admin ? 'Revoke Admin' : 'Make Admin'}</span>
                </button>
                <div className="border-t border-[var(--border)] my-1" />
              </>
            )}

            <button
              onClick={() => { onToggleDisable(); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2.5 text-[14px] rounded-lg transition-colors cursor-pointer ${
                profile.disabled
                  ? 'text-[var(--green)] hover:bg-[var(--green)]/10'
                  : 'text-[var(--red)] hover:bg-[var(--red)]/10'
              }`}
            >
              <span>{profile.disabled ? '✓' : '🚫'}</span>
              <span>{profile.disabled ? 'Enable User' : 'Disable User'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <AuthGate>
      <AdminContent />
    </AuthGate>
  );
}
