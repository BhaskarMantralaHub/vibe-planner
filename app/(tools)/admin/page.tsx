'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  Search, Users, Shield, ShieldCheck, UserX, AlertTriangle, Ban,
  MoreVertical, Crown, ShieldOff, UserCheck, Lock,
  Activity, CheckCircle, Zap, BarChart3
} from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  disabled: boolean;
  created_at: string;
}

interface UserStats {
  user_id: string;
  total: number;
  active: number;
  done: number;
  deleted: number;
}

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
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<'all' | 'admin' | 'user' | 'flagged' | 'disabled'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 5;
  const [maxUsers, setMaxUsers] = useState(15);
  const [editingMaxUsers, setEditingMaxUsers] = useState(false);
  const [maxUsersInput, setMaxUsersInput] = useState('15');

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

      setProfiles(allProfiles || []);

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
          <h2 className="text-[20px] font-bold text-[var(--text)] mb-2">Access Denied</h2>
          <p className="text-[15px] text-[var(--muted)]">Admin access required.</p>
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

    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !currentStatus })
      .eq('id', profileId);

    if (!error) {
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_admin: !currentStatus } : p));
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[24px] lg:text-[30px] font-bold text-[var(--text)] mb-1">Admin Dashboard</h1>
        <p className="text-[15px] text-[var(--muted)]">User management & activity overview</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Users" value={totalUsers} subtext={`/ ${maxUsers} max`} color="var(--toolkit)" icon={Users} />
        <StatCard label="Active Vibes" value={totalActive} color="var(--blue)" icon={Activity} />
        <StatCard label="Completed" value={totalDone} color="var(--green)" icon={CheckCircle} />
        <StatCard label="Total Vibes" value={totalVibes} color="var(--orange)" icon={BarChart3} />
      </div>

      {/* User capacity */}
      <div className="mb-8 bg-[var(--surface)] rounded-2xl p-5 border border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[13px] text-[var(--muted)] mb-1">User Capacity</div>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] font-bold" style={{ color: totalUsers >= maxUsers ? 'var(--red)' : totalUsers >= maxUsers * 0.8 ? 'var(--orange)' : 'var(--green)' }}>{totalUsers}</span>
              <span className="text-[16px] text-[var(--dim)]">/ {maxUsers}</span>
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
        <div className="flex justify-between mt-2 text-[11px] text-[var(--dim)]">
          <span>{maxUsers - totalUsers} slots remaining</span>
          <span>{Math.round((totalUsers / maxUsers) * 100)}% used</span>
        </div>
      </div>

      {/* Recently Joined */}
      {(() => {
        const recent = [...profiles].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3);
        return (
          <div className="mb-8">
            <h2 className="text-[16px] font-semibold text-[var(--muted)] mb-3">Recently Joined</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {recent.map((p) => {
                const userStat = stats.find(s => s.user_id === p.id);
                return (
                  <div key={p.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[16px] font-bold text-white"
                        style={{ background: `linear-gradient(135deg, ${p.is_admin ? 'var(--toolkit), var(--toolkit-accent)' : 'var(--blue), var(--green)'})` }}
                      >
                        {(p.full_name || p.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[15px] font-medium text-[var(--text)] truncate">{p.full_name || 'No name'}</div>
                        <div className="text-[12px] text-[var(--dim)]">{timeAgo(p.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-center">
                      <div className="flex-1">
                        <div className="text-[18px] font-bold text-[var(--blue)]">{userStat?.active || 0}</div>
                        <div className="text-[10px] text-[var(--dim)]">Active</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-[18px] font-bold text-[var(--green)]">{userStat?.done || 0}</div>
                        <div className="text-[10px] text-[var(--dim)]">Done</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-[18px] font-bold text-[var(--muted)]">{userStat?.total || 0}</div>
                        <div className="text-[10px] text-[var(--dim)]">Total</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Users list */}
      <div className="mb-6">
        <h2 className="text-[18px] font-semibold text-[var(--text)] mb-3">Enrolled Users</h2>

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
                <div className="text-[11px] text-[var(--muted)] font-medium">{f.label}</div>
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
            <div className="text-center py-8 text-[15px] text-[var(--dim)]">No users found</div>
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
                    <span className="text-[16px] font-medium text-[var(--text)] truncate">
                      {profile.full_name || 'No name'}
                    </span>
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
                  <div className="text-[13px] text-[var(--muted)] truncate">{profile.email}</div>
                  <div className="text-[12px] text-[var(--dim)] mt-0.5">
                    Joined {fmtDate(profile.created_at)} · {timeAgo(profile.created_at)}
                  </div>
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
                    <span className="text-[13px] text-[var(--dim)]">No activity</span>
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
                  />
                )}
              </div>
            );
          })}
        </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[13px] text-[var(--muted)]">
                    Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
                  </span>
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
    </div>
  );
}

function StatCard({ label, value, subtext, color, icon: Icon }: { label: string; value: number; subtext?: string; color: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-[var(--muted)]" />
        <span className="text-[13px] text-[var(--muted)]">{label}</span>
      </div>
      <div className="text-[28px] font-bold" style={{ color }}>
        {value}
        {subtext && <span className="text-[14px] font-normal text-[var(--dim)]"> {subtext}</span>}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[16px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[var(--dim)]">{label}</div>
    </div>
  );
}

function UserMenu({ profile, onToggleAdmin, onToggleDisable }: { profile: Profile; onToggleAdmin: () => void; onToggleDisable: () => void }) {
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
