'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { TEAM_NAME, getCategoryConfig } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/utils';
import { FaFilePdf } from 'react-icons/fa';
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
    const perPlayer = Math.ceil(Math.abs(poolBalance) / activePlayers.length);
    lines.push(`   ⚠️ Deficit: ${formatCurrency(Math.abs(poolBalance))} • ${formatCurrency(perPlayer)} per player`);
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

async function generatePdf(storeState: ReturnType<typeof useCricketStore.getState>) {
  const { jsPDF } = await import('jspdf');
  const { players, seasons, expenses, fees, sponsorships, selectedSeasonId } = storeState;
  const season = seasons.find((s) => s.id === selectedSeasonId);
  if (!season) return null;

  const activePlayers = players.filter((p) => p.is_active);
  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId && !e.deleted_at);
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feeAmount = season.fee_amount ?? 60;
  const feeMap = Object.fromEntries(seasonFees.map((f) => [f.player_id, f]));
  const seasonSponsors = sponsorships.filter((s) => s.season_id === selectedSeasonId && !s.deleted_at);

  const totalFees = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const totalSponsorship = seasonSponsors.reduce((sum, s) => sum + Number(s.amount), 0);
  const totalCollected = totalFees + totalSponsorship;
  const totalSpent = seasonExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const poolBalance = totalCollected - totalSpent;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 18; // margin (more breathing room for professional layout)
  const TW = W - M * 2; // table width
  let y = 20;

  type RGB = [number, number, number];
  const BLACK: RGB = [30, 30, 30]; const GRAY: RGB = [100, 100, 100]; const LGRAY: RGB = [150, 150, 150]; const HEADER_BG: RGB = [235, 235, 235];
  const GREEN: RGB = [5, 150, 105]; const RED: RGB = [239, 68, 68]; const ORANGE: RGB = [217, 119, 6];

  const text = (s: string, x: number, yy: number, opts?: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'center' | 'right' }) => {
    doc.setFontSize(opts?.size ?? 9);
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setTextColor(...(opts?.color ?? BLACK));
    doc.text(s, x, yy, { align: opts?.align ?? 'left' });
  };

  const gap = (g = 5) => { y += g; };
  const hr = () => { doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 5; };
  const checkPage = (need = 10) => { if (y + need > 280) { doc.addPage(); y = 20; } };

  // Draw a card wrapper — call startCard(), render content, then endCard()
  let cardStartY = 0;
  const startCard = () => { cardStartY = y; y += 5; };
  const endCard = () => {
    const h = y - cardStartY + 5;
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
    doc.roundedRect(M, cardStartY, TW, h, 2, 2, 'FD');
    y = cardStartY; // reset to draw content on top
  };

  // Draw section accent line on left after content is rendered
  const sectionAccent = (startY: number, color: RGB) => {
    const h = y - startY;
    doc.setDrawColor(...color); doc.setLineWidth(1.5);
    doc.line(M - 2, startY - 2, M - 2, startY + h + 2);
  };

  // Draw a proper table
  const drawTable = (headers: string[], colX: number[], rows: { cells: string[]; bold?: boolean[]; colors?: (RGB | null)[] }[]) => {
    const rH = 8; // row height
    const textY = 5.5; // text offset within row

    // Header
    doc.setFillColor(...HEADER_BG);
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.rect(M, y, TW, rH, 'FD');
    headers.forEach((h, i) => {
      const align = i === headers.length - 1 ? 'right' as const : 'left' as const;
      const x = i === headers.length - 1 ? W - M - 2 : colX[i];
      text(h, x, y + textY, { size: 8, bold: true, color: GRAY, align });
    });
    y += rH;

    // Rows
    rows.forEach((row, ri) => {
      checkPage(rH);
      if (ri % 2 === 0) { doc.setFillColor(252, 252, 254); doc.rect(M, y, TW, rH, 'F'); }
      doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.1);
      doc.line(M, y + rH, W - M, y + rH); // bottom border

      row.cells.forEach((cell, ci) => {
        const isLast = ci === row.cells.length - 1;
        const align = isLast ? 'right' as const : 'left' as const;
        const x = isLast ? W - M - 2 : colX[ci];
        const isBold = row.bold?.[ci] ?? false;
        const color = row.colors?.[ci] ?? BLACK;
        text(cell, x, y + textY, { size: 9, bold: isBold, color, align });
      });
      y += rH;
    });

    // Bottom border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
  };

  // ═══ HEADER WITH LOGO ═══
  try {
    const logoRes = await fetch('/cricket-logo.png');
    const logoBlob = await logoRes.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
    const logoSize = 20;
    doc.addImage(logoBase64, 'PNG', W / 2 - logoSize / 2, y - 2, logoSize, logoSize);
    y += logoSize + 3;
  } catch {
    // Logo failed to load — skip it
  }
  text(TEAM_NAME, W / 2, y, { size: 26, bold: true, color: ORANGE, align: 'center' });
  y += 10;
  text(`${season.name} — Season Report`, W / 2, y, { size: 12, color: GRAY, align: 'center' });
  y += 8;
  hr();

  // ═══ POOL FUND CARD ═══
  const cardH = poolBalance < 0 ? 32 : 25;
  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
  doc.roundedRect(M, y, TW, cardH, 2, 2, 'FD');

  const cardInner = y + 7;
  text('POOL FUND', M + 6, cardInner, { size: 8, bold: true, color: GRAY });

  const statsY = cardInner + 7;
  text(`Fees`, M + 6, statsY, { size: 8, color: GRAY });
  text(formatCurrency(totalFees), M + 6, statsY + 5, { size: 11, bold: true, color: GREEN });

  text(`Sponsors`, M + 45, statsY, { size: 8, color: GRAY });
  text(formatCurrency(totalSponsorship), M + 45, statsY + 5, { size: 11, bold: true, color: ORANGE });

  text(`Spent`, M + 90, statsY, { size: 8, color: GRAY });
  text(formatCurrency(totalSpent), M + 90, statsY + 5, { size: 11, bold: true, color: RED });

  text(`Balance`, W - M - 6, statsY, { size: 8, color: GRAY, align: 'right' });
  const balColor: RGB = poolBalance >= 0 ? GREEN : RED;
  text(`${poolBalance < 0 ? '-' : ''}${formatCurrency(poolBalance)}`, W - M - 6, statsY + 5, { size: 14, bold: true, color: balColor, align: 'right' });

  if (poolBalance < 0 && activePlayers.length > 0) {
    const pp = Math.ceil(Math.abs(poolBalance) / activePlayers.length);
    // clearer message for shortfall
    const deficit = formatCurrency(Math.abs(poolBalance));
    const perPlayer = formatCurrency(pp);
    text(
      `Additional ${perPlayer} per player needed to cover ${deficit} shortfall (${activePlayers.length} players)`,
      M + 6,
      statsY + 14,
      { size: 8.5, color: RED }
    );
  }

  y += cardH + 8;

  // ═══ SEASON FEE TABLE ═══
  const feeStartY = y;
  text('SEASON FEES', M, y, { size: 9, bold: true, color: GRAY });
  y += 5;
  text(`Season Fee — ${formatCurrency(feeAmount)}/player`, M, y, { size: 14, bold: true, color: BLACK });
  y += 8;

  const feeRows = activePlayers.map((p) => {
    const fee = feeMap[p.id];
    const paidAmt = fee ? Number(fee.amount_paid) : 0;
    const isPaid = paidAmt >= feeAmount;
    const isPartial = paidAmt > 0 && paidAmt < feeAmount;
    const status = isPaid ? '[PAID]' : isPartial ? '[PARTIAL]' : '[UNPAID]';
    const sColor: RGB = isPaid ? GREEN : isPartial ? ORANGE : RED;
    const tag = p.designation === 'captain' ? ' (C)' : p.designation === 'vice-captain' ? ' (VC)' : '';
    return {
      cells: [p.jersey_number ? `#${p.jersey_number}` : '—', `${p.name}${tag}`, status, formatCurrency(paidAmt)],
      bold: [false, false, true, true],
      colors: [GRAY, BLACK, sColor, BLACK] as (RGB | null)[],
    };
  });
  drawTable(['#', 'Player', 'Status', 'Amount'], [M + 3, M + 18, M + 100, 0], feeRows);
  sectionAccent(feeStartY, GREEN);
  gap(8);

  // ═══ SPONSORSHIPS ═══
  if (seasonSponsors.length) {
    checkPage(30);
    const sponsorStartY = y;
    text('SPONSORSHIPS', M, y, { size: 9, bold: true, color: GRAY });
    y += 5;
    text(`Sponsorships — ${formatCurrency(totalSponsorship)}`, M, y, { size: 14, bold: true, color: BLACK });
    y += 8;

    const sponsorRows = seasonSponsors.map((s) => ({
      cells: [s.sponsor_name, formatDate(s.sponsored_date), s.notes || '—', formatCurrency(Number(s.amount))],
      bold: [true, false, false, true],
      colors: [BLACK, GRAY, GRAY, GREEN] as (RGB | null)[],
    }));
    drawTable(['Sponsor', 'Date', 'Notes', 'Amount'], [M + 3, M + 70, M + 100, 0], sponsorRows);
    sectionAccent(sponsorStartY, ORANGE);
    gap(8);
  }

  // ═══ EXPENSES TABLE ═══
  if (seasonExpenses.length) {
    checkPage(30);
    const expStartY = y;
    text('EXPENSES', M, y, { size: 9, bold: true, color: GRAY });
    y += 5;
    text(`Expenses — ${formatCurrency(totalSpent)}`, M, y, { size: 14, bold: true, color: BLACK });
    y += 8;

    const expRows = seasonExpenses.map((e) => {
      const cfg = getCategoryConfig(e.category);
      return {
        cells: [cfg.label, (e.description || cfg.label).substring(0, 28), formatDate(e.expense_date), formatCurrency(Number(e.amount))],
        bold: [false, false, false, true],
        colors: [null, null, GRAY, BLACK] as (RGB | null)[],
      };
    });
    drawTable(['Category', 'Description', 'Date', 'Amount'], [M + 3, M + 40, M + 110, 0], expRows);
    gap(8);

    // ═══ EXPENSE BREAKDOWN ═══
    checkPage(30);
    text('Expense Breakdown', M, y, { size: 14, bold: true, color: BLACK });
    y += 8;

    const catTotals: Record<string, number> = {};
    seasonExpenses.forEach((e) => { catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount); });
    const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const catRgb: Record<string, RGB> = { ground: [22, 163, 74], equipment: [59, 130, 246], tournament: [245, 158, 11], food: [239, 68, 68], other: [107, 114, 128] };
    const barMax = 75;

    catEntries.forEach(([cat, total]) => {
      checkPage(10);
      const cfg = getCategoryConfig(cat);
      const pct = Math.round((total / totalSpent) * 100);
      const barW = Math.max((total / totalSpent) * barMax, 2);
      const c = catRgb[cat] ?? [107, 114, 128];

      text(cfg.label, M + 3, y, { size: 9, color: BLACK });

      // Background bar
      doc.setFillColor(235, 235, 235);
      doc.roundedRect(M + 40, y - 3.5, barMax, 5, 1.5, 1.5, 'F');
      // Filled bar
      doc.setFillColor(...c);
      doc.roundedRect(M + 40, y - 3.5, barW, 5, 1.5, 1.5, 'F');

      text(`${formatCurrency(total)} (${pct}%)`, M + 40 + barMax + 4, y, { size: 9, bold: true, color: BLACK });
      y += 8;
    });
    sectionAccent(expStartY, RED);
    gap(8);
  }

  // ═══ SQUAD TABLE ═══
  checkPage(30);
  const squadStartY = y;
  text('TEAM SQUAD', M, y, { size: 9, bold: true, color: GRAY });
  y += 5;
  text(`Squad — ${activePlayers.length} Players`, M, y, { size: 14, bold: true, color: BLACK });
  y += 8;

  const squadRows = activePlayers.map((p) => {
    const tag = p.designation === 'captain' ? ' (C)' : p.designation === 'vice-captain' ? ' (VC)' : '';
    const role = p.player_role ? p.player_role.charAt(0).toUpperCase() + p.player_role.slice(1) : '—';
    return {
      cells: [p.jersey_number ? `#${p.jersey_number}` : '—', `${p.name}${tag}`, role, p.cricclub_id || '—'],
      bold: [false, true, false, false],
      colors: [ORANGE, BLACK, GRAY, GRAY] as (RGB | null)[],
    };
  });
  drawTable(['#', 'Player', 'Role', 'CricClub ID'], [M + 3, M + 18, M + 85, 0], squadRows);
  sectionAccent(squadStartY, ORANGE);

  // ═══ FOOTER ═══
  gap(10);
  text(
    `Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    W / 2, y, { size: 8, color: LGRAY, align: 'center' }
  );
  y += 4;
  text(
    `${TEAM_NAME}`,
    W / 2, y, { size: 8, color: LGRAY, align: 'center' }
  );

  return doc;
}

export default function ShareButton() {
  const store = useCricketStore();
  const { seasons, selectedSeasonId } = store;
  const [generating, setGenerating] = useState(false);

  const season = seasons.find((s) => s.id === selectedSeasonId);
  if (!season) return null;


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

  return (
    <div className="space-y-4">
      {/* Share Report */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 overflow-hidden min-w-0">
        <h3 className="mb-1 text-[16px] font-bold text-[var(--text)]">Share Report</h3>
        <p className="mb-4 text-[13px] text-[var(--muted)]">Share season summary as PDF or text with your team</p>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleSharePdf} disabled={generating}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold cursor-pointer active:scale-95 transition-all disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)', color: '#fff', border: '1.5px solid #D97706' }}>
            <MdShare size={16} /> {generating ? 'Generating...' : 'Share PDF'}
          </button>
          <button onClick={handleDownloadPdf} disabled={generating}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold cursor-pointer active:scale-95 transition-all disabled:opacity-60"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1.5px solid var(--border)' }}>
            <FaFilePdf size={16} /> Download
          </button>
        </div>
      </div>

    </div>
  );
}
