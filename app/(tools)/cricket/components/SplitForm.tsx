'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ComposerModal } from '@/components/ui';
import { Button, Text } from '@/components/ui';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Input } from '@/components/ui/input';
import { useCricketStore } from '@/stores/cricket-store';
import { useSplitsStore } from '@/stores/splits-store';
import { useAuthStore } from '@/stores/auth-store';
import { computeSplitAmounts } from '../lib/utils';
import { playerLabels } from '../lib/player-labels';
import { compressReceiptImage } from '../lib/image';
import { cn } from '@/lib/utils';
import PlayerAvatar from './PlayerAvatar';
import { ReceiptAttach, ReceiptThumb } from './ReceiptAttach';
import { SPLIT_FORM_KEY, readSplitDraft, type SplitDraft } from '../lib/split-draft';
import { toast } from 'sonner';
import { Check, ChevronRight, Cookie, CupSoda, Utensils, Package, Users, Search, X } from 'lucide-react';
import type { SplitCategory } from '@/types/cricket';

const isUrlPdf = (url: string) => url.split('?')[0].toLowerCase().endsWith('.pdf');
const MAX_RECEIPTS = 10;


type CategoryDef = { key: SplitCategory; label: string; icon: React.ReactNode };

const SPLIT_CATEGORIES: CategoryDef[] = [
  { key: 'snacks', label: 'Snacks', icon: <Cookie size={20} /> },
  { key: 'drinks', label: 'Drinks', icon: <CupSoda size={20} /> },
  { key: 'food', label: 'Food', icon: <Utensils size={20} /> },
  { key: 'other', label: 'Other', icon: <Package size={20} /> },
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

  // Disambiguated grid labels (shared with the umpiring roster) — computed
  // over the WHOLE roster, not the filtered list, so a person's label never
  // changes as the search narrows.
  const gridLabels = useMemo(() => playerLabels(activePlayers), [activePlayers]);

  const myPlayer = useMemo(
    () => {
      const myEmail = user?.email?.toLowerCase().trim();
      if (!myEmail) return undefined;
      return activePlayers.find((p) => p.email?.toLowerCase().trim() === myEmail);
    },
    [activePlayers, user?.email],
  );

  const [draft] = useState(() => (editingSplitId ? null : readSplitDraft()));
  const [amount, setAmount] = useState(draft?.amount ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [category, setCategory] = useState<SplitCategory>(draft?.category ?? 'snacks');
  const [paidById, setPaidById] = useState<string | null>(draft?.paidById ?? null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(() => new Set(draft?.playerIds ?? []));
  const [splitType, setSplitType] = useState<'equal' | 'custom'>(draft?.splitType ?? 'equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(draft?.customAmounts ?? {});
  const [showPaidByPicker, setShowPaidByPicker] = useState(false);
  const [paidBySearch, setPaidBySearch] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');

  // Receipt state — existing URLs (edit mode) + newly picked files
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<{ preview: string; compressed: Blob | null; isPdf: boolean; fileName: string }[]>([]);
  const [compressingCount, setCompressingCount] = useState(0);
  const [pendingRemove, setPendingRemove] = useState<{ type: 'existing' | 'new'; index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compressing = compressingCount > 0;

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => { newFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      setExistingUrls(editingSplit.receipt_urls ?? []);
      setNewFiles([]);
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

  useEffect(() => {
    if (!showSplitForm || editingSplitId) return;
    if (!amount && !description && selectedPlayerIds.size === 0) return;
    try {
      const d: SplitDraft = { amount, description, category, paidById, playerIds: [...selectedPlayerIds], splitType, customAmounts };
      sessionStorage.setItem(SPLIT_FORM_KEY, JSON.stringify(d));
    } catch { /* storage full or blocked — the draft is a convenience */ }
  }, [showSplitForm, editingSplitId, amount, description, category, paidById, selectedPlayerIds, splitType, customAmounts]);

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
    newFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setExistingUrls([]); setNewFiles([]); setPendingRemove(null);
    // Defensive: reset compression counter so a stale increment can't keep the submit button disabled
    setCompressingCount(0);
    try { sessionStorage.removeItem(SPLIT_FORM_KEY); } catch { /* ignore */ }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const used = existingUrls.length + newFiles.length;
    const remaining = MAX_RECEIPTS - used;
    const selected = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`Max ${MAX_RECEIPTS} receipts. Only adding ${remaining} more.`);
    }

    for (const file of selected) {
      const isImg = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImg && !isPdf) { toast.error(`${file.name}: only images and PDFs are supported.`); continue; }

      const preview = isPdf ? '' : URL.createObjectURL(file);
      if (isPdf) {
        setNewFiles((prev) => [...prev, { preview, compressed: file, isPdf: true, fileName: file.name }]);
      } else {
        setNewFiles((prev) => [...prev, { preview, compressed: null, isPdf: false, fileName: file.name }]);
        setCompressingCount((c) => c + 1);
        try {
          const compressed = await compressReceiptImage(file);
          setNewFiles((prev) => prev.map((f) => f.preview === preview ? { ...f, compressed } : f));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Failed to compress ${file.name}`);
          setNewFiles((prev) => {
            if (preview) URL.revokeObjectURL(preview);
            return prev.filter((f) => f.preview !== preview);
          });
        } finally {
          setCompressingCount((c) => c - 1);
        }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmRemove = () => {
    if (!pendingRemove) return;
    if (pendingRemove.type === 'existing') {
      setExistingUrls((prev) => prev.filter((_, i) => i !== pendingRemove.index));
    } else {
      const target = newFiles[pendingRemove.index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      setNewFiles((prev) => prev.filter((_, i) => i !== pendingRemove.index));
    }
    setPendingRemove(null);
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

    const newBlobs = newFiles.map((f) => f.compressed).filter(Boolean) as Blob[];

    if (editingSplitId) {
      updateSplit(
        editingSplitId,
        { ...splitData, receipt_urls: existingUrls.length > 0 ? existingUrls : null },
        newShares,
        newBlobs.length > 0 ? newBlobs : undefined,
      );
    } else {
      addSplit(
        user.id, selectedSeasonId, splitData, newShares,
        myPlayer?.name ?? user.user_metadata?.full_name as string ?? 'Unknown',
        newBlobs.length > 0 ? newBlobs : undefined,
      );
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

  const payer = activePlayers.find((pl) => pl.id === effectivePaidBy);
  const allSelected = activePlayers.length > 0 && selectedPlayerIds.size === activePlayers.length;
  const pendingLabel = pendingRemove
    ? `Receipt ${pendingRemove.type === 'existing' ? pendingRemove.index + 1 : existingUrls.length + pendingRemove.index + 1}`
    : null;

  // One pick-list row for the "Paid by" picker — iOS style: name, detail,
  // a checkmark on the chosen row. Selection is neutral, never the accent.
  const payerRow = (p: (typeof activePlayers)[number], isMe: boolean) => {
    const selected = p.id === effectivePaidBy;
    return (
      <button key={p.id} onClick={() => { handlePaidBySelect(p.id); setPaidBySearch(''); }}
        aria-pressed={selected}
        className="w-full flex items-center gap-3 px-3 min-h-[52px] cursor-pointer transition-colors active:bg-[var(--hover-bg)]">
        <PlayerAvatar player={p} name={p.name} size={32} />
        <span className="flex-1 min-w-0 text-left">
          <Text as="span" size="md" weight={selected ? 'semibold' : 'medium'} truncate className="block">{isMe ? 'You' : p.name}</Text>
          {isMe && <Text as="span" size="xs" color="muted" className="block">{p.name}</Text>}
        </span>
        <Check size={20} aria-hidden className="shrink-0 text-[var(--text)]" style={{ opacity: selected ? 1 : 0 }} />
      </button>
    );
  };

  return (
    <ComposerModal
      open={showSplitForm}
      onClose={() => { resetForm(); setShowSplitForm(false); }}
      title={editingSplitId ? 'Edit Split' : 'New Split'}
      footer={
        <div>
          {/* Explains why the button is disabled */}
          {(!canSubmit || compressing) && (numAmount > 0 || selectedCount > 0 || compressing) && (
            <Text as="p" size="sm" color="muted" className="text-center mb-2">
              {compressing ? 'Compressing receipts…' : numAmount <= 0 ? 'Enter an amount' : !effectivePaidBy ? 'Choose who paid' : selectedCount < 2 ? 'Pick at least 2 people' : splitType === 'custom' && Math.abs(remaining) >= 0.01 ? `Custom amounts must total $${numAmount.toFixed(2)}` : ''}
            </Text>
          )}
          <Button onClick={handleSubmit} disabled={!canSubmit || compressing} variant="primary" brand="cricket" size="lg" fullWidth>
            {compressing ? 'Compressing…' : `${editingSplitId ? 'Update' : 'Split'}${numAmount > 0 ? ` $${numAmount.toFixed(2)}` : ''}`}
          </Button>
        </div>
      }
    >
      {/* Four groups — what, who paid, who shares, receipts. Tight inside a
          group, generous between, so the form reads as steps not a list. */}
      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-4">
        {/* The amount IS the heading — no label above it */}
        <div className="flex items-baseline justify-center gap-0.5 pt-4 pb-1">
          <span className="text-[30px] font-semibold leading-none text-[var(--dim)]">$</span>
          <input
            type="text" inputMode="decimal" value={amount}
            onChange={(e) => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value); }}
            placeholder="0.00"
            aria-label="Total amount in dollars"
            // Sized to its own text so the "$" sits against the figure
            className="bg-transparent text-left outline-none font-bold text-[44px] leading-none tracking-tight max-w-[240px] placeholder:text-[var(--dim)]"
            style={{ width: `${(amount || '0.00').length + 0.5}ch`, color: 'var(--text)', caretColor: 'var(--cricket)', fontVariantNumeric: 'tabular-nums' }}
          />
        </div>

        <Input label="Description" placeholder="Chai, snacks, uber…" value={description} onChange={(e) => setDescription(e.target.value)} brand="cricket" />

        <div>
          <Text as="p" id="split-category-label" size="sm" weight="medium" color="muted" className="mb-1">Category</Text>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby="split-category-label">
            {SPLIT_CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <button key={c.key} role="radio" aria-checked={active} onClick={() => setCategory(c.key)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 rounded-xl min-h-[64px] cursor-pointer transition-[background-color,box-shadow,transform] active:scale-95',
                    active
                      ? 'bg-[var(--card)] text-[var(--text)] shadow-[inset_0_0_0_2px_var(--text)]'
                      : 'bg-[var(--fill)] text-[var(--muted)]',
                  )}>
                  {c.icon}
                  <span className={cn('text-[12px] leading-tight', active ? 'font-semibold' : 'font-medium')}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        </section>

        {/* Paid by */}
        <section>
          <Text as="p" size="sm" weight="medium" color="muted" className="mb-1">Paid by</Text>
          {!showPaidByPicker ? (
            payer ? (
              <div className="flex items-center gap-3 min-h-[48px]">
                <PlayerAvatar player={payer} name={payer.name} size={36} />
                <span className="flex-1 min-w-0">
                  <Text as="span" size="md" weight="semibold" truncate className="block">{payer.id === myPlayer?.id ? 'You' : payer.name}</Text>
                  {payer.id === myPlayer?.id && <Text as="span" size="xs" color="muted" className="block">{payer.name}</Text>}
                </span>
                <Button variant="tinted" brand="cricket" size="sm" className="h-9 px-3.5 text-[13px] font-semibold"
                  onClick={() => { setShowPaidByPicker(true); setPaidBySearch(''); }}>
                  Change
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowPaidByPicker(true)}
                className="w-full flex items-center justify-between gap-2 rounded-xl px-4 min-h-[48px] bg-[var(--fill)] cursor-pointer active:scale-[0.98] transition-transform"
              >
                <Text size="md" weight="medium">Choose who paid</Text>
                <ChevronRight size={18} className="text-[var(--dim)]" />
              </button>
            )
          ) : (
            <div className="rounded-2xl bg-[var(--surface)] overflow-hidden animate-fade-in">
              <div className="flex items-center gap-2 pl-3 border-b border-[var(--border)]">
                <Search size={16} className="text-[var(--dim)] flex-shrink-0" />
                <input
                  type="text" value={paidBySearch} onChange={(e) => setPaidBySearch(e.target.value)}
                  placeholder="Search players…"
                  aria-label="Search who paid"
                  className="flex-1 min-w-0 bg-transparent text-[16px] outline-none placeholder:text-[var(--dim)]"
                  style={{ color: 'var(--text)' }}
                />
                <button onClick={() => { setShowPaidByPicker(false); setPaidBySearch(''); }}
                  aria-label="Close player list"
                  className="cursor-pointer text-[var(--muted)] active:text-[var(--text)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[260px] overflow-y-auto overscroll-contain divide-y divide-[var(--border)]">
                {(() => {
                  const q = paidBySearch.toLowerCase().trim();
                  // "You" pinned at top, then everyone else alphabetically
                  const others = activePlayers.filter((p) => p.id !== myPlayer?.id);
                  const filteredOthers = q ? others.filter((p) => p.name.toLowerCase().includes(q)) : others;
                  const showMe = myPlayer && (!q || myPlayer.name.toLowerCase().includes(q) || 'you'.includes(q));
                  return (
                    <>
                      {showMe && myPlayer && payerRow(myPlayer, true)}
                      {filteredOthers.map((p) => payerRow(p, false))}
                      {!showMe && filteredOthers.length === 0 && (
                        <Text as="p" size="sm" color="muted" className="text-center py-5">No players match &ldquo;{paidBySearch}&rdquo;</Text>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </section>

        {/* Split between — search + avatar grid */}
        <section className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <Text as="p" size="sm" weight="medium" color="muted">Split between</Text>
            {selectedCount > 0 && <Text size="xs" weight="medium" color="muted" tabular>{selectedCount} selected</Text>}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)] pointer-events-none" />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search players…"
                aria-label="Search players to split with"
                className="w-full rounded-xl bg-[var(--fill)] pl-9 pr-10 min-h-11 text-[16px] outline-none placeholder:text-[var(--dim)] focus:ring-1 focus:ring-[var(--cricket)]/50 transition-shadow"
                style={{ color: 'var(--text)' }}
              />
              {playerSearch && (
                <button onClick={() => setPlayerSearch('')} aria-label="Clear search"
                  className="absolute right-0 top-0 h-11 w-10 flex items-center justify-center cursor-pointer text-[var(--dim)] active:text-[var(--text)]">
                  <X size={15} />
                </button>
              )}
            </div>
            <Button variant="secondary" size="md" onClick={selectAll} aria-pressed={allSelected}
              className="h-11 gap-1.5 flex-shrink-0">
              <Users size={15} />
              {allSelected ? 'Clear' : 'All'}
            </Button>
          </div>

          {/* 3 columns, not 4: the roster has two Venkats, and first-name-only
              tiles at 4-up made them indistinguishable at exactly the moment
              money is being split. Labels come from the shared playerLabels
              disambiguator, so a duplicate first name carries its surname. */}
          <div className="grid grid-cols-3 gap-x-2 gap-y-1">
            {filteredPlayers.map((p) => {
              const selected = selectedPlayerIds.has(p.id);
              const isPayer = p.id === effectivePaidBy;
              const label = gridLabels.get(p.id);
              const secondary = [isPayer ? 'Paid' : null, label?.secondary].filter(Boolean).join(' · ');
              return (
                <button key={p.id} onClick={() => togglePlayer(p.id)}
                  aria-pressed={selected}
                  aria-label={`${p.name}${p.jersey_number != null ? `, jersey ${p.jersey_number}` : ''}${p.is_guest ? ', guest' : ''}${isPayer ? ', paid' : ''}`}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl pt-2.5 pb-1.5 px-1 cursor-pointer transition-[background-color,transform] active:scale-95',
                    selected ? 'bg-[var(--fill)]' : 'bg-transparent',
                  )}>
                  {/* Full strength whether picked or not; dimming read as "unavailable" */}
                  <span className="relative">
                    <PlayerAvatar player={p} name={p.name} size={40} />
                    {selected && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] rounded-full flex items-center justify-center bg-[var(--text)]"
                        style={{ boxShadow: '0 0 0 2px var(--card)' }}>
                        <Check size={11} strokeWidth={3} className="text-[var(--card)]" />
                      </span>
                    )}
                  </span>
                  <span className="flex min-h-[28px] w-full flex-col items-center justify-start leading-tight">
                    <span className={cn('block w-full truncate text-center text-[12px]', selected ? 'font-semibold text-[var(--text)]' : 'font-medium text-[var(--muted)]')}>
                      {label?.primary ?? p.name.split(' ')[0]}{p.is_guest ? ' (G)' : ''}
                    </span>
                    {secondary && (
                      <span className="block w-full truncate text-center text-[10px] text-[var(--dim)]">{secondary}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {playerSearch && filteredPlayers.length === 0 && (
            <Text as="p" size="sm" color="muted" className="text-center py-4">No players match &ldquo;{playerSearch}&rdquo;</Text>
          )}
        </div>

        <SegmentedControl ariaLabel="How to split" options={[{ key: 'equal', label: 'Equal' }, { key: 'custom', label: 'Custom' }]} active={splitType} onChange={(key) => setSplitType(key as 'equal' | 'custom')} />

        {splitType === 'equal' && selectedCount > 0 && numAmount > 0 && (
          <div className="rounded-xl bg-[var(--surface)] px-4 py-3 flex items-baseline justify-between gap-2">
            <Text size="md" color="muted">{selectedCount} {selectedCount === 1 ? 'person' : 'people'}</Text>
            <Text size="md"><Text weight="bold" tabular>${perPerson.toFixed(2)}</Text> each</Text>
          </div>
        )}

        {splitType === 'custom' && selectedCount > 0 && (
          <div className="rounded-xl bg-[var(--surface)] px-4 py-1">
            <div className="divide-y divide-[var(--border)]">
              {Array.from(selectedPlayerIds).map((playerId) => {
                const player = activePlayers.find((p) => p.id === playerId);
                if (!player) return null;
                return (
                  <div key={playerId} className="flex items-center gap-3 py-2">
                    <Text size="md" weight="medium" truncate className="flex-1">{player.name}</Text>
                    <div className="flex items-center gap-1">
                      <Text size="md" color="muted">$</Text>
                      <input type="text" inputMode="decimal" value={customAmounts[playerId] || ''}
                        aria-label={`${player.name}'s share in dollars`}
                        placeholder="0.00"
                        onChange={(e) => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setCustomAmounts((prev) => ({ ...prev, [playerId]: e.target.value })); }}
                        className="w-24 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 min-h-10 text-[16px] font-semibold text-right outline-none placeholder:text-[var(--dim)] focus:border-[var(--cricket)] transition-colors"
                        style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="py-2.5 border-t border-[var(--border)] flex items-center justify-between">
              <Text size="sm" color="muted" weight="medium">Remaining</Text>
              <Text size="md" weight="bold" tabular style={{ color: Math.abs(remaining) < 0.01 ? 'var(--split-credit)' : remaining > 0 ? 'var(--text)' : 'var(--split-owe)' }}>${remaining.toFixed(2)}</Text>
            </div>
          </div>
        )}

        </section>

        <ReceiptAttach
          inputRef={fileInputRef}
          onChange={handleFileSelect}
          compressing={compressing}
          count={existingUrls.length + newFiles.length}
          pendingLabel={pendingLabel}
          onCancelRemove={() => setPendingRemove(null)}
          onConfirmRemove={confirmRemove}
        >
          {existingUrls.map((url, i) => (
            <ReceiptThumb
              key={`existing-${i}`}
              src={isUrlPdf(url) ? null : url}
              name={`Receipt ${i + 1}.pdf`}
              onRemove={() => setPendingRemove({ type: 'existing', index: i })}
              removeLabel={`Remove receipt ${i + 1}`}
            />
          ))}
          {newFiles.map((f, i) => (
            <ReceiptThumb
              key={`new-${i}`}
              src={f.isPdf ? null : f.preview}
              name={f.fileName}
              busy={!f.compressed}
              onRemove={() => setPendingRemove({ type: 'new', index: i })}
              removeLabel={`Remove receipt ${existingUrls.length + i + 1}`}
            />
          ))}
        </ReceiptAttach>
      </div>
    </ComposerModal>
  );
}
