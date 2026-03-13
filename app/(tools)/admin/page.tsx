'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { AuthGate } from '@/components/AuthGate';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
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

function AdminContent() {
  const { user } = useAuthStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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

      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--purple)] border-t-transparent" />
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

  const totalUsers = profiles.length;
  const adminCount = profiles.filter(p => p.is_admin).length;
  const totalVibes = stats.reduce((sum, s) => sum + s.total, 0);
  const totalActive = stats.reduce((sum, s) => sum + s.active, 0);
  const totalDone = stats.reduce((sum, s) => sum + s.done, 0);
  const maxUsers = parseInt(process.env.NEXT_PUBLIC_MAX_USERS || '10', 10);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[24px] lg:text-[30px] font-bold text-[var(--text)] mb-1">Admin Dashboard</h1>
        <p className="text-[15px] text-[var(--muted)]">User management & activity overview</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Users" value={totalUsers} subtext={`/ ${maxUsers} max`} color="var(--purple)" />
        <StatCard label="Active Vibes" value={totalActive} color="var(--blue)" />
        <StatCard label="Completed" value={totalDone} color="var(--green)" />
        <StatCard label="Total Vibes" value={totalVibes} color="var(--orange)" />
      </div>

      {/* User capacity bar */}
      <div className="mb-8 bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[14px] font-medium text-[var(--text)]">User Capacity</span>
          <span className="text-[14px] text-[var(--muted)]">{totalUsers} / {maxUsers}</span>
        </div>
        <div className="h-3 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(totalUsers / maxUsers) * 100}%`,
              background: totalUsers >= maxUsers ? 'var(--red)' : totalUsers >= maxUsers * 0.8 ? 'var(--orange)' : 'var(--green)',
            }}
          />
        </div>
      </div>

      {/* Users list */}
      <div className="mb-6">
        <h2 className="text-[18px] font-semibold text-[var(--text)] mb-4">Enrolled Users</h2>
        <div className="space-y-3">
          {profiles.map((profile) => {
            const userStats = stats.find(s => s.user_id === profile.id);
            return (
              <div
                key={profile.id}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-4"
              >
                {/* Avatar */}
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-[18px] font-bold text-white shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${profile.is_admin ? 'var(--purple), var(--indigo)' : 'var(--blue), var(--green)'})`,
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
                    {profile.is_admin && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--purple)]/15 text-[var(--purple)] font-semibold shrink-0">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-[var(--muted)] truncate">{profile.email}</div>
                  <div className="text-[12px] text-[var(--dim)] mt-0.5">
                    Joined {fmtDate(profile.created_at)} · {timeAgo(profile.created_at)}
                  </div>
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtext, color }: { label: string; value: number; subtext?: string; color: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
      <div className="text-[13px] text-[var(--muted)] mb-1">{label}</div>
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

export default function AdminPage() {
  return (
    <AuthGate>
      <AdminContent />
    </AuthGate>
  );
}
