'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { TEAM_NAME, getCategoryConfig } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/utils';
import { FaWhatsapp, FaLink, FaFileAlt } from 'react-icons/fa';
import { MdShare } from 'react-icons/md';

function buildReport(store: ReturnType<typeof useCricketStore.getState>) {
  const { players, seasons, expenses, fees, selectedSeasonId } = store;
  const season = seasons.find((s) => s.id === selectedSeasonId);
  if (!season) return '';

  const activePlayers = players.filter((p) => p.is_active);
  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId && !e.deleted_at);
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feeAmount = season.fee_amount ?? 60;

  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const totalSpent = seasonExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const poolBalance = totalCollected - totalSpent;

  const lines: string[] = [];

  // Header
  lines.push(`🏏 *${TEAM_NAME}*`);
  lines.push(`📋 *${season.name} — Season Report*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push('');

  // Pool Fund
  lines.push(`💰 *POOL FUND*`);
  lines.push(`   Collected: ${formatCurrency(totalCollected)}`);
  lines.push(`   Spent: ${formatCurrency(totalSpent)}`);
  lines.push(`   Balance: ${poolBalance >= 0 ? '✅' : '❌'} *${formatCurrency(poolBalance)}*`);
  if (poolBalance < 0 && activePlayers.length > 0) {
    const perPerson = Math.ceil(Math.abs(poolBalance) / activePlayers.length);
    lines.push(`   ⚠️ Short! Need ${formatCurrency(perPerson)}/player`);
  }
  lines.push('');

  // Fee Status
  lines.push(`📝 *SEASON FEE* (${formatCurrency(feeAmount)}/player)`);
  const feeMap = Object.fromEntries(seasonFees.map((f) => [f.player_id, f]));
  const paidPlayers = activePlayers.filter((p) => {
    const f = feeMap[p.id];
    return f && Number(f.amount_paid) >= feeAmount;
  });
  const partialPlayers = activePlayers.filter((p) => {
    const f = feeMap[p.id];
    return f && Number(f.amount_paid) > 0 && Number(f.amount_paid) < feeAmount;
  });
  const unpaidPlayers = activePlayers.filter((p) => !feeMap[p.id] || Number(feeMap[p.id].amount_paid) === 0);

  if (paidPlayers.length > 0) {
    lines.push(`   ✅ Paid (${paidPlayers.length}):`);
    paidPlayers.forEach((p) => lines.push(`      ${p.jersey_number ? '#' + p.jersey_number : '•'} ${p.name}`));
  }
  if (partialPlayers.length > 0) {
    lines.push(`   ⚠️ Partial (${partialPlayers.length}):`);
    partialPlayers.forEach((p) => {
      const f = feeMap[p.id];
      lines.push(`      ${p.jersey_number ? '#' + p.jersey_number : '•'} ${p.name} — ${formatCurrency(Number(f.amount_paid))}`);
    });
  }
  if (unpaidPlayers.length > 0) {
    lines.push(`   ❌ Not Paid (${unpaidPlayers.length}):`);
    unpaidPlayers.forEach((p) => lines.push(`      ${p.jersey_number ? '#' + p.jersey_number : '•'} ${p.name}`));
  }
  lines.push('');

  // Expenses
  if (seasonExpenses.length > 0) {
    lines.push(`💸 *EXPENSES* (${seasonExpenses.length} items — ${formatCurrency(totalSpent)})`);
    seasonExpenses.forEach((e) => {
      const cfg = getCategoryConfig(e.category);
      lines.push(`   • ${e.description || cfg.label} — *${formatCurrency(Number(e.amount))}* (${formatDate(e.expense_date)})`);
    });
    lines.push('');

    // Category breakdown
    const catTotals: Record<string, number> = {};
    seasonExpenses.forEach((e) => { catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount); });
    lines.push(`📊 *BREAKDOWN*`);
    Object.entries(catTotals).sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
      const cfg = getCategoryConfig(cat);
      const pct = Math.round((total / totalSpent) * 100);
      lines.push(`   ${cfg.label}: ${formatCurrency(total)} (${pct}%)`);
    });
    lines.push('');
  }

  // Players
  lines.push(`👥 *SQUAD* (${activePlayers.length} players)`);
  activePlayers.forEach((p) => {
    const parts = [p.jersey_number ? `#${p.jersey_number}` : '•', p.name];
    if (p.designation === 'captain') parts.push('(C)');
    if (p.designation === 'vice-captain') parts.push('(VC)');
    if (p.player_role) parts.push(`— ${p.player_role.charAt(0).toUpperCase() + p.player_role.slice(1)}`);
    lines.push(`   ${parts.join(' ')}`);
  });
  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Generated on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);

  return lines.join('\n');
}

export default function ShareButton() {
  const store = useCricketStore();
  const { seasons, selectedSeasonId } = store;
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const season = seasons.find((s) => s.id === selectedSeasonId);
  if (!season) return null;

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/cricket/dues/${season.share_token}`
    : '';

  const report = buildReport(useCricketStore.getState());

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(report);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: `${TEAM_NAME} — ${season.name}`, text: report });
    } else {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyReport = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Share Report */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 overflow-hidden min-w-0">
        <h3 className="mb-1 text-[16px] font-bold text-[var(--text)]">Share Report</h3>
        <p className="mb-4 text-[13px] text-[var(--muted)]">Share season summary with your team via WhatsApp or copy</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={handleShareWhatsApp}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-white cursor-pointer active:scale-95 transition-all"
            style={{ background: '#25D366' }}>
            <FaWhatsapp size={18} /> WhatsApp
          </button>
          <button onClick={handleNativeShare}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold cursor-pointer active:scale-95 transition-all"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1.5px solid var(--border)' }}>
            <MdShare size={18} /> Share
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleCopyReport}
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold cursor-pointer transition-all"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <FaFileAlt size={14} /> {copied ? 'Copied!' : 'Copy Report'}
          </button>
          <button onClick={() => setShowPreview(!showPreview)}
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold cursor-pointer transition-all"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <FaFileAlt size={14} /> {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Report Preview */}
      {showPreview && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 overflow-hidden min-w-0">
          <pre className="text-[12px] sm:text-[13px] text-[var(--text)] whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
            {report}
          </pre>
        </div>
      )}

    </div>
  );
}
