'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { TEAM_NAME, getCategoryConfig } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/utils';
import { FaWhatsapp, FaFilePdf, FaFileAlt } from 'react-icons/fa';
import { MdShare } from 'react-icons/md';

function buildTextReport(store: ReturnType<typeof useCricketStore.getState>) {
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

  const feeMap = Object.fromEntries(seasonFees.map((f) => [f.player_id, f]));
  const lines: string[] = [];

  lines.push(`🏏 *${TEAM_NAME}*`);
  lines.push(`📋 *${season.name} — Season Report*`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`💰 *POOL FUND*`);
  lines.push(`   Collected: ${formatCurrency(totalCollected)}`);
  lines.push(`   Spent: ${formatCurrency(totalSpent)}`);
  lines.push(`   Balance: ${poolBalance >= 0 ? '✅' : '❌'} *${formatCurrency(poolBalance)}*`);
  if (poolBalance < 0 && activePlayers.length > 0) {
    lines.push(`   ⚠️ Short! Need ${formatCurrency(Math.ceil(Math.abs(poolBalance) / activePlayers.length))}/player`);
  }
  lines.push('');

  lines.push(`📝 *SEASON FEE* (${formatCurrency(feeAmount)}/player)`);
  const paid = activePlayers.filter((p) => feeMap[p.id] && Number(feeMap[p.id].amount_paid) >= feeAmount);
  const partial = activePlayers.filter((p) => feeMap[p.id] && Number(feeMap[p.id].amount_paid) > 0 && Number(feeMap[p.id].amount_paid) < feeAmount);
  const unpaid = activePlayers.filter((p) => !feeMap[p.id] || Number(feeMap[p.id].amount_paid) === 0);

  if (paid.length) { lines.push(`   ✅ Paid: ${paid.map((p) => p.name).join(', ')}`); }
  if (partial.length) { lines.push(`   ⚠️ Partial: ${partial.map((p) => `${p.name} (${formatCurrency(Number(feeMap[p.id].amount_paid))})`).join(', ')}`); }
  if (unpaid.length) { lines.push(`   ❌ Not Paid: ${unpaid.map((p) => p.name).join(', ')}`); }
  lines.push('');

  if (seasonExpenses.length) {
    lines.push(`💸 *EXPENSES* (${formatCurrency(totalSpent)})`);
    seasonExpenses.forEach((e) => {
      const cfg = getCategoryConfig(e.category);
      lines.push(`   • ${e.description || cfg.label} — ${formatCurrency(Number(e.amount))}`);
    });
    lines.push('');
  }

  lines.push(`👥 *SQUAD* (${activePlayers.length})`);
  activePlayers.forEach((p) => {
    const tag = p.designation === 'captain' ? ' (C)' : p.designation === 'vice-captain' ? ' (VC)' : '';
    lines.push(`   ${p.jersey_number ? '#' + p.jersey_number : '•'} ${p.name}${tag}`);
  });

  return lines.join('\n');
}

async function generatePdf(store: ReturnType<typeof useCricketStore.getState>) {
  const { jsPDF } = await import('jspdf');
  const { players, seasons, expenses, fees, selectedSeasonId } = store;
  const season = seasons.find((s) => s.id === selectedSeasonId);
  if (!season) return null;

  const activePlayers = players.filter((p) => p.is_active);
  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId && !e.deleted_at);
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feeAmount = season.fee_amount ?? 60;
  const feeMap = Object.fromEntries(seasonFees.map((f) => [f.player_id, f]));

  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const totalSpent = seasonExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const poolBalance = totalCollected - totalSpent;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  const addLine = (size: number, weight: string, color: [number, number, number], text: string, align: 'left' | 'center' = 'left', x = 15) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', weight);
    doc.setTextColor(...color);
    if (align === 'center') {
      doc.text(text, pageW / 2, y, { align: 'center' });
    } else {
      doc.text(text, x, y);
    }
    y += size * 0.45 + 1;
  };

  const addGap = (gap = 4) => { y += gap; };
  const addSeparator = () => {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(15, y, pageW - 15, y);
    y += 4;
  };

  const checkPage = () => {
    if (y > 270) { doc.addPage(); y = 20; }
  };

  // Header
  addLine(22, 'bold', [217, 119, 6], TEAM_NAME, 'center');
  addLine(12, 'normal', [100, 100, 100], season.name + ' — Season Report', 'center');
  addGap(2);
  addSeparator();

  // Pool Fund
  addLine(14, 'bold', [30, 30, 30], 'Pool Fund');
  addGap(1);
  addLine(10, 'normal', [5, 150, 105], `Collected: ${formatCurrency(totalCollected)}`);
  addLine(10, 'normal', [239, 68, 68], `Spent: ${formatCurrency(totalSpent)}`);
  const balColor: [number, number, number] = poolBalance >= 0 ? [5, 150, 105] : [239, 68, 68];
  addLine(16, 'bold', balColor, `Balance: ${poolBalance < 0 ? '-' : ''}${formatCurrency(poolBalance)}`);
  if (poolBalance < 0 && activePlayers.length > 0) {
    const pp = Math.ceil(Math.abs(poolBalance) / activePlayers.length);
    addLine(9, 'normal', [239, 68, 68], `Insufficient! Suggest collecting ${formatCurrency(pp)} per player`);
  }
  addGap(2);
  addSeparator();

  // Fee Status
  addLine(14, 'bold', [30, 30, 30], `Season Fee — ${formatCurrency(feeAmount)}/player`);
  addGap(2);

  // Fee table header
  doc.setFillColor(245, 245, 245);
  doc.rect(15, y - 2, pageW - 30, 7, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
  doc.text('#', 18, y + 3); doc.text('Player', 35, y + 3); doc.text('Status', 120, y + 3); doc.text('Paid', pageW - 20, y + 3, { align: 'right' });
  y += 9;

  activePlayers.forEach((p, i) => {
    checkPage();
    if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(15, y - 3.5, pageW - 30, 6, 'F'); }
    const fee = feeMap[p.id];
    const paidAmt = fee ? Number(fee.amount_paid) : 0;
    const isPaid = paidAmt >= feeAmount;
    const isPartial = paidAmt > 0 && paidAmt < feeAmount;
    const status = isPaid ? 'Paid' : isPartial ? 'Partial' : 'Not Paid';
    const statusColor: [number, number, number] = isPaid ? [5, 150, 105] : isPartial ? [217, 119, 6] : [239, 68, 68];

    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text(p.jersey_number ? `#${p.jersey_number}` : '—', 18, y);
    doc.text(p.name + (p.designation === 'captain' ? ' (C)' : p.designation === 'vice-captain' ? ' (VC)' : ''), 35, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...statusColor);
    doc.text(status, 120, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
    doc.text(formatCurrency(paidAmt), pageW - 20, y, { align: 'right' });
    y += 6;
  });

  addGap(2);
  addSeparator();

  // Expenses
  if (seasonExpenses.length) {
    addLine(14, 'bold', [30, 30, 30], `Expenses — ${formatCurrency(totalSpent)}`);
    addGap(2);

    doc.setFillColor(245, 245, 245);
    doc.rect(15, y - 2, pageW - 30, 7, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
    doc.text('Category', 18, y + 3); doc.text('Description', 60, y + 3); doc.text('Date', 130, y + 3); doc.text('Amount', pageW - 20, y + 3, { align: 'right' });
    y += 9;

    seasonExpenses.forEach((e, i) => {
      checkPage();
      if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(15, y - 3.5, pageW - 30, 6, 'F'); }
      const cfg = getCategoryConfig(e.category);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text(cfg.label, 18, y);
      doc.text((e.description || cfg.label).substring(0, 30), 60, y);
      doc.text(formatDate(e.expense_date), 130, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
      doc.text(formatCurrency(Number(e.amount)), pageW - 20, y, { align: 'right' });
      y += 6;
    });

    addGap(2);
    addSeparator();

    // Expense Breakdown (bar chart)
    checkPage();
    addLine(14, 'bold', [30, 30, 30], 'Expense Breakdown');
    addGap(2);

    const catTotals: Record<string, number> = {};
    seasonExpenses.forEach((e) => { catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount); });
    const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const catColors: Record<string, [number, number, number]> = {
      ground: [22, 163, 74], equipment: [59, 130, 246], tournament: [245, 158, 11], food: [239, 68, 68], other: [107, 114, 128],
    };
    const maxBarW = 80;

    catEntries.forEach(([cat, total]) => {
      checkPage();
      const cfg = getCategoryConfig(cat);
      const pct = Math.round((total / totalSpent) * 100);
      const barW = (total / totalSpent) * maxBarW;
      const color = catColors[cat] ?? [107, 114, 128];

      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text(cfg.label, 18, y);

      // Bar
      doc.setFillColor(240, 240, 240);
      doc.rect(65, y - 3, maxBarW, 4, 'F');
      doc.setFillColor(...color);
      doc.rect(65, y - 3, barW, 4, 'F');

      // Amount + percentage
      doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
      doc.text(`${formatCurrency(total)} (${pct}%)`, 65 + maxBarW + 5, y);
      y += 7;
    });

    addGap(2);
    addSeparator();
  }

  // Squad
  checkPage();
  addLine(14, 'bold', [30, 30, 30], `Squad — ${activePlayers.length} Players`);
  addGap(2);
  activePlayers.forEach((p) => {
    checkPage();
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
    const role = p.player_role ? ` — ${p.player_role.charAt(0).toUpperCase() + p.player_role.slice(1)}` : '';
    const tag = p.designation === 'captain' ? ' (C)' : p.designation === 'vice-captain' ? ' (VC)' : '';
    doc.text(`${p.jersey_number ? '#' + p.jersey_number : '•'}  ${p.name}${tag}${role}`, 18, y);
    y += 5;
  });

  // Footer
  addGap(6);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ${TEAM_NAME}`, pageW / 2, y, { align: 'center' });

  return doc;
}

export default function ShareButton() {
  const store = useCricketStore();
  const { seasons, selectedSeasonId } = store;
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const season = seasons.find((s) => s.id === selectedSeasonId);
  if (!season) return null;

  const report = buildTextReport(useCricketStore.getState());

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(report);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleDownloadPdf = async () => {
    setGenerating(true);
    try {
      const doc = await generatePdf(useCricketStore.getState());
      if (doc) {
        doc.save(`${TEAM_NAME.replace(/\s+/g, '_')}_${season.name.replace(/\s+/g, '_')}.pdf`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSharePdf = async () => {
    setGenerating(true);
    try {
      const doc = await generatePdf(useCricketStore.getState());
      if (!doc) return;
      const blob = doc.output('blob');
      const file = new File([blob], `${TEAM_NAME}_${season.name}.pdf`, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${TEAM_NAME} — ${season.name}` });
      } else {
        // Fallback: download
        doc.save(`${TEAM_NAME.replace(/\s+/g, '_')}_${season.name.replace(/\s+/g, '_')}.pdf`);
      }
    } finally {
      setGenerating(false);
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
        <p className="mb-4 text-[13px] text-[var(--muted)]">Share season summary as PDF or text with your team</p>

        {/* Primary actions */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={handleSharePdf} disabled={generating}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold cursor-pointer active:scale-95 transition-all disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)', color: '#fff', border: '1.5px solid #D97706' }}>
            <FaFilePdf size={16} /> {generating ? 'Generating...' : 'Share PDF'}
          </button>
          <button onClick={handleShareWhatsApp}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-white cursor-pointer active:scale-95 transition-all"
            style={{ background: '#25D366' }}>
            <FaWhatsapp size={18} /> WhatsApp
          </button>
        </div>

        {/* Secondary actions */}
        <div className="grid grid-cols-3 gap-2">
          <button onClick={handleDownloadPdf} disabled={generating}
            className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-semibold cursor-pointer transition-all disabled:opacity-60"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <FaFilePdf size={12} /> Download
          </button>
          <button onClick={handleCopyReport}
            className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-semibold cursor-pointer transition-all"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <FaFileAlt size={12} /> {copied ? 'Copied!' : 'Copy Text'}
          </button>
          <button onClick={() => setShowPreview(!showPreview)}
            className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-semibold cursor-pointer transition-all"
            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <MdShare size={14} /> Preview
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
