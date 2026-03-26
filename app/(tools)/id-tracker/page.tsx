'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useIDTrackerStore } from '@/stores/id-tracker-store';
import { isCloudMode } from '@/lib/supabase/client';
import { AuthGate } from '@/components/AuthGate';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { IDDocument, IDCountry } from '@/types/id-tracker';
import { ID_TYPES, DEFAULT_REMINDER_DAYS, REMINDER_OPTIONS } from './lib/constants';
import type { IDTypeConfig } from './lib/constants';
import { getUrgency, getDaysLeft, formatDate, formatDaysLeft } from './lib/utils';
import type { UrgencyLevel } from './lib/utils';
import {
  ShieldCheck, Globe, Globe2, FileCheck, Building2, Car, Plane, IdCard, Lock,
  ScanLine, Landmark, Fingerprint, CreditCard, Calendar, Bell, ExternalLink,
  Plus, X, MoreVertical, AlertTriangle, XCircle, CheckSquare, User, Edit3,
  Trash2, FileText, type LucideIcon,
} from 'lucide-react';

/* ── Person avatar colors ── */
const PERSON_COLORS = [
  'linear-gradient(135deg, #0369a1, #0ea5e9)', // ocean blue
  'linear-gradient(135deg, #0d9488, #14b8a6)', // teal
  'linear-gradient(135deg, #2563eb, #3b82f6)', // blue
  'linear-gradient(135deg, #e11d48, #f43f5e)', // rose
  'linear-gradient(135deg, #ea580c, #f97316)', // orange
  'linear-gradient(135deg, #16a34a, #22c55e)', // green
  'linear-gradient(135deg, #0284c7, #38bdf8)', // sky blue
  'linear-gradient(135deg, #0891b2, #06b6d4)', // cyan
];

function getPersonColor(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length];
}

/* ── Icon map ── */
const ICON_MAP: Record<string, LucideIcon> = {
  Globe, Globe2, FileCheck, Building2, Car, Plane, IdCard, Lock, ScanLine, Landmark, Fingerprint, CreditCard, ShieldCheck, CheckSquare, FileText,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || ShieldCheck;
}

/* ── Urgency config ── */
const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; color: string; bg: string; border: string }> = {
  expired:  { label: 'EXPIRED', color: 'var(--red)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.4)' },
  critical: { label: 'EXPIRING SOON', color: 'var(--orange)', bg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.3)' },
  warning:  { label: 'COMING UP', color: '#FBBF24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' },
  ontrack:  { label: 'ON TRACK', color: 'var(--blue)', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)' },
  safe:     { label: 'ALL GOOD', color: 'var(--green)', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)' },
  noexpiry: { label: 'NO EXPIRY', color: 'var(--muted)', bg: 'transparent', border: 'var(--border)' },
};

/* ── Helpers ── */
function progressWidth(daysLeft: number | null): number {
  if (daysLeft === null) return 0;
  if (daysLeft <= 0) return 0;
  const maxDays = 365 * 10;
  return Math.min((daysLeft / maxDays) * 100, 100);
}

function getTypeConfig(idType: string): IDTypeConfig | undefined {
  return ID_TYPES.find((t) => t.key === idType);
}

/* ── Card Menu (portal) ── */
function CardMenu({ anchorRef, onEdit, onDelete, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const menuWidth = 140;
      const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
      setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }

    // Close on scroll or resize
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <>
      {/* Invisible backdrop to catch taps */}
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div
        className="fixed z-[100] w-[140px] rounded-xl overflow-hidden shadow-2xl animate-[scaleIn_0.1s]"
        style={{ top: pos.top, left: pos.left, background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <button
          onClick={() => { onEdit(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--text)' }}
        >
          <Edit3 size={14} style={{ color: 'var(--blue)' }} />
          Edit
        </button>
        <button
          onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--red)' }}
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </>,
    document.body,
  );
}

/* ── Delete Confirmation ── */
function DeleteConfirm({ doc, onConfirm, onCancel }: { doc: IDDocument; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-[360px]" showClose={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }}>
              <Trash2 size={20} style={{ color: 'var(--red)' }} />
            </div>
            <div>
              <DialogTitle className="text-[16px]">Delete ID?</DialogTitle>
              <DialogDescription>{doc.label}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Text as="p" size="sm" color="muted">This action cannot be undone.</Text>
        <DialogFooter className="mt-4">
          <Button variant="danger" className="flex-1" onClick={onConfirm}>
            Delete
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── ID Card ── */
function IDCard({ doc, onEdit, onDelete, owners }: { doc: IDDocument; onEdit: () => void; onDelete: () => void; owners: string[] }) {
  const urgency = getUrgency(doc.expiry_date);
  const daysLeft = getDaysLeft(doc.expiry_date);
  const config = URGENCY_CONFIG[urgency];
  const typeConfig = getTypeConfig(doc.id_type);
  const IconComp = typeConfig ? getIcon(typeConfig.iconName) : ShieldCheck;
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="rounded-xl border-l-[3px] border border-[var(--border)] transition-all duration-200 hover:shadow-md cursor-pointer overflow-hidden"
      style={{ borderLeftColor: config.color, background: config.bg }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in srgb, ${config.color} 15%, transparent)` }}>
          <IconComp size={18} style={{ color: config.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <Text as="div" size="md" weight="semibold" className="leading-snug">{doc.label}</Text>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {doc.label !== (typeConfig?.label || doc.id_type) && (
              <Text size="xs" color="muted">
                {typeConfig?.label || doc.id_type}
              </Text>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: getPersonColor(owners.indexOf(doc.owner_name)), color: '#fff' }}>
              {doc.owner_name}
            </span>
          </div>
        </div>

        <div className="shrink-0 w-[90px] lg:w-[130px]">
          {urgency !== 'noexpiry' ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block ${urgency === 'expired' ? 'animate-pulse' : ''}`}
                  style={{ background: `color-mix(in srgb, ${config.color} 18%, transparent)`, color: config.color }}>
                  {daysLeft !== null && daysLeft < 0
                    ? `${formatDaysLeft(doc.expiry_date)} overdue`
                    : formatDaysLeft(doc.expiry_date)}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full" style={{ width: `${progressWidth(daysLeft)}%`, background: config.color }} />
              </div>
            </div>
          ) : (
            <Text size="2xs" weight="medium" color="dim">No expiry</Text>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            ref={menuBtnRef}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--hover-bg)]"
            style={{ color: 'var(--dim)' }}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <CardMenu
              anchorRef={menuBtnRef}
              onEdit={onEdit}
              onDelete={onDelete}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 animate-[slideIn_0.15s]" onClick={(e) => e.stopPropagation()}>
          <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            {urgency !== 'noexpiry' && doc.expiry_date && (
              <div className="mb-3 flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Calendar size={16} style={{ color: config.color }} />
                <div className="flex-1">
                  <Text as="div" size="md" weight="semibold">
                    Expires {formatDate(doc.expiry_date)}
                  </Text>
                  <Text as="div" size="xs" weight="medium" style={{ color: config.color }}>
                    {daysLeft !== null && daysLeft < 0
                      ? `${formatDaysLeft(doc.expiry_date)} overdue`
                      : `${formatDaysLeft(doc.expiry_date)} remaining`}
                  </Text>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${urgency === 'expired' ? 'animate-pulse' : ''}`}
                  style={{ background: `color-mix(in srgb, ${config.color} 18%, transparent)`, color: config.color }}>
                  {config.label}
                </span>
              </div>
            )}

            {doc.description && (
              <Text as="p" size="sm" color="muted" className="mb-3">{doc.description}</Text>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {doc.reminder_days.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg"
                    style={{ background: 'var(--surface)', color: 'var(--dim)', border: '1px solid var(--border)' }}>
                    <Bell size={10} />{r}d
                  </span>
                ))}
              </div>
              {doc.renewal_url && (
                <a href={doc.renewal_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold transition-opacity hover:opacity-80"
                  style={{ color: 'var(--blue)' }}
                  onClick={(e) => e.stopPropagation()}>
                  Renew <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Add / Edit Modal ── */
function IDFormModal({ onClose, owners, editDoc }: { onClose: (savedOwner?: string) => void; owners: string[]; editDoc: IDDocument | null }) {
  const { user } = useAuthStore();
  const store = useIDTrackerStore();

  // Lock body scroll when modal is open
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  const editTypeConfig = editDoc ? getTypeConfig(editDoc.id_type) : null;

  const [modalCountry, setModalCountry] = useState<IDCountry>(editDoc?.country || 'US');
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(editDoc?.id_type || null);
  const [selectedOwner, setSelectedOwnerLocal] = useState<string>(editDoc?.owner_name || owners[0] || '');
  const validOwners = owners.filter(o => o.trim());
  const [addingNewPerson, setAddingNewPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [label, setLabel] = useState(editDoc?.label || '');
  const [description, setDescription] = useState(editDoc?.description || '');
  const [expiryDate, setExpiryDate] = useState(editDoc?.expiry_date || '');
  const [renewalUrl, setRenewalUrl] = useState(editDoc?.renewal_url || '');
  const [reminderDays, setReminderDays] = useState<number[]>(editDoc?.reminder_days || DEFAULT_REMINDER_DAYS);

  const filteredTypes = ID_TYPES.filter((t) => t.country === modalCountry);
  const selectedConfig = selectedTypeKey ? ID_TYPES.find((t) => t.key === selectedTypeKey) : null;
  const showExpiry = selectedConfig ? selectedConfig.hasExpiry : true;

  function handleSelectType(key: string) {
    if (selectedTypeKey === key) {
      setSelectedTypeKey(null);
      return;
    }
    setSelectedTypeKey(key);
    const config = ID_TYPES.find((t) => t.key === key);
    if (config) {
      if (!editDoc) setLabel(config.label);
      if (config.defaultRenewalUrl) setRenewalUrl(config.defaultRenewalUrl);
      if (!config.hasExpiry) setExpiryDate('');
    }
  }

  const [showReminderToast, setShowReminderToast] = useState(false);

  function toggleReminder(value: number) {
    setReminderDays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => b - a),
    );
    setShowReminderToast(true);
    setTimeout(() => setShowReminderToast(false), 2500);
  }

  function handleSave() {
    const typeConfig = ID_TYPES.find(t => t.key === selectedTypeKey);
    const needsExpiry = typeConfig?.hasExpiry !== false;
    if (!selectedTypeKey || !label.trim() || !selectedOwner.trim()) return;
    if (needsExpiry && !expiryDate) return;
    const userId = user?.id || '';

    const docData = {
      id_type: selectedTypeKey,
      country: modalCountry,
      label: label.trim(),
      owner_name: selectedOwner.trim(),
      description: description.trim(),
      expiry_date: expiryDate || null,
      renewal_url: renewalUrl.trim(),
      reminder_days: reminderDays,
    };

    if (editDoc) {
      store.updateDocument(editDoc.id, docData);
      toast.success('ID updated');
    } else {
      store.addDocument(userId, docData);
      toast.success('ID added');
    }

    onClose(selectedOwner.trim());
  }

  const selectedTypeConfig = ID_TYPES.find(t => t.key === selectedTypeKey);
  const needsExpiry = selectedTypeConfig?.hasExpiry !== false;
  const canSave = !!selectedTypeKey && !!label.trim() && !!selectedOwner.trim() && (!needsExpiry || !!expiryDate);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={() => onClose()}
    >
      <div
        className="w-full lg:w-[520px] lg:max-h-[85vh] max-h-[90vh] overflow-y-auto rounded-t-2xl lg:rounded-2xl p-5"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
          animation: 'slideUp 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <Text as="h2" size="xl" weight="bold" className="text-[18px]">
            {editDoc ? 'Edit ID' : 'Add New ID'}
          </Text>
          <button
            onClick={() => onClose()}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--hover-bg)]"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Belongs to — member picker */}
        <div className="mb-5">
          <Text as="label" size="sm" weight="semibold" className="block mb-3">
            Who does this ID belong to?
          </Text>

          {/* First time — no members yet, show prominent input */}
          {(() => {
            // Combine existing owners + currently typed new name
            const allOwners = [...validOwners];
            if (selectedOwner && !allOwners.includes(selectedOwner)) {
              allOwners.push(selectedOwner);
            }

            return allOwners.length === 0 && !addingNewPerson ? (
              <button
                onClick={() => setAddingNewPerson(true)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all hover:border-[var(--toolkit)]"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--toolkit), var(--toolkit-accent))' }}>
                  <User size={22} className="text-white" />
                </div>
                <div className="text-left">
                  <Text as="div" size="lg" weight="semibold">Add a family member</Text>
                  <Text as="div" size="sm" color="muted">Tap to enter a name — e.g. John, Sarah, Mom</Text>
                </div>
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allOwners.map((owner, idx) => {
                  const isActive = selectedOwner === owner;
                  // Match color with main page — find index in the full owners list
                  const colorIdx = owners.indexOf(owner);
                  const avatarColor = getPersonColor(colorIdx >= 0 ? colorIdx : idx);
                  return (
                    <button
                      key={owner}
                      onClick={() => setSelectedOwnerLocal(owner)}
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all cursor-pointer border-2 hover:border-[var(--muted)]"
                      style={{
                        background: 'var(--surface)',
                        borderColor: isActive ? 'var(--green)' : 'var(--border)',
                      }}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                        style={{ background: avatarColor }}>
                        {owner[0].toUpperCase()}
                      </div>
                      <Text size="md" weight="medium" color={isActive ? 'default' : 'muted'}>
                        {owner}
                      </Text>
                    </button>
                  );
                })}

                {/* Add another person */}
                <button
                  onClick={() => setAddingNewPerson(true)}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl cursor-pointer border transition-all hover:border-[var(--toolkit)] hover:shadow-sm"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--border)' }}>
                    <Plus size={15} style={{ color: 'var(--muted)' }} />
                  </div>
                  <Text size="md" weight="medium" color="muted">Add person</Text>
                </button>
              </div>
            );
          })()}

          {/* New person input overlay */}
          {addingNewPerson && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-2xl border animate-[slideIn_0.15s]"
              style={{ borderColor: 'var(--green)', background: 'var(--surface)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--toolkit)' }}>
                <User size={15} className="text-white" />
              </div>
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                placeholder="Enter name..."
                autoFocus
                className="flex-1 px-2 py-1.5 rounded-lg text-[14px] border-0 outline-none bg-transparent"
                style={{ color: 'var(--text)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPersonName.trim()) {
                    setSelectedOwnerLocal(newPersonName.trim());
                    setAddingNewPerson(false);
                    setNewPersonName('');
                  }
                  if (e.key === 'Escape') { setAddingNewPerson(false); setNewPersonName(''); }
                }}
              />
              <button
                onClick={() => { if (newPersonName.trim()) { setSelectedOwnerLocal(newPersonName.trim()); setAddingNewPerson(false); setNewPersonName(''); } }}
                disabled={!newPersonName.trim()}
                className="px-3 py-1.5 rounded-xl text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40"
                style={{ background: 'var(--toolkit)' }}>
                Done
              </button>
              <button
                onClick={() => { setAddingNewPerson(false); setNewPersonName(''); }}
                className="p-1.5 rounded-lg cursor-pointer hover:bg-[var(--hover-bg)]"
                style={{ color: 'var(--muted)' }}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Country tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--bg)' }}>
          {(['US', 'IN'] as const).map((c) => (
            <button
              key={c}
              onClick={() => { setModalCountry(c); if (!editDoc) setSelectedTypeKey(null); }}
              className="flex-1 text-[13px] font-semibold py-2 rounded-lg transition-all duration-200"
              style={{
                background: modalCountry === c ? 'var(--toolkit)' : 'transparent',
                color: modalCountry === c ? '#fff' : 'var(--muted)',
              }}
            >
              {c === 'US' ? 'US' : 'India'}
            </button>
          ))}
        </div>

        {/* ID type grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {filteredTypes.map((t) => {
            const IconComp = getIcon(t.iconName);
            const isSelected = selectedTypeKey === t.key;
            // Check if this person already has this ID type (skip check when editing)
            const alreadyExists = !editDoc && selectedOwner.trim() && store.documents.some(
              d => d.owner_name === selectedOwner.trim() && d.id_type === t.key
            );
            return (
              <button
                key={t.key}
                onClick={() => !alreadyExists && handleSelectType(t.key)}
                disabled={!!alreadyExists}
                className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all duration-200 text-left ${
                  alreadyExists ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                }`}
                style={{
                  background: isSelected ? 'color-mix(in srgb, var(--toolkit) 12%, transparent)' : 'var(--bg)',
                  borderColor: isSelected ? 'var(--toolkit)' : 'var(--border)',
                  color: isSelected ? 'var(--toolkit)' : 'var(--text)',
                }}
              >
                <IconComp size={18} className="shrink-0" />
                <span className="text-[13px] font-medium truncate">{t.label}</span>
                {alreadyExists && <span className="text-[10px] ml-auto shrink-0" style={{ color: 'var(--green)' }}>Added</span>}
              </button>
            );
          })}
        </div>

        {/* Form fields */}
        <div className="space-y-3 mb-5">
          <div>
            <Text as="label" size="xs" weight="medium" color="muted" className="block mb-1.5">Label</Text>
            <input
              type="text"
              placeholder="e.g. My US Passport"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[14px] border-2 outline-none transition-all focus:border-[#22c55e] focus:shadow-[0_0_0_4px_rgba(34,197,94,0.35)]"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <Text as="label" size="xs" weight="medium" color="muted" className="block mb-1.5">Description (optional)</Text>
            <input
              type="text"
              placeholder="Notes about this ID..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[14px] border-2 outline-none transition-all focus:border-[#22c55e] focus:shadow-[0_0_0_4px_rgba(34,197,94,0.35)]"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </div>

          {showExpiry && (
            <div>
              <Text as="label" size="xs" weight="medium" color="muted" className="block mb-1.5">Expiry Date</Text>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-[14px] border outline-none transition-colors focus:border-[var(--toolkit)]"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
          )}

          <div>
            <Text as="label" size="xs" weight="medium" color="muted" className="block mb-1.5">Renewal URL</Text>
            <input
              type="url"
              placeholder="https://..."
              value={renewalUrl}
              onChange={(e) => setRenewalUrl(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-[14px] border-2 outline-none transition-all focus:border-[#22c55e] focus:shadow-[0_0_0_4px_rgba(34,197,94,0.35)]"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <Text as="label" size="xs" weight="medium" color="muted" className="block mb-1.5">Reminders</Text>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((opt) => {
                const isActive = reminderDays.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleReminder(opt.value)}
                    className="inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-all"
                    style={{
                      background: isActive ? 'color-mix(in srgb, var(--toolkit) 12%, transparent)' : 'var(--bg)',
                      borderColor: isActive ? 'var(--toolkit)' : 'var(--border)',
                      color: isActive ? 'var(--toolkit)' : 'var(--dim)',
                    }}
                  >
                    <Bell size={11} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {showReminderToast && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl animate-[slideIn_0.15s]"
                style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)' }}>
                <Bell size={13} style={{ color: '#f59e0b' }} />
                <Text size="xs" weight="medium" style={{ color: '#f59e0b' }}>
                  Email reminders coming soon. Stay tuned!
                </Text>
              </div>
            )}
          </div>
        </div>

        {/* Missing fields hint */}
        {!canSave && (
          <Alert variant="warning" className="mb-3 flex flex-wrap gap-2 text-[13px] font-medium">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Please fill in: {[
              !selectedOwner.trim() && 'Person name',
              !selectedTypeKey && 'ID type',
              !label.trim() && 'Label',
              needsExpiry && !expiryDate && 'Expiry date',
            ].filter(Boolean).join(', ')}
          </Alert>
        )}

        {/* Footer */}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSave}
            disabled={!canSave}
          >
            {editDoc ? 'Update' : 'Save ID'}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Main Content ── */
function IDTrackerContent() {
  const { user } = useAuthStore();
  const store = useIDTrackerStore();
  const { documents, loading, selectedOwner, showForm, editingDoc } = store;
  const [deleteTarget, setDeleteTarget] = useState<IDDocument | null>(null);
  const [editingOwner, setEditingOwner] = useState<string | null>(null);
  const [editOwnerName, setEditOwnerName] = useState('');

  function renameOwner(oldName: string, newName: string) {
    if (!newName.trim() || newName.trim() === oldName) { setEditingOwner(null); return; }
    // Update all documents belonging to this person
    documents.filter(d => d.owner_name === oldName).forEach(d => {
      store.updateDocument(d.id, { owner_name: newName.trim() });
    });
    if (selectedOwner === oldName) store.setSelectedOwner(newName.trim());
    setEditingOwner(null);
  }

  // Load on mount
  useEffect(() => {
    const cloud = isCloudMode();
    if (cloud && user) {
      store.loadDocuments(user.id);
    } else if (!cloud) {
      store.loadDocuments('');
    }
  }, [user, store.loadDocuments]);

  const owners = [...new Set(documents.map((d) => d.owner_name))];
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'expiring' | 'expired'>('all');

  const expiringCount = documents.filter((d) => {
    const u = getUrgency(d.expiry_date);
    return u === 'critical' || u === 'warning';
  }).length;
  const expiredCount = documents.filter((d) => getUrgency(d.expiry_date) === 'expired').length;

  // Auto-reset to Everyone if selected person has no IDs
  useEffect(() => {
    if (selectedOwner && !documents.some(d => d.owner_name === selectedOwner)) {
      store.setSelectedOwner(null);
    }
  }, [documents, selectedOwner, store]);

  const displayedDocs = documents
    .filter((d) => !selectedOwner || d.owner_name === selectedOwner)
    .filter((d) => {
      if (urgencyFilter === 'expiring') { const u = getUrgency(d.expiry_date); return u === 'critical' || u === 'warning'; }
      if (urgencyFilter === 'expired') return getUrgency(d.expiry_date) === 'expired';
      return true;
    });

  const getOwnerStats = (owner: string) => {
    const docs = documents.filter((d) => d.owner_name === owner);
    const expired = docs.filter((d) => getUrgency(d.expiry_date) === 'expired').length;
    const expiring = docs.filter((d) => {
      const u = getUrgency(d.expiry_date);
      return u === 'critical' || u === 'warning';
    }).length;
    return { total: docs.length, expired, expiring };
  };

  function handleEdit(doc: IDDocument) {
    store.setEditingDoc(doc.id);
    store.setShowForm(true);
  }

  function handleDelete(doc: IDDocument) {
    setDeleteTarget(doc);
  }

  function confirmDelete() {
    if (deleteTarget) {
      store.deleteDocument(deleteTarget.id);
      toast.success('ID deleted');
      setDeleteTarget(null);
    }
  }

  function handleCloseForm(savedOwner?: string) {
    store.setShowForm(false);
    store.setEditingDoc(null);
    // Switch to the person whose ID was just added/edited
    if (savedOwner) {
      store.setSelectedOwner(savedOwner);
      setUrgencyFilter('all');
    }
  }

  const editDoc = editingDoc ? documents.find((d) => d.id === editingDoc) || null : null;

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        {/* Skeleton header */}
        <div className="px-4 lg:px-6 pt-4 pb-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-[22px] h-[22px] rounded-md" />
              <Skeleton className="w-[120px] h-[24px] rounded-md" />
            </div>
            <Skeleton className="w-[80px] h-[32px] rounded-lg" />
          </div>
        </div>
        {/* Skeleton person filter chips */}
        <div className="px-4 lg:px-6 mb-4">
          <div className="flex gap-2">
            <Skeleton className="w-[90px] h-[36px] rounded-full" />
            <Skeleton className="w-[80px] h-[36px] rounded-full" />
          </div>
        </div>
        {/* Skeleton ID cards */}
        <div className="px-4 lg:px-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border)] p-3 flex items-center gap-2.5"
              style={{ background: 'var(--surface)' }}
            >
              <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="w-[60%] h-[14px] rounded" />
                <Skeleton className="w-[40%] h-[12px] rounded" />
              </div>
              <div className="w-[90px] space-y-1.5">
                <Skeleton className="w-full h-[12px] rounded" />
                <Skeleton className="w-full h-[6px] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="px-4 lg:px-6 pt-4 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={22} style={{ color: 'var(--toolkit)' }} />
            <Text as="h1" size="xl" weight="bold" className="lg:text-[24px]">ID Tracker</Text>
          </div>
          <div className="flex items-center gap-2">
            {expiringCount > 0 && (
              <button
                onClick={() => { setUrgencyFilter(urgencyFilter === 'expiring' ? 'all' : 'expiring'); store.setSelectedOwner(null); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-all"
                style={{
                  background: urgencyFilter === 'expiring' ? 'var(--orange)' : 'rgba(251,146,60,0.1)',
                  color: urgencyFilter === 'expiring' ? '#fff' : 'var(--orange)',
                }}>
                <AlertTriangle size={13} />{expiringCount}
              </button>
            )}
            {expiredCount > 0 && (
              <button
                onClick={() => { setUrgencyFilter(urgencyFilter === 'expired' ? 'all' : 'expired'); store.setSelectedOwner(null); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-all ${urgencyFilter !== 'expired' ? 'animate-pulse' : ''}`}
                style={{
                  background: urgencyFilter === 'expired' ? 'var(--red)' : 'rgba(248,113,113,0.1)',
                  color: urgencyFilter === 'expired' ? '#fff' : 'var(--red)',
                }}>
                <XCircle size={13} />{expiredCount}
              </button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => { store.setEditingDoc(null); store.setShowForm(true); }}
            >
              <Plus size={14} />
              Add ID
            </Button>
          </div>
        </div>
      </div>

      {/* Coming soon banner */}
      <div className="mx-4 lg:mx-6 mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.08))', border: '1px solid rgba(251,191,36,0.25)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)' }}>
          <Bell size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <Text as="div" size="sm" weight="semibold" style={{ color: '#f59e0b' }}>Email reminders coming soon</Text>
          <Text as="div" size="xs" color="muted">We&apos;ll notify you before your IDs expire</Text>
        </div>
      </div>

      {/* Person switcher */}
      <div className="px-4 lg:px-6 pb-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { store.setSelectedOwner(null); setUrgencyFilter('all'); }}
            className="flex items-center gap-2.5 px-4 py-3 rounded-2xl transition-all cursor-pointer border-2 hover:border-[var(--muted)]"
            style={{
              background: 'var(--surface)',
              borderColor: !selectedOwner ? 'var(--green)' : 'var(--border)',
            }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
              style={{ background: 'var(--toolkit)' }}>
              <User size={16} />
            </div>
            <div className="text-left">
              <Text as="div" size="md" weight="semibold">Everyone</Text>
              <Text as="div" size="2xs" color="muted">{documents.length} IDs</Text>
            </div>
          </button>

          {owners.map((owner, idx) => {
            const stats = getOwnerStats(owner);
            const isActive = selectedOwner === owner;
            const initial = owner[0].toUpperCase();
            const hasUrgent = stats.expired > 0 || stats.expiring > 0;
            const avatarColor = getPersonColor(idx);

            return editingOwner === owner ? (
              <div
                key={owner}
                className="flex items-center gap-2 px-3 py-2.5 rounded-2xl border animate-[slideIn_0.15s]"
                style={{ borderColor: 'var(--toolkit)', background: 'var(--surface)' }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                  style={{ background: avatarColor }}>
                  {initial}
                </div>
                <input
                  type="text"
                  value={editOwnerName}
                  onChange={(e) => setEditOwnerName(e.target.value)}
                  autoFocus
                  className="w-[100px] px-2 py-1 rounded-lg text-[14px] font-medium border-0 outline-none bg-transparent"
                  style={{ color: 'var(--text)' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameOwner(owner, editOwnerName);
                    if (e.key === 'Escape') setEditingOwner(null);
                  }}
                />
                <button onClick={() => renameOwner(owner, editOwnerName)}
                  className="px-2 py-1 rounded-lg text-[12px] font-semibold text-white cursor-pointer"
                  style={{ background: 'var(--toolkit)' }}>Save</button>
                <button onClick={() => setEditingOwner(null)}
                  className="p-1 cursor-pointer" style={{ color: 'var(--muted)' }}><X size={14} /></button>
              </div>
            ) : (
              <button
                key={owner}
                onClick={() => { store.setSelectedOwner(isActive ? null : owner); setUrgencyFilter('all'); }}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl transition-all cursor-pointer border-2 ${
                  isActive ? 'shadow-lg' : 'hover:border-[var(--muted)]'
                }`}
                style={{
                  background: 'var(--surface)',
                  borderColor: isActive ? 'var(--green)' : 'var(--border)',
                }}
              >
                <div className="relative">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                    style={{ background: avatarColor }}>
                    {initial}
                  </div>
                  {hasUrgent && (
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                      style={{ background: stats.expired > 0 ? 'var(--red)' : 'var(--orange)', borderColor: 'var(--surface)' }} />
                  )}
                </div>
                <div className="text-left">
                  <Text as="div" size="md" weight="semibold">{owner}</Text>
                  <div className="flex items-center gap-1.5">
                    <Text size="2xs" color="muted">{stats.total} IDs</Text>
                    {stats.expired > 0 && <Text size="2xs" weight="bold" color="danger">{stats.expired} expired</Text>}
                    {stats.expiring > 0 && <Text size="2xs" weight="bold" className="text-[var(--orange)]">{stats.expiring} soon</Text>}
                  </div>
                </div>
                {/* Edit name — visible when selected */}
                {isActive && (
                  <div
                    onClick={(e) => { e.stopPropagation(); setEditingOwner(owner); setEditOwnerName(owner); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[var(--hover-bg)] transition-colors ml-1"
                    style={{ color: 'var(--dim)' }}
                  >
                    <Edit3 size={13} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter label */}
      {(selectedOwner || urgencyFilter !== 'all') && (
        <div className="px-4 lg:px-6 pb-2 flex items-center gap-2">
          <Text size="sm" weight="medium" color="muted">
            Showing {displayedDocs.length}
            {urgencyFilter === 'expiring' ? ' expiring' : urgencyFilter === 'expired' ? ' expired' : ''} IDs
            {selectedOwner && <> for <Text color="default">{selectedOwner}</Text></>}
          </Text>
          {urgencyFilter !== 'all' && (
            <button onClick={() => setUrgencyFilter('all')}
              className="text-[12px] px-2 py-0.5 rounded-lg cursor-pointer" style={{ color: 'var(--blue)' }}>
              Clear filter
            </button>
          )}
        </div>
      )}


      {/* Empty state */}
      {!loading && documents.length === 0 && (
        <div className="px-4 lg:px-6 pb-8">
          <EmptyState
            icon={<ShieldCheck size={36} style={{ color: 'var(--toolkit)' }} />}
            title="No IDs tracked yet"
            description="Keep all your passports, driver licenses, and other identity documents in one place. Never miss an expiry date again."
            brand="toolkit"
            action={{
              label: '+ Add ID',
              onClick: () => { store.setEditingDoc(null); store.setShowForm(true); },
            }}
          />
        </div>
      )}

      {/* Filtered empty state — documents exist but filters hide all */}
      {!loading && documents.length > 0 && displayedDocs.length === 0 && (
        <div className="px-4 lg:px-6 pb-8">
          <EmptyState
            icon={<FileText size={36} style={{ color: 'var(--muted)' }} />}
            title="No matching IDs"
            description="Try changing the person or urgency filter to see more results."
          />
        </div>
      )}

      {/* ID cards — grouped by country */}
      {!loading && displayedDocs.length > 0 && (
        <div className="px-4 lg:px-6 pb-48">
          {(() => {
            const usDocs = displayedDocs.filter(d => d.country === 'US');
            const inDocs = displayedDocs.filter(d => d.country === 'IN');

            return (
              <div className="space-y-6">
                {/* US Section */}
                {usDocs.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
                        style={{ background: 'rgba(96,165,250,0.15)', color: 'var(--blue)' }}>
                        US
                      </div>
                      <Text size="lg" weight="semibold">United States</Text>
                      <Text size="xs" weight="medium" color="muted" className="px-2 py-0.5 rounded-lg bg-[var(--surface)]">
                        {usDocs.length}
                      </Text>
                      {usDocs.some(d => getUrgency(d.expiry_date) === 'expired') && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded animate-pulse"
                          style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--red)' }}>
                          {usDocs.filter(d => getUrgency(d.expiry_date) === 'expired').length} expired
                        </span>
                      )}
                      {usDocs.some(d => { const u = getUrgency(d.expiry_date); return u === 'critical' || u === 'warning'; }) && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(251,146,60,0.15)', color: 'var(--orange)' }}>
                          {usDocs.filter(d => { const u = getUrgency(d.expiry_date); return u === 'critical' || u === 'warning'; }).length} expiring
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
                      {usDocs.map((doc) => (
                        <IDCard key={doc.id} doc={doc} owners={owners} onEdit={() => handleEdit(doc)} onDelete={() => handleDelete(doc)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* India Section */}
                {inDocs.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
                        style={{ background: 'rgba(251,146,60,0.15)', color: 'var(--orange)' }}>
                        IN
                      </div>
                      <Text size="lg" weight="semibold">India</Text>
                      <Text size="xs" weight="medium" color="muted" className="px-2 py-0.5 rounded-lg bg-[var(--surface)]">
                        {inDocs.length}
                      </Text>
                      {inDocs.some(d => getUrgency(d.expiry_date) === 'expired') && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded animate-pulse"
                          style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--red)' }}>
                          {inDocs.filter(d => getUrgency(d.expiry_date) === 'expired').length} expired
                        </span>
                      )}
                      {inDocs.some(d => { const u = getUrgency(d.expiry_date); return u === 'critical' || u === 'warning'; }) && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(251,146,60,0.15)', color: 'var(--orange)' }}>
                          {inDocs.filter(d => { const u = getUrgency(d.expiry_date); return u === 'critical' || u === 'warning'; }).length} expiring
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
                      {inDocs.map((doc) => (
                        <IDCard key={doc.id} doc={doc} owners={owners} onEdit={() => handleEdit(doc)} onDelete={() => handleDelete(doc)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <IDFormModal
          onClose={handleCloseForm}
          owners={owners.length > 0 ? owners : ['']}
          editDoc={editDoc}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirm
          doc={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/* ── Page export ── */
export default function IDTrackerPage() {
  return (
    <AuthGate>
      <IDTrackerContent />
    </AuthGate>
  );
}
