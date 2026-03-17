'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { PLAYER_ROLES, BATTING_STYLES, BOWLING_STYLES, SHIRT_SIZES } from '../lib/constants';
import type { PlayerRole, BattingStyle, BowlingStyle } from '@/types/cricket';

export default function PlayerManager() {
  const { user } = useAuthStore();
  const { players, addPlayer, updatePlayer, removePlayer, showPlayerForm, setShowPlayerForm, editingPlayer, setEditingPlayer } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);

  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [email, setEmail] = useState('');
  const [cricclubId, setCricclubId] = useState('');
  const [shirtSize, setShirtSize] = useState('');
  const [playerRole, setPlayerRole] = useState('');
  const [battingStyle, setBattingStyle] = useState('');
  const [bowlingStyle, setBowlingStyle] = useState('');

  const resetForm = () => {
    setName(''); setJersey(''); setEmail(''); setCricclubId(''); setShirtSize('');
    setPlayerRole(''); setBattingStyle(''); setBowlingStyle('');
    setEditingPlayer(null);
  };

  const handleSubmit = () => {
    if (!user || !name.trim() || !playerRole || !battingStyle || !bowlingStyle) return;

    const data = {
      name: name.trim(),
      jersey_number: jersey ? Number(jersey) : null,
      phone: null,
      email: email.trim() || null,
      cricclub_id: cricclubId.trim() || null,
      shirt_size: shirtSize || null,
      player_role: (playerRole || null) as PlayerRole | null,
      batting_style: (battingStyle || null) as BattingStyle | null,
      bowling_style: (bowlingStyle || null) as BowlingStyle | null,
    };

    if (editingPlayer) {
      updatePlayer(editingPlayer, data);
    } else {
      addPlayer(user.id, data);
    }
    resetForm();
    setShowPlayerForm(false);
  };

  const handleEdit = (p: typeof players[0]) => {
    setEditingPlayer(p.id);
    setName(p.name);
    setJersey(p.jersey_number?.toString() ?? '');
    setEmail(p.email ?? '');
    setCricclubId(p.cricclub_id ?? '');
    setShirtSize(p.shirt_size ?? '');
    setPlayerRole(p.player_role ?? '');
    setBattingStyle(p.batting_style ?? '');
    setBowlingStyle(p.bowling_style ?? '');
    setShowPlayerForm(true);
  };

  const getRoleIcon = (role: string | null) => PLAYER_ROLES.find((r) => r.key === role)?.icon ?? '';
  const getRoleLabel = (role: string | null) => PLAYER_ROLES.find((r) => r.key === role)?.label ?? '';

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 min-w-0">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-[var(--text)]">Players ({activePlayers.length})</h3>
        <button
          onClick={() => { resetForm(); setShowPlayerForm(!showPlayerForm); }}
          className="rounded-lg bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-3 py-1.5 text-[13px] font-medium text-white cursor-pointer hover:opacity-90 transition-all"
        >
          {showPlayerForm ? 'Cancel' : '+ Add Player'}
        </button>
      </div>

      {showPlayerForm && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 overflow-hidden">
          {/* Name + Jersey */}
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <div>
              <label className="mb-1 block text-[12px] text-[var(--muted)]">Name *</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
                placeholder="Player name"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-[var(--muted)]">Jersey #</label>
              <input
                type="number" value={jersey} onChange={(e) => setJersey(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
                placeholder="#"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-[12px] text-[var(--muted)]">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
              placeholder="player@email.com"
            />
          </div>

          {/* CricClub ID */}
          <div>
            <label className="mb-1 block text-[12px] text-[var(--muted)]">CricClub ID</label>
            <input
              value={cricclubId} onChange={(e) => setCricclubId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
              placeholder="Optional"
            />
          </div>

          {/* Shirt Size */}
          <div>
              <label className="mb-1 block text-[12px] text-[var(--muted)]">Shirt Size</label>
              <div className="flex flex-wrap gap-1">
                {SHIRT_SIZES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setShirtSize(shirtSize === s.key ? '' : s.key)}
                    className="rounded-lg px-2.5 py-1.5 text-[12px] cursor-pointer transition-all border"
                    style={{
                      backgroundColor: shirtSize === s.key ? 'var(--purple)' : 'transparent',
                      borderColor: shirtSize === s.key ? 'var(--purple)' : 'var(--border)',
                      color: shirtSize === s.key ? 'white' : 'var(--muted)',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
          </div>

          {/* Role */}
          <div>
            <label className="mb-1.5 block text-[12px] text-[var(--muted)]">Role *</label>
            <div className="flex flex-wrap gap-1.5">
              {PLAYER_ROLES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setPlayerRole(playerRole === r.key ? '' : r.key)}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium cursor-pointer transition-all border"
                  style={{
                    backgroundColor: playerRole === r.key ? 'var(--orange)' : 'transparent',
                    borderColor: playerRole === r.key ? 'var(--orange)' : 'var(--border)',
                    color: playerRole === r.key ? 'white' : 'var(--muted)',
                  }}
                >
                  {r.icon} {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Batting + Bowling in a grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] text-[var(--muted)]">Batting *</label>
              <div className="flex flex-wrap gap-1.5">
                {BATTING_STYLES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setBattingStyle(battingStyle === s.key ? '' : s.key)}
                    className="rounded-lg px-2.5 py-1.5 text-[12px] cursor-pointer transition-all border"
                    style={{
                      backgroundColor: battingStyle === s.key ? 'var(--blue)' : 'transparent',
                      borderColor: battingStyle === s.key ? 'var(--blue)' : 'var(--border)',
                      color: battingStyle === s.key ? 'white' : 'var(--muted)',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] text-[var(--muted)]">Bowling *</label>
              <div className="flex flex-wrap gap-1.5">
                {BOWLING_STYLES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setBowlingStyle(bowlingStyle === s.key ? '' : s.key)}
                    className="rounded-lg px-2.5 py-1.5 text-[12px] cursor-pointer transition-all border"
                    style={{
                      backgroundColor: bowlingStyle === s.key ? 'var(--green)' : 'transparent',
                      borderColor: bowlingStyle === s.key ? 'var(--green)' : 'var(--border)',
                      color: bowlingStyle === s.key ? 'white' : 'var(--muted)',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !playerRole || !battingStyle || !bowlingStyle}
            className="w-full rounded-lg bg-[var(--green)] px-4 py-2.5 text-[13px] font-medium text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {editingPlayer ? 'Update Player' : 'Add Player'}
          </button>
        </div>
      )}

      {activePlayers.length === 0 ? (
        <p className="text-[14px] text-[var(--muted)] text-center py-6">No players yet. Add your first player above.</p>
      ) : (
        <div className="space-y-1">
          {activePlayers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--hover-bg)] transition-colors group">
              <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--orange)]/30 bg-[var(--orange)]/10 text-[12px] font-bold text-[var(--orange)]">
                {p.jersey_number ? `#${p.jersey_number}` : '—'}
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[14px] font-medium text-[var(--text)]">{p.name}</span>
                  {p.player_role && (
                    <span className="text-[10px] rounded-md px-1.5 py-0.5 border border-[var(--border)] text-[var(--muted)] whitespace-nowrap">
                      {getRoleIcon(p.player_role)} {getRoleLabel(p.player_role)}
                    </span>
                  )}
                  {p.shirt_size && (
                    <span className="text-[10px] rounded-md px-1.5 py-0.5 border border-[var(--border)] text-[var(--dim)]">
                      {p.shirt_size}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap text-[11px] text-[var(--dim)]">
                  {p.batting_style && <span>{p.batting_style === 'right' ? 'RHB' : 'LHB'}</span>}
                  {p.bowling_style && <span>&bull; {p.bowling_style.charAt(0).toUpperCase() + p.bowling_style.slice(1)}</span>}
                  {p.cricclub_id && <span>&bull; CC:{p.cricclub_id}</span>}
                </div>
              </div>
              <div className="flex-shrink-0 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(p)} className="rounded-lg px-2 py-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer">
                  Edit
                </button>
                <button
                  onClick={() => { if (confirm(`Remove ${p.name}?`)) removePlayer(p.id); }}
                  className="rounded-lg px-2 py-1 text-[12px] text-[var(--red)] hover:bg-[var(--red)]/10 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
