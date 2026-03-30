'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle, Text, Input, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ScoringPlayer, TeamSide } from '@/types/scoring';
import PlayerPickerRow from '@/app/(tools)/cricket/components/PlayerPickerRow';

interface RosterPlayer {
  id: string;
  name: string;
  jersey_number: number | null;
  photo_url: string | null;
  is_guest: boolean;
}

interface AddPlayerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamSide: TeamSide;
  teamName: string;
  existingPlayerIds: Set<string>; // player_ids already in this match (both teams)
  rosterPlayers: RosterPlayer[];
  guestSuggestions: { id: string; name: string }[];
  onAddPlayer: (teamSide: TeamSide, player: ScoringPlayer) => Promise<boolean>;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function AddPlayerSheet({
  open, onOpenChange, teamSide, teamName, existingPlayerIds, rosterPlayers, guestSuggestions, onAddPlayer,
}: AddPlayerSheetProps) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [showGuestInput, setShowGuestInput] = useState(false);

  const resetState = () => {
    setSearch('');
    setAdding(false);
    setGuestName('');
    setShowGuestInput(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  // Available roster players (active, not already in match) — split into roster + known guests
  const available = useMemo(() => {
    return rosterPlayers
      .filter((p) => !existingPlayerIds.has(p.id) && !p.is_guest)
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rosterPlayers, existingPlayerIds, search]);

  const availableGuests = useMemo(() => {
    return rosterPlayers
      .filter((p) => !existingPlayerIds.has(p.id) && p.is_guest)
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rosterPlayers, existingPlayerIds, search]);

  // Guest suggestions filtered (for new guest autocomplete)
  const filteredGuests = useMemo(() => {
    if (!guestName) return [];
    return guestSuggestions
      .filter((s) => s.name.toLowerCase().includes(guestName.toLowerCase()))
      .filter((s) => !existingPlayerIds.has(s.id))
      .slice(0, 5);
  }, [guestSuggestions, guestName, existingPlayerIds]);

  const handleSelectRoster = async (p: RosterPlayer) => {
    setAdding(true);
    const player: ScoringPlayer = {
      id: genId(),
      name: p.name,
      jersey_number: p.jersey_number,
      player_id: p.id,
      is_guest: p.is_guest,
    };
    await onAddPlayer(teamSide, player);
    setAdding(false);
    // Don't close — allow adding multiple players
  };

  const handleAddGuest = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAdding(true);
    const player: ScoringPlayer = {
      id: genId(),
      name: trimmed,
      jersey_number: null,
      player_id: null,
      is_guest: true,
    };
    await onAddPlayer(teamSide, player);
    setAdding(false);
    setGuestName('');
    // Don't close — allow adding multiple players
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" showClose>
        <DialogTitle>Add Player to {teamName}</DialogTitle>

        {/* Search */}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search roster..."
          brand="cricket"
          className="mb-3"
        />

        {/* Player lists */}
        <div className="space-y-1 mb-4 max-h-[50vh] overflow-y-auto">
          {available.length > 0 && (
            <>
              {availableGuests.length > 0 && (
                <Text size="2xs" weight="semibold" color="muted" uppercase className="px-1 pt-1 pb-0.5">Roster</Text>
              )}
              {available.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectRoster(p)}
                  disabled={adding}
                  className={cn(
                    'w-full text-left cursor-pointer select-none transition-all active:scale-[0.98]',
                    'rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5',
                    'hover:border-[var(--cricket)]/50',
                    adding && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="flex items-center gap-3">
                    {p.photo_url ? (
                      <img
                        src={p.photo_url}
                        alt={p.name}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
                        style={{
                          background: 'color-mix(in srgb, var(--cricket) 15%, var(--card))',
                          color: 'var(--cricket)',
                        }}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <Text size="sm" weight="medium" truncate>{p.name}</Text>
                    </div>
                    {p.jersey_number != null && (
                      <Text size="xs" color="muted" tabular className="flex-shrink-0">#{p.jersey_number}</Text>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}

          {availableGuests.length > 0 && (
            <>
              <Text size="2xs" weight="semibold" color="muted" uppercase className="px-1 pt-2 pb-0.5">Guest Players</Text>
              {availableGuests.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectRoster(p)}
                  disabled={adding}
                  className={cn(
                    'w-full text-left cursor-pointer select-none transition-all active:scale-[0.98]',
                    'rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5',
                    'hover:border-amber-500/40',
                    adding && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold bg-amber-500/15 text-amber-500">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Text size="sm" weight="medium" truncate>{p.name}</Text>
                    </div>
                    <Text size="2xs" color="muted" className="flex-shrink-0">Guest</Text>
                  </div>
                </button>
              ))}
            </>
          )}

          {available.length === 0 && availableGuests.length === 0 && (
            <div className="py-3">
              <Text size="sm" color="muted">
                {search ? 'No matching players found' : 'All players are already in the match'}
              </Text>
            </div>
          )}
        </div>

        {/* Add New Guest */}
        <div className="border-t border-[var(--border)]/40 pt-3">
          {!showGuestInput ? (
            <button
              onClick={() => setShowGuestInput(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-[var(--muted)] hover:border-[var(--cricket)]/40 hover:text-[var(--cricket)] transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              <Text size="sm" color="muted">Add guest player</Text>
            </button>
          ) : (
            <div className="space-y-2">
              <Text size="xs" weight="medium" color="muted">Guest player name</Text>
              <div className="relative">
                <div className="flex items-center gap-2">
                  <Input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddGuest(guestName)}
                    placeholder="Enter name"
                    brand="cricket"
                    autoFocus
                    className="flex-1"
                  />
                  <Button
                    variant="primary"
                    brand="cricket"
                    size="sm"
                    loading={adding}
                    onClick={() => handleAddGuest(guestName)}
                    disabled={!guestName.trim()}
                  >
                    Add
                  </Button>
                </div>
                {/* Guest suggestions dropdown */}
                {filteredGuests.length > 0 && (
                  <div className="absolute left-0 right-12 top-full mt-1 z-10 max-h-32 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
                    {filteredGuests.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleAddGuest(s.name)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-[var(--surface)] transition-colors"
                      >
                        <Text size="sm" weight="medium">{s.name}</Text>
                        <Text size="2xs" color="dim">Guest</Text>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AddPlayerSheet };
