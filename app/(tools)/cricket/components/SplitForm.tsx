'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody } from '@/components/ui/drawer';
import { Button, Text, Badge } from '@/components/ui';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Input } from '@/components/ui/input';
import { useCricketStore } from '@/stores/cricket-store';
import { useSplitsStore } from '@/stores/splits-store';
import { useAuthStore } from '@/stores/auth-store';
import { computeSplitAmounts } from '../lib/utils';
import { nameToGradient } from '@/lib/avatar';
import { Check, CheckCircle2, Cookie, CupSoda, Utensils, Package, Users, Search, X } from 'lucide-react';
import type { SplitCategory } from '@/types/cricket';

type CategoryDef = { key: SplitCategory; label: string; renderIcon: (color: string) => React.ReactNode; color: string };

const SPLIT_CATEGORIES: CategoryDef[] = [
  { key: 'snacks', label: 'Snacks', renderIcon: (c) => <Cookie size={18} style={{ color: c }} />, color: '#F59E0B' },
  { key: 'drinks', label: 'Drinks', renderIcon: (c) => <CupSoda size={18} style={{ color: c }} />, color: '#3B82F6' },
  { key: 'food', label: 'Food', renderIcon: (c) => <Utensils size={18} style={{ color: c }} />, color: '#EF4444' },
  { key: 'other', label: 'Other', renderIcon: (c) => <Package size={18} style={{ color: c }} />, color: '#6B7280' },
];

export default function SplitForm() {
  const { players, selectedSeasonId } = useCricketStore();
  const { showSplitForm, addSplit, updateSplit, editingSplitId, splits, shares } = useSplitsStore();
  const { user } = useAuthStore();

  const setShowSplitForm = (v: boolean) => useSplitsStore.setState({ showSplitForm: v, editingSplitId: v ? editingSplitId : null });

  // Editing mode: load existing split data
  const editingSplit = editingSplitId ? splits.find((s) => s.id === editingSplitId) : null;
  const editingShares = editingSplitId ? shares.filter((s) => s.split_id === editingSplitId) : [];

  const activePlayers = useMemo(
    () => players.filter((p) => p.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  const myPlayer = useMemo(
    () => activePlayers.find((p) => p.email?.toLowerCase() === user?.email?.toLowerCase()),
    [activePlayers, user?.email],
  );

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SplitCategory>('snacks');
  const [paidById, setPaidById] = useState<string | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [showPaidByPicker, setShowPaidByPicker] = useState(false);
  const [paidBySearch, setPaidBySearch] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  // No auto-focus — iOS Safari keyboard pushes the drawer and covers the input.
  // Let the user tap the amount field when ready.

  // Pre-fill fields when editing an existing split
  useEffect(() => {
    if (editingSplit && showSplitForm) {
      setAmount(String(editingSplit.amount));
      setDescription(editingSplit.description || '');
      setCategory(editingSplit.category);
      setPaidById(editingSplit.paid_by);
      setSelectedPlayerIds(new Set(editingShares.map((s) => s.player_id)));
      // Detect if all shares are equal
      const amounts = editingShares.map((s) => Number(s.share_amount));
      const allEqual = amounts.length > 0 && amounts.every((a) => Math.abs(a - amounts[0]) < 0.01);
      if (allEqual) {
        setSplitType('equal');
      } else {
        setSplitType('custom');
        const ca: Record<string, string> = {};
        for (const s of editingShares) ca[s.player_id] = String(s.share_amount);
        setCustomAmounts(ca);
      }
    }
  }, [editingSplitId, showSplitForm]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectivePaidBy = paidById ?? myPlayer?.id ?? null;

  // Auto-include payer in selection only when explicitly changed via picker
  useEffect(() => {
    if (paidById && !selectedPlayerIds.has(paidById)) {
      setSelectedPlayerIds((prev) => { const next = new Set(prev); next.add(paidById); return next; });
    }
  }, [paidById]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter players by search — selected players always stay visible
  const filteredPlayers = useMemo(() => {
    if (!playerSearch.trim()) return activePlayers;
    const q = playerSearch.toLowerCase();
    return activePlayers.filter(
      (p) => p.name.toLowerCase().includes(q) || selectedPlayerIds.has(p.id),
    );
  }, [activePlayers, playerSearch, selectedPlayerIds]);
  const numAmount = parseFloat(amount) || 0;
  const selectedCount = selectedPlayerIds.size;

  const perPersonAmounts = useMemo(() => {
    if (splitType !== 'equal' || selectedCount === 0 || numAmount === 0) return [];
    return computeSplitAmounts(numAmount, selectedCount);
  }, [splitType, selectedCount, numAmount]);

  const perPerson = perPersonAmounts.length > 0 ? perPersonAmounts[0] : 0;

  const customTotal = useMemo(() => {
    if (splitType !== 'custom') return 0;
    return Array.from(selectedPlayerIds).reduce((sum, id) => sum + (parseFloat(customAmounts[id]) || 0), 0);
  }, [splitType, selectedPlayerIds, customAmounts]);
  const remaining = Math.round((numAmount - customTotal) * 100) / 100;

  // In custom mode, if players changed and total doesn't match, auto-switch to equal
  // In equal mode, always valid as long as count + amount are set
  const canSubmit = numAmount > 0 && effectivePaidBy && selectedCount >= 2
    && (splitType === 'equal' || Math.abs(remaining) < 0.01);

  // When players change in custom mode during edit, reset to equal to avoid stale amounts
  const prevSelectedCountRef = useRef(selectedCount);
  useEffect(() => {
    if (splitType === 'custom' && editingSplitId && selectedCount !== prevSelectedCountRef.current) {
      setSplitType('equal');
      setCustomAmounts({});
    }
    prevSelectedCountRef.current = selectedCount;
  }, [selectedCount, splitType, editingSplitId]);

  const resetForm = () => {
    setAmount(''); setDescription(''); setCategory('snacks');
    setPaidById(null); setSelectedPlayerIds(new Set());
    setSplitType('equal'); setCustomAmounts({}); setShowPaidByPicker(false);
    setPaidBySearch(''); setPlayerSearch('');
  };

  const handleSubmit = () => {
    if (!canSubmit || !user || !selectedSeasonId || !effectivePaidBy) return;

    const playerIds = Array.from(selectedPlayerIds);
    const newShares = splitType === 'equal'
      ? playerIds.map((id, i) => ({ player_id: id, share_amount: perPersonAmounts[i] ?? perPerson }))
      : playerIds.map((id) => ({ player_id: id, share_amount: parseFloat(customAmounts[id]) || 0 }));

    const splitData = {
      paid_by: effectivePaidBy,
      category,
      description: description || SPLIT_CATEGORIES.find((c) => c.key === category)?.label || 'Split',
      amount: numAmount,
      split_date: editingSplit?.split_date ?? new Date().toISOString().split('T')[0],
    };

    if (editingSplitId) {
      updateSplit(editingSplitId, splitData, newShares);
    } else {
      addSplit(user.id, selectedSeasonId, splitData, newShares,
        myPlayer?.name ?? user.user_metadata?.full_name as string ?? 'Unknown');
    }

    resetForm();
    setShowSplitForm(false);
  };

  const togglePlayer = (id: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedPlayerIds.size === activePlayers.length) setSelectedPlayerIds(new Set());
    else setSelectedPlayerIds(new Set(activePlayers.map((p) => p.id)));
  };

  const handlePaidBySelect = (id: string) => {
    setPaidById(id);
    setSelectedPlayerIds((prev) => { const next = new Set(prev); next.add(id); return next; });
    setShowPaidByPicker(false);
  };

  return (
    <Drawer open={showSplitForm} onOpenChange={(v) => { if (!v) resetForm(); setShowSplitForm(v); }}>
      <DrawerHandle />
      <DrawerTitle>{editingSplitId ? 'Edit Split' : 'New Split'}</DrawerTitle>
      <DrawerHeader>
        <Text as="h3" size="lg" weight="bold" tracking="tight">{editingSplitId ? 'Edit Split' : 'New Split'}</Text>
      </DrawerHeader>
      <DrawerBody>
        {/* Amount input */}
        <div className="text-center py-2">
          <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="mb-2">Total Amount</Text>
          <div className="flex items-center justify-center gap-1">
            <Text size="3xl" weight="bold" color="muted" className="leading-none">$</Text>
            <input
              type="text" inputMode="decimal" value={amount}
              onChange={(e) => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value); }}
              placeholder="0.00"
              className="bg-transparent text-center outline-none font-bold text-[40px] leading-none max-w-[200px]"
              style={{ color: 'var(--text)', caretColor: 'var(--cricket)', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
        </div>

        <Input label="Description" placeholder="Chai, snacks, uber..." value={description} onChange={(e) => setDescription(e.target.value)} />

        {/* Category chips */}
        <div>
          <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="mb-2">Category</Text>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {SPLIT_CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <button key={c.key} onClick={() => setCategory(c.key)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-2.5 px-3 flex-shrink-0 cursor-pointer transition-all border-2 active:scale-95 min-w-[60px]"
                  style={{ backgroundColor: active ? `${c.color}15` : 'var(--surface)', borderColor: active ? c.color : 'var(--border)', boxShadow: active ? `0 2px 12px ${c.color}20` : 'none' }}>
                  {c.renderIcon(active ? c.color : 'var(--muted)')}
                  <Text size="2xs" weight="bold" style={{ color: active ? c.color : 'var(--muted)' }}>{c.label}</Text>
                </button>
              );
            })}
          </div>
        </div>

        {/* Paid by — inline quick select with animated expansion */}
        <div>
          <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="mb-2">Paid By</Text>
          {!showPaidByPicker ? (
            /* ── Collapsed: avatar + name + Change link ── */
            <div className="flex items-center gap-3 min-h-[44px]">
              {(() => {
                const p = activePlayers.find((pl) => pl.id === effectivePaidBy);
                if (!p) return (
                  <button onClick={() => setShowPaidByPicker(true)} className="flex items-center gap-2 cursor-pointer active:opacity-70 transition-opacity">
                    <Text size="sm" color="dim">Select who paid</Text>
                    <Text size="xs" weight="semibold" style={{ color: 'var(--cricket)' }}>Choose</Text>
                  </button>
                );
                const [gF, gT] = nameToGradient(p.name);
                const initials = p.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <>
                    <div className="h-8 w-8 rounded-full text-[11px] font-bold text-white flex items-center justify-center flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${gF}, ${gT})` }}>{initials}</div>
                    <Text size="sm" weight="semibold">{p.id === myPlayer?.id ? 'You' : p.name}</Text>
                    {p.id === myPlayer?.id && <Text size="2xs" color="dim">({p.name.split(' ')[0]})</Text>}
                    <button onClick={() => { setShowPaidByPicker(true); setPaidBySearch(''); }}
                      className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 min-h-[36px] cursor-pointer active:scale-95 transition-all"
                      style={{ color: 'var(--cricket)', background: 'color-mix(in srgb, var(--cricket) 8%, transparent)' }}>
                      <Text size="xs" weight="bold" style={{ color: 'var(--cricket)' }}>Change</Text>
                    </button>
                  </>
                );
              })()}
            </div>
          ) : (
            /* ── Expanded: search + player list ── */
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden animate-fade-in">
              {/* Search header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)]">
                <Search size={16} className="text-[var(--muted)] flex-shrink-0" />
                <input
                  type="text" value={paidBySearch} onChange={(e) => setPaidBySearch(e.target.value)}
                  placeholder="Search players..."
                  className="flex-1 bg-transparent text-[14px] outline-none"
                  style={{ color: 'var(--text)' }}
                />
                <button onClick={() => { setShowPaidByPicker(false); setPaidBySearch(''); }}
                  className="p-2 -mr-2 cursor-pointer text-[var(--muted)] active:text-[var(--text)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                  <X size={18} />
                </button>
              </div>
              {/* Player list */}
              <div className="max-h-[220px] overflow-y-auto overscroll-contain">
                {(() => {
                  const q = paidBySearch.toLowerCase().trim();
                  // Pin "You" at top, then filter others alphabetically
                  const others = activePlayers.filter((p) => p.id !== myPlayer?.id);
                  const filteredOthers = q ? others.filter((p) => p.name.toLowerCase().includes(q)) : others;
                  const showMe = myPlayer && (!q || myPlayer.name.toLowerCase().includes(q) || 'you'.includes(q));

                  return (
                    <>
                      {/* "You" pinned at top */}
                      {showMe && myPlayer && (() => {
                        const [gF, gT] = nameToGradient(myPlayer.name);
                        const initials = myPlayer.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                        const selected = myPlayer.id === effectivePaidBy;
                        return (
                          <>
                            <button onClick={() => { handlePaidBySelect(myPlayer.id); setPaidBySearch(''); }}
                              className="w-full flex items-center gap-3 px-3 py-3 min-h-[48px] cursor-pointer transition-colors active:opacity-80"
                              style={{ background: selected ? 'color-mix(in srgb, var(--cricket) 8%, transparent)' : 'transparent' }}>
                              <div className="h-8 w-8 rounded-full text-[11px] font-bold text-white flex items-center justify-center flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, ${gF}, ${gT})` }}>{initials}</div>
                              <div className="flex-1 min-w-0 text-left">
                                <Text size="sm" weight="semibold">You</Text>
                                <Text as="p" size="2xs" color="muted">{myPlayer.name}</Text>
                              </div>
                              {selected && <CheckCircle2 size={20} className="flex-shrink-0" style={{ color: 'var(--cricket)' }} />}
                            </button>
                            {filteredOthers.length > 0 && <div className="h-px mx-3" style={{ background: 'var(--border)' }} />}
                          </>
                        );
                      })()}
                      {/* Other players */}
                      {filteredOthers.map((p) => {
                        const [gF, gT] = nameToGradient(p.name);
                        const initials = p.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                        const selected = p.id === effectivePaidBy;
                        return (
                          <button key={p.id} onClick={() => { handlePaidBySelect(p.id); setPaidBySearch(''); }}
                            className="w-full flex items-center gap-3 px-3 py-3 min-h-[48px] cursor-pointer transition-colors active:opacity-80"
                            style={{ background: selected ? 'color-mix(in srgb, var(--cricket) 8%, transparent)' : 'transparent' }}>
                            <div className="h-8 w-8 rounded-full text-[11px] font-bold text-white flex items-center justify-center flex-shrink-0"
                              style={{ background: `linear-gradient(135deg, ${gF}, ${gT})` }}>{initials}</div>
                            <Text size="sm" weight={selected ? 'semibold' : 'medium'} truncate className="flex-1 text-left"
                              style={{ color: selected ? 'var(--cricket)' : undefined }}>{p.name}</Text>
                            {selected && <CheckCircle2 size={20} className="flex-shrink-0" style={{ color: 'var(--cricket)' }} />}
                          </button>
                        );
                      })}
                      {showMe === false && filteredOthers.length === 0 && (
                        <Text as="p" size="xs" color="dim" className="text-center py-4">No players match &ldquo;{paidBySearch}&rdquo;</Text>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Split between — search + avatar grid */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider">Split Between</Text>
            <Text size="2xs" weight="bold" style={{ color: 'var(--cricket)' }}>{selectedCount} selected</Text>
          </div>

          {/* Search + Select All row */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-8 text-[13px] outline-none focus:border-[var(--cricket)] transition-colors"
                style={{ color: 'var(--text)' }}
              />
              {playerSearch && (
                <button onClick={() => setPlayerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--dim)] hover:text-[var(--text)]">
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={selectAll}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 cursor-pointer transition-all active:scale-95 border flex-shrink-0"
              style={{ borderColor: selectedPlayerIds.size === activePlayers.length ? 'var(--cricket)' : 'var(--border)', background: selectedPlayerIds.size === activePlayers.length ? 'color-mix(in srgb, var(--cricket) 12%, transparent)' : 'transparent', color: selectedPlayerIds.size === activePlayers.length ? 'var(--cricket)' : 'var(--muted)' }}>
              <Users size={12} />
              <Text size="2xs" weight="bold">All</Text>
            </button>
          </div>

          {/* Player avatar grid */}
          <div className="grid grid-cols-4 gap-2">
            {filteredPlayers.map((p) => {
              const selected = selectedPlayerIds.has(p.id);
              const [gFrom, gTo] = nameToGradient(p.name);
              const initials = p.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              const isPayer = p.id === effectivePaidBy;
              return (
                <button key={p.id} onClick={() => togglePlayer(p.id)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-2.5 px-1 cursor-pointer transition-all active:scale-95"
                  style={{ background: selected ? 'color-mix(in srgb, var(--cricket) 10%, transparent)' : 'transparent', border: selected ? '1.5px solid color-mix(in srgb, var(--cricket) 40%, transparent)' : '1.5px solid transparent' }}>
                  <div className="relative">
                    <div className="h-10 w-10 rounded-full text-[12px] font-bold text-white flex items-center justify-center transition-all"
                      style={{ background: `linear-gradient(135deg, ${gFrom}, ${gTo})`, opacity: selected ? 1 : 0.5 }}>{initials}</div>
                    {selected && (
                      <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--cricket)', border: '2px solid var(--card)' }}>
                        <Check size={9} className="text-white" />
                      </div>
                    )}
                  </div>
                  <Text size="2xs" weight={selected ? 'bold' : 'medium'} truncate className="w-full text-center"
                    style={{ color: selected ? 'var(--cricket)' : 'var(--muted)' }}>
                    {p.name.split(' ')[0]}{p.is_guest ? ' (G)' : ''}{isPayer ? ' $' : ''}
                  </Text>
                </button>
              );
            })}
          </div>
          {playerSearch && filteredPlayers.length === 0 && (
            <Text as="p" size="xs" color="dim" className="text-center py-4">No players match &ldquo;{playerSearch}&rdquo;</Text>
          )}
        </div>

        <SegmentedControl options={[{ key: 'equal', label: 'Equal Split' }, { key: 'custom', label: 'Custom' }]} active={splitType} onChange={(key) => setSplitType(key as 'equal' | 'custom')} />

        {splitType === 'equal' && selectedCount > 0 && numAmount > 0 && (
          <div className="rounded-xl p-3 flex items-center gap-2"
            style={{ background: 'color-mix(in srgb, var(--cricket) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cricket) 20%, transparent)' }}>
            <Text size="sm" color="muted"><Text weight="bold" style={{ color: 'var(--cricket)' }}>${perPerson.toFixed(2)}</Text>{' per person'}</Text>
          </div>
        )}

        {splitType === 'custom' && selectedCount > 0 && (
          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            {Array.from(selectedPlayerIds).map((playerId) => {
              const player = activePlayers.find((p) => p.id === playerId);
              if (!player) return null;
              return (
                <div key={playerId} className="flex items-center gap-3">
                  <Text size="sm" weight="medium" truncate className="flex-1">{player.name}</Text>
                  <div className="flex items-center gap-1">
                    <Text size="sm" color="muted">$</Text>
                    <input type="text" inputMode="decimal" value={customAmounts[playerId] || ''}
                      onChange={(e) => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setCustomAmounts((prev) => ({ ...prev, [playerId]: e.target.value })); }}
                      className="w-20 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[14px] font-semibold text-right outline-none focus:border-[var(--cricket)] transition-colors"
                      style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-[var(--border)]/50 flex items-center justify-between">
              <Text size="xs" color="muted" weight="medium">Remaining</Text>
              <Text size="sm" weight="bold" tabular style={{ color: Math.abs(remaining) < 0.01 ? 'var(--split-credit)' : remaining > 0 ? 'var(--cricket)' : 'var(--split-owe)' }}>${remaining.toFixed(2)}</Text>
            </div>
          </div>
        )}

        <div>
          {/* Validation hint — explains why button is disabled */}
          {!canSubmit && (numAmount > 0 || selectedCount > 0) && (
            <Text as="p" size="xs" color="dim" className="text-center mb-2">
              {numAmount <= 0 ? 'Enter an amount' : !effectivePaidBy ? 'Select who paid' : selectedCount < 2 ? 'Select at least 2 people' : splitType === 'custom' && Math.abs(remaining) >= 0.01 ? `Custom amounts must total $${numAmount.toFixed(2)}` : ''}
            </Text>
          )}

          <Button onClick={handleSubmit} disabled={!canSubmit} variant="primary" brand="cricket" size="xl" fullWidth>
            {editingSplitId ? 'Update' : 'Split'} ${numAmount > 0 ? numAmount.toFixed(2) : '0.00'}
          </Button>
        </div>
      </DrawerBody>
    </Drawer>
  );
}
