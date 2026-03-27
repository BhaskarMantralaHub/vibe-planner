'use client';

import { useState, useMemo } from 'react';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { Button, Input, Label, Text, SegmentedControl } from '@/components/ui';
import type { ScoringTeam, ScoringPlayer, TeamSide, TossDecision } from '@/types/scoring';
import type { CricketPlayer } from '@/types/cricket';
import PlayerPickerRow from '@/app/(tools)/cricket/components/PlayerPickerRow';
import { MdSportsCricket, MdArrowBack, MdArrowForward, MdCheck, MdPersonAdd, MdClose } from 'react-icons/md';

const TOTAL_STEPS = 5;

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function toScoringPlayer(cp: CricketPlayer): ScoringPlayer {
  return {
    id: genId(),
    name: cp.name,
    jersey_number: cp.jersey_number,
    player_id: cp.id,
    is_guest: false,
  };
}

function makeGuestPlayer(name: string): ScoringPlayer {
  return {
    id: genId(),
    name,
    jersey_number: null,
    player_id: null,
    is_guest: true,
  };
}

/* ── Step Dots ── */
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="h-2 rounded-full transition-all duration-300"
          style={{
            width: i + 1 === current ? 24 : 8,
            background: i + 1 <= current
              ? 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))'
              : 'var(--border)',
          }}
        />
      ))}
    </div>
  );
}

/* PlayerRow now delegates to the shared PlayerPickerRow */

/* ── Add Guest Player Inline ── */
function AddGuestInline({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-[var(--muted)] hover:border-[var(--cricket)]/40 hover:text-[var(--cricket)] transition-colors cursor-pointer"
      >
        <MdPersonAdd size={18} />
        <Text size="sm" color="muted">Add guest player</Text>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--cricket)]/30 bg-[var(--surface)] px-3 py-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        placeholder="Guest name"
        autoFocus
        className="flex-1 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--dim)]"
      />
      <button onClick={handleAdd} className="text-[var(--cricket)] cursor-pointer"><MdCheck size={20} /></button>
      <button onClick={() => { setOpen(false); setName(''); }} className="text-[var(--muted)] cursor-pointer"><MdClose size={20} /></button>
    </div>
  );
}

/* ── Main Wizard ── */
export default function ScoringWizard({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const { players: rosterPlayers } = useCricketStore();
  const { createMatch, setOpeners, startMatch } = useScoringStore();

  const activePlayers = useMemo(
    () => rosterPlayers.filter((p) => p.is_active),
    [rosterPlayers]
  );

  // Step 1: Match details
  const [title, setTitle] = useState('');
  const [overs, setOvers] = useState('20');
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0]);
  const { user } = useAuthStore();
  const scorerName = (user?.user_metadata?.full_name as string) || user?.email || 'Scorer';

  // Step 2: Team A players
  const [teamAName, setTeamAName] = useState('');
  const [teamASelectedIds, setTeamASelectedIds] = useState<Set<string>>(new Set());
  const [teamAGuests, setTeamAGuests] = useState<ScoringPlayer[]>([]);

  // Step 3: Team B players
  const [teamBName, setTeamBName] = useState('');
  const [teamBSelectedIds, setTeamBSelectedIds] = useState<Set<string>>(new Set());
  const [teamBGuests, setTeamBGuests] = useState<ScoringPlayer[]>([]);

  // Step 4: Toss
  const [tossWinner, setTossWinner] = useState<TeamSide>('team_a');
  const [tossDecision, setTossDecision] = useState<TossDecision>('bat');

  // Step 5: Opening batsmen
  const [strikerId, setStrikerId] = useState<string | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<string | null>(null);

  // Step 6: Opening bowler
  const [bowlerId, setBowlerId] = useState<string | null>(null);

  const [step, setStep] = useState(1);

  // Build teams from selections
  const buildTeamA = (): ScoringTeam => {
    const fromRoster = activePlayers
      .filter((p) => teamASelectedIds.has(p.id))
      .map(toScoringPlayer);
    return { name: teamAName || 'Team A', captain_id: null, players: [...fromRoster, ...teamAGuests] };
  };

  const buildTeamB = (): ScoringTeam => {
    const fromRoster = activePlayers
      .filter((p) => teamBSelectedIds.has(p.id))
      .map(toScoringPlayer);
    return { name: teamBName || 'Team B', captain_id: null, players: [...fromRoster, ...teamBGuests] };
  };

  // Determine batting first team players for steps 5/6
  const teamA = useMemo(buildTeamA, [activePlayers, teamASelectedIds, teamAGuests, teamAName]);
  const teamB = useMemo(buildTeamB, [activePlayers, teamBSelectedIds, teamBGuests, teamBName]);

  const battingFirstTeam = useMemo(() => {
    if ((tossWinner === 'team_a' && tossDecision === 'bat') || (tossWinner === 'team_b' && tossDecision === 'bowl')) {
      return teamA;
    }
    return teamB;
  }, [tossWinner, tossDecision, teamA, teamB]);

  const bowlingFirstTeam = useMemo(() => {
    return battingFirstTeam === teamA ? teamB : teamA;
  }, [battingFirstTeam, teamA, teamB]);

  // Validation per step
  const canAdvance = (): boolean => {
    switch (step) {
      case 1:
        return title.trim().length > 0 && parseInt(overs) > 0;
      case 2:
        return (teamASelectedIds.size + teamAGuests.length) >= 2;
      case 3:
        return (teamBSelectedIds.size + teamBGuests.length) >= 2;
      case 4:
        return true; // toss always has defaults
      case 5:
        return strikerId !== null && nonStrikerId !== null && strikerId !== nonStrikerId && bowlerId !== null;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      // Final step — use the memoized teams (same IDs as the picker)
      createMatch({
        title: title.trim(),
        overs: parseInt(overs),
        date: matchDate,
        teamA: teamA,
        teamB: teamB,
        tossWinner,
        tossDecision,
        scorerName: scorerName.trim() || 'Scorer',
      });
      setOpeners(strikerId!, nonStrikerId!, bowlerId!);
      startMatch();
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      onBack();
    }
  };

  const toggleTeamA = (playerId: string) => {
    // Can't select a player already in Team B
    if (teamBSelectedIds.has(playerId)) return;
    setTeamASelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const toggleTeamB = (playerId: string) => {
    if (teamASelectedIds.has(playerId)) return;
    setTeamBSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
        <button onClick={handleBack} className="cursor-pointer rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors">
          <MdArrowBack size={22} />
        </button>
        <Text size="lg" weight="semibold">
          {step === 1 && 'Match Details'}
          {step === 2 && 'Team A Squad'}
          {step === 3 && 'Team B Squad'}
          {step === 4 && 'Toss'}
          {step === 5 && 'Opening Players'}
        </Text>
      </div>

      <StepDots current={step} total={TOTAL_STEPS} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-28">
        {/* Step 1: Match Details */}
        {step === 1 && (
          <div className="mx-auto max-w-md space-y-5">
            <div>
              <Label>Match Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Sunrisers vs Thunder"
                brand="cricket"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Overs per Innings</Label>
              <Input
                type="number"
                value={overs}
                onChange={(e) => setOvers(e.target.value)}
                placeholder="20"
                min={1}
                max={50}
                brand="cricket"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Match Date</Label>
              <Input
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                brand="cricket"
                className="mt-1"
              />
            </div>

            {/* Scorer info */}
            <div className="rounded-2xl border border-[var(--cricket)]/20 bg-[var(--cricket)]/5 p-3">
              <Text size="2xs" weight="semibold" color="dim" uppercase tracking="wider" className="mb-2">Scorer</Text>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
                  {scorerName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <Text size="md" weight="semibold">{scorerName}</Text>
                  <Text size="xs" color="muted">You are scoring this match</Text>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Team A Players */}
        {step === 2 && (
          <div className="mx-auto max-w-md space-y-4">
            <div>
              <Label>Team Name</Label>
              <Input
                value={teamAName}
                onChange={(e) => setTeamAName(e.target.value)}
                placeholder="Team A"
                brand="cricket"
                className="mt-1"
              />
            </div>
            <Label uppercase>Select from roster</Label>
            <div className="space-y-2">
              {activePlayers.map((p) => (
                <PlayerPickerRow
                  key={p.id}
                  player={p}
                  selected={teamASelectedIds.has(p.id)}
                  onToggle={() => toggleTeamA(p.id)}
                  disabled={teamBSelectedIds.has(p.id)}
                />
              ))}
            </div>
            {teamAGuests.length > 0 && (
              <>
                <Label uppercase>Guest players</Label>
                <div className="space-y-2">
                  {teamAGuests.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2.5">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--muted)]/20 text-[11px] font-bold text-[var(--muted)]">
                        {g.name[0].toUpperCase()}
                      </div>
                      <Text size="sm" weight="medium" className="flex-1">{g.name}</Text>
                      <Text size="2xs" color="dim">Guest</Text>
                      <button
                        onClick={() => setTeamAGuests((prev) => prev.filter((x) => x.id !== g.id))}
                        className="text-[var(--muted)] hover:text-[var(--red)] cursor-pointer"
                      >
                        <MdClose size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <AddGuestInline onAdd={(name) => setTeamAGuests((prev) => [...prev, makeGuestPlayer(name)])} />
            <Text size="xs" color="muted">
              {teamASelectedIds.size + teamAGuests.length} player{teamASelectedIds.size + teamAGuests.length !== 1 ? 's' : ''} selected (min 2)
            </Text>
          </div>
        )}

        {/* Step 3: Team B Players */}
        {step === 3 && (
          <div className="mx-auto max-w-md space-y-4">
            <div>
              <Label>Team Name</Label>
              <Input
                value={teamBName}
                onChange={(e) => setTeamBName(e.target.value)}
                placeholder="Team B"
                brand="cricket"
                className="mt-1"
              />
            </div>
            <Label uppercase>Select from roster</Label>
            <div className="space-y-2">
              {activePlayers.filter((p) => !teamASelectedIds.has(p.id)).map((p) => (
                <PlayerPickerRow
                  key={p.id}
                  player={p}
                  selected={teamBSelectedIds.has(p.id)}
                  onToggle={() => toggleTeamB(p.id)}
                />
              ))}
            </div>
            {teamBGuests.length > 0 && (
              <>
                <Label uppercase>Guest players</Label>
                <div className="space-y-2">
                  {teamBGuests.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2.5">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--muted)]/20 text-[11px] font-bold text-[var(--muted)]">
                        {g.name[0].toUpperCase()}
                      </div>
                      <Text size="sm" weight="medium" className="flex-1">{g.name}</Text>
                      <Text size="2xs" color="dim">Guest</Text>
                      <button
                        onClick={() => setTeamBGuests((prev) => prev.filter((x) => x.id !== g.id))}
                        className="text-[var(--muted)] hover:text-[var(--red)] cursor-pointer"
                      >
                        <MdClose size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <AddGuestInline onAdd={(name) => setTeamBGuests((prev) => [...prev, makeGuestPlayer(name)])} />
            <Text size="xs" color="muted">
              {teamBSelectedIds.size + teamBGuests.length} player{teamBSelectedIds.size + teamBGuests.length !== 1 ? 's' : ''} selected (min 2)
            </Text>
          </div>
        )}

        {/* Step 4: Toss */}
        {step === 4 && (
          <div className="mx-auto max-w-md space-y-6">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
                <MdSportsCricket size={32} className="text-white" />
              </div>
              <Text size="xl" weight="semibold">Who won the toss?</Text>
              <SegmentedControl
                options={[
                  { key: 'team_a', label: teamAName || 'Team A' },
                  { key: 'team_b', label: teamBName || 'Team B' },
                ]}
                active={tossWinner}
                onChange={(k) => setTossWinner(k as TeamSide)}
                className="w-full"
              />
            </div>
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <Text size="xl" weight="semibold">Elected to?</Text>
              <SegmentedControl
                options={[
                  { key: 'bat', label: 'Bat' },
                  { key: 'bowl', label: 'Bowl' },
                ]}
                active={tossDecision}
                onChange={(k) => setTossDecision(k as TossDecision)}
                className="w-full"
              />
              <Text size="sm" color="muted">
                {(tossWinner === 'team_a' ? (teamAName || 'Team A') : (teamBName || 'Team B'))} won the toss and elected to {tossDecision} first
              </Text>
            </div>
          </div>
        )}

        {/* Step 5: Opening Batsmen */}
        {step === 5 && (
          <div className="mx-auto max-w-md space-y-5">
            <div>
              <Label uppercase className="mb-2">Opening Batsmen — {battingFirstTeam.name}</Label>
              <Text size="xs" color="muted" className="mb-3">Select 2 (first tap = striker)</Text>
              <div className="space-y-2">
                {battingFirstTeam.players.map((p) => {
                  const isStriker = strikerId === p.id;
                  const isNonStriker = nonStrikerId === p.id;
                  const isSelected = isStriker || isNonStriker;
                  return (
                    <PlayerPickerRow
                      key={p.id}
                      player={{ id: p.id, name: p.name, jersey_number: p.jersey_number }}
                      selected={isSelected}
                      onToggle={() => {
                        if (isStriker) { setStrikerId(null); return; }
                        if (isNonStriker) { setNonStrikerId(null); return; }
                        if (!strikerId) { setStrikerId(p.id); return; }
                        if (!nonStrikerId) { setNonStrikerId(p.id); return; }
                      }}
                      mode="highlight"
                      badge={isStriker ? 'Striker' : isNonStriker ? 'Non-Striker' : undefined}
                    />
                  );
                })}
              </div>
            </div>
            <div>
              <Label uppercase className="mb-2">Opening Bowler — {bowlingFirstTeam.name}</Label>
              <div className="space-y-2">
                {bowlingFirstTeam.players.map((p) => {
                  const isSelected = bowlerId === p.id;
                  return (
                    <PlayerPickerRow
                      key={p.id}
                      player={{ id: p.id, name: p.name, jersey_number: p.jersey_number }}
                      selected={isSelected}
                      onToggle={() => setBowlerId(isSelected ? null : p.id)}
                      mode="radio"
                      badge={isSelected ? 'Bowler' : undefined}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={handleBack}
            className="flex-1"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button
            variant="primary"
            brand="cricket"
            size="lg"
            onClick={handleNext}
            disabled={!canAdvance()}
            className="flex-1"
          >
            {step === TOTAL_STEPS ? (
              <span className="flex items-center gap-2">
                <MdSportsCricket size={18} /> Start Match
              </span>
            ) : (
              <span className="flex items-center gap-1">
                Next <MdArrowForward size={16} />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
