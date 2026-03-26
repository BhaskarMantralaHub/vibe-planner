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
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const TW = W - M * 2;
  let y = 0;

  type RGB = [number, number, number];
  const BLACK: RGB = [30, 30, 30];
  const DARK: RGB = [55, 55, 55];
  const GRAY: RGB = [120, 120, 120];
  const LGRAY: RGB = [170, 170, 170];
  const WHITE: RGB = [255, 255, 255];
  const GREEN: RGB = [5, 150, 105];
  const RED: RGB = [220, 50, 50];
  const ORANGE: RGB = [42, 143, 194];   // Cricket sky blue (matches --cricket in light mode)
  const AMBER: RGB = [77, 187, 235];    // Cricket bright blue (matches --cricket in dark mode)
  const BLUE: RGB = [59, 130, 246];

  const text = (s: string, x: number, yy: number, opts?: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'center' | 'right' }) => {
    doc.setFontSize(opts?.size ?? 9);
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setTextColor(...(opts?.color ?? BLACK));
    doc.text(s, x, yy, { align: opts?.align ?? 'left' });
  };

  const checkPage = (need = 12) => { if (y + need > H - 20) { doc.addPage(); y = 18; } };
  const pageCount = () => doc.getNumberOfPages();

  // ─── Rounded rect fill helper ───
  const fillRect = (x: number, ry: number, w: number, h: number, color: RGB, r = 2) => {
    doc.setFillColor(...color);
    doc.roundedRect(x, ry, w, h, r, r, 'F');
  };

  // ─── Section header with colored dot ───
  const sectionHeader = (label: string, subtitle: string, dotColor: RGB) => {
    checkPage(20);
    // Colored dot
    doc.setFillColor(...dotColor);
    doc.circle(M + 3, y + 1, 2, 'F');
    text(label, M + 8, y + 2.5, { size: 8, bold: true, color: GRAY });
    y += 8;
    text(subtitle, M, y, { size: 15, bold: true, color: BLACK });
    y += 9;
  };

  // ─── Styled table ───
  // colPcts: percentage of TW for each column (must sum to ~100). Last col is right-aligned.
  const drawTable = (headers: string[], colPcts: number[], rows: { cells: string[]; bold?: boolean[]; colors?: (RGB | null)[] }[], accentColor: RGB) => {
    const rH = 8.5;
    const textY = 5.8;
    const pad = 3;

    // Convert percentages to absolute x positions
    const colX = colPcts.map((_, i) => {
      const offset = colPcts.slice(0, i).reduce((a, b) => a + b, 0);
      return M + (offset / 100) * TW + pad;
    });

    // Header row — colored accent with white overlay
    fillRect(M, y, TW, rH, [accentColor[0], accentColor[1], accentColor[2]], 0);
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState({ opacity: 0.88 }));
    doc.rect(M, y, TW, rH, 'F');
    doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState({ opacity: 1 }));

    headers.forEach((h, i) => {
      const isLast = i === headers.length - 1;
      const align = isLast ? 'right' as const : 'left' as const;
      const x = isLast ? W - M - pad : colX[i];
      text(h.toUpperCase(), x, y + textY, { size: 7, bold: true, color: accentColor, align });
    });
    y += rH;

    // Data rows
    rows.forEach((row, ri) => {
      checkPage(rH);
      if (ri % 2 === 0) { fillRect(M, y, TW, rH, [250, 250, 252], 0); }
      doc.setDrawColor(240, 240, 240); doc.setLineWidth(0.15);
      doc.line(M, y + rH, W - M, y + rH);

      row.cells.forEach((cell, ci) => {
        const isLast = ci === row.cells.length - 1;
        const align = isLast ? 'right' as const : 'left' as const;
        const x = isLast ? W - M - pad : colX[ci];
        const isBold = row.bold?.[ci] ?? false;
        const color = row.colors?.[ci] ?? DARK;
        text(cell, x, y + textY, { size: 9, bold: isBold, color, align });
      });
      y += rH;
    });
  };

  // ═══════════════════════════════════════
  // ═══ PAGE 1: HEADER BANNER ═══
  // ═══════════════════════════════════════

  // Blue gradient banner (matches cricket theme)
  const bannerH = 48;
  // Draw gradient by layering thin strips
  for (let i = 0; i < bannerH; i++) {
    const t = i / bannerH;
    const r = Math.round(20 + t * 15);   // 20→35 (dark navy → slightly lighter)
    const g = Math.round(50 + t * 30);   // 50→80
    const b = Math.round(90 + t * 40);   // 90→130
    doc.setFillColor(r, g, b);
    doc.rect(0, i, W, 1, 'F');
  }

  // Logo in banner
  try {
    const logoRes = await fetch('/cricket-logo.png');
    const logoBlob = await logoRes.blob();
    const logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
    doc.addImage(logoBase64, 'PNG', M, 8, 16, 16);
  } catch { /* skip logo */ }

  // Team name + season in banner
  text(TEAM_NAME, M + 22, 17, { size: 22, bold: true, color: WHITE });
  text(`${season.name}  —  Season Report`, M + 22, 25, { size: 11, color: [255, 255, 240] });
  // Generated date
  text(
    `Generated ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`,
    W - M, 25, { size: 8, color: [255, 220, 180], align: 'right' }
  );

  y = bannerH + 8;

  // ═══ SUMMARY STAT CARDS ═══
  const cardW = (TW - 9) / 4; // 4 cards with 3px gaps
  const cardH2 = 22;
  const stats = [
    { label: 'FEES', value: formatCurrency(totalFees), color: GREEN },
    { label: 'SPONSORS', value: formatCurrency(totalSponsorship), color: AMBER },
    { label: 'SPENT', value: formatCurrency(totalSpent), color: RED },
    { label: 'BALANCE', value: `${poolBalance < 0 ? '-' : ''}${formatCurrency(Math.abs(poolBalance))}`, color: poolBalance >= 0 ? GREEN : RED },
  ];

  stats.forEach((s, i) => {
    const cx = M + i * (cardW + 3);
    // Card background
    fillRect(cx, y, cardW, cardH2, [248, 249, 252], 3);
    // Colored top accent line
    doc.setFillColor(...s.color);
    doc.roundedRect(cx, y, cardW, 2, 1, 1, 'F');
    // Label
    text(s.label, cx + cardW / 2, y + 9, { size: 7, bold: true, color: GRAY, align: 'center' });
    // Value
    text(s.value, cx + cardW / 2, y + 17, { size: 13, bold: true, color: s.color, align: 'center' });
  });
  y += cardH2 + 4;

  // Pool balance alert (compact)
  if (poolBalance < 0 && activePlayers.length > 0) {
    const pp = Math.ceil(Math.abs(poolBalance) / activePlayers.length);
    fillRect(M, y, TW, 10, [255, 245, 245], 2);
    doc.setDrawColor(...RED); doc.setLineWidth(0.3); doc.roundedRect(M, y, TW, 10, 2, 2, 'S');
    text(
      `Shortfall: ${formatCurrency(Math.abs(poolBalance))}  —  collect ${formatCurrency(pp)}/player (${activePlayers.length} players) to cover`,
      W / 2, y + 6.5, { size: 8.5, bold: true, color: RED, align: 'center' }
    );
    y += 14;
  } else if (poolBalance > 0 && totalCollected > 0) {
    fillRect(M, y, TW, 10, [240, 253, 244], 2);
    text(
      `${formatCurrency(poolBalance)} remaining  —  rolls over to next season`,
      W / 2, y + 6.5, { size: 8.5, color: GREEN, align: 'center' }
    );
    y += 14;
  } else {
    y += 4;
  }

  // ═══ SEASON FEE TABLE ═══
  sectionHeader('SEASON FEES', `${formatCurrency(feeAmount)} per player`, GREEN);

  const paidPlayers = activePlayers.filter((p) => feeMap[p.id] && Number(feeMap[p.id].amount_paid) >= feeAmount);
  const partialPlayers = activePlayers.filter((p) => feeMap[p.id] && Number(feeMap[p.id].amount_paid) > 0 && Number(feeMap[p.id].amount_paid) < feeAmount);
  const unpaidPlayers = activePlayers.filter((p) => !feeMap[p.id] || Number(feeMap[p.id].amount_paid) === 0);

  // Quick summary line
  const parts = [];
  if (paidPlayers.length) parts.push(`${paidPlayers.length} Paid`);
  if (partialPlayers.length) parts.push(`${partialPlayers.length} Partial`);
  if (unpaidPlayers.length) parts.push(`${unpaidPlayers.length} Unpaid`);
  text(parts.join('  |  '), M, y, { size: 9, color: GRAY });
  y += 6;

  const feeRows = activePlayers.map((p) => {
    const fee = feeMap[p.id];
    const paidAmt = fee ? Number(fee.amount_paid) : 0;
    const isPaid = paidAmt >= feeAmount;
    const isPartial = paidAmt > 0 && paidAmt < feeAmount;
    const status = isPaid ? 'Paid' : isPartial ? 'Partial' : 'Unpaid';
    const sColor: RGB = isPaid ? GREEN : isPartial ? AMBER : RED;
    const tag = p.designation === 'captain' ? ' (C)' : p.designation === 'vice-captain' ? ' (VC)' : '';
    const dateStr = fee?.paid_date ? formatDate(fee.paid_date) : '—';
    return {
      cells: [p.jersey_number ? `#${p.jersey_number}` : '—', `${p.name}${tag}`, status, dateStr, formatCurrency(paidAmt)],
      bold: [false, true, true, false, true],
      colors: [GRAY, DARK, sColor, LGRAY, DARK] as (RGB | null)[],
    };
  });
  // #(7%) Player(38%) Status(18%) Date(18%) Amount(19%)
  drawTable(['Jersey', 'Player', 'Status', 'Date', 'Amount'], [8, 37, 18, 18, 19], feeRows, GREEN);
  y += 10;

  // ═══ SPONSORSHIPS ═══
  if (seasonSponsors.length) {
    sectionHeader('SPONSORSHIPS', `${formatCurrency(totalSponsorship)} total`, AMBER);
    const sponsorRows = seasonSponsors.map((s) => ({
      cells: [s.sponsor_name, formatDate(s.sponsored_date), s.notes || '—', formatCurrency(Number(s.amount))],
      bold: [true, false, false, true],
      colors: [DARK, GRAY, LGRAY, GREEN] as (RGB | null)[],
    }));
    // Sponsor(35%) Date(20%) Notes(25%) Amount(20%)
    drawTable(['Sponsor', 'Date', 'Notes', 'Amount'], [35, 20, 25, 20], sponsorRows, AMBER);
    y += 10;
  }

  // ═══ EXPENSES TABLE ═══
  if (seasonExpenses.length) {
    sectionHeader('EXPENSES', `${formatCurrency(totalSpent)} total  ·  ${seasonExpenses.length} transactions`, RED);

    const expRows = seasonExpenses.map((e) => {
      const cfg = getCategoryConfig(e.category);
      return {
        cells: [cfg.label, (e.description || cfg.label).substring(0, 30), formatDate(e.expense_date), formatCurrency(Number(e.amount))],
        bold: [false, false, false, true],
        colors: [GRAY, DARK, LGRAY, DARK] as (RGB | null)[],
      };
    });
    // Category(18%) Description(40%) Date(20%) Amount(22%)
    drawTable(['Category', 'Description', 'Date', 'Amount'], [18, 40, 20, 22], expRows, RED);
    y += 8;

    // ═══ EXPENSE BREAKDOWN BARS ═══
    checkPage(40);
    text('Breakdown', M, y, { size: 12, bold: true, color: DARK });
    y += 8;

    const catTotals: Record<string, number> = {};
    seasonExpenses.forEach((e) => { catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount); });
    const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const catRgb: Record<string, RGB> = { ground: [22, 163, 74], equipment: [59, 130, 246], tournament: [77, 187, 235], food: [239, 68, 68], other: [107, 114, 128] };
    const barMax = 80;

    catEntries.forEach(([cat, total]) => {
      checkPage(12);
      const cfg = getCategoryConfig(cat);
      const pct = Math.round((total / totalSpent) * 100);
      const barW = Math.max((total / totalSpent) * barMax, 3);
      const c = catRgb[cat] ?? [107, 114, 128];

      text(cfg.label, M + 3, y + 1, { size: 9, bold: true, color: DARK });

      // Background bar
      fillRect(M + 38, y - 2.5, barMax, 6, [238, 238, 238], 3);
      // Filled bar with rounded ends
      doc.setFillColor(...c);
      doc.roundedRect(M + 38, y - 2.5, barW, 6, 3, 3, 'F');

      text(`${formatCurrency(total)}`, M + 38 + barMax + 4, y + 1, { size: 9, bold: true, color: c });
      text(`${pct}%`, W - M, y + 1, { size: 8, color: GRAY, align: 'right' });
      y += 10;
    });
    y += 6;
  }

  // ═══ SQUAD TABLE ═══
  sectionHeader('TEAM SQUAD', `${activePlayers.length} players`, ORANGE);
  const squadRows = activePlayers.map((p) => {
    const tag = p.designation === 'captain' ? ' (C)' : p.designation === 'vice-captain' ? ' (VC)' : '';
    const role = p.player_role ? p.player_role.charAt(0).toUpperCase() + p.player_role.slice(1).replace('-', ' ') : '—';
    const style = [
      p.batting_style ? (p.batting_style === 'right' ? 'RHB' : 'LHB') : '',
      p.bowling_style ? p.bowling_style.charAt(0).toUpperCase() + p.bowling_style.slice(1) : '',
    ].filter(Boolean).join(' / ') || '—';
    return {
      cells: [p.jersey_number ? `#${p.jersey_number}` : '—', `${p.name}${tag}`, role, style],
      bold: [false, true, false, false],
      colors: [ORANGE, DARK, GRAY, LGRAY] as (RGB | null)[],
    };
  });
  // #(7%) Player(38%) Role(25%) Style(30%)
  drawTable(['Jersey', 'Player', 'Role', 'Style'], [8, 37, 25, 30], squadRows, ORANGE);

  // ═══ ADD FOOTER TO ALL PAGES ═══
  const total = pageCount();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...LGRAY);
    doc.text(`${TEAM_NAME}  |  ${season.name}`, M, H - 8);
    doc.text(`\u00A9 Designed by Bhaskar Mantrala`, W / 2, H - 8, { align: 'center' });
    doc.text(`Page ${i} of ${total}`, W - M, H - 8, { align: 'right' });
    doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.2);
    doc.line(M, H - 12, W - M, H - 12);
  }

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
            style={{ background: 'linear-gradient(135deg, var(--cricket-accent), var(--cricket))', color: '#fff', border: '1.5px solid var(--cricket-accent)' }}>
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
