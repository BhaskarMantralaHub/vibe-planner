/**
 * A printable settlement report — who pays whom for one season's splits.
 *
 * WHY THIS EXISTS AT ALL: the public web report is live and read-only, and the
 * only way to get the figures out of the app was the native share sheet, which
 * means sending a document you have never seen. This produces the same figures
 * as a document you can open, read, and then decide to send.
 *
 * NOTE ON THE SPLITS/PDF RULE: `CLAUDE.md` used to say splits are never
 * rendered into PDFs. That rule was about the POOL-FUND report — splits are
 * peer-to-peer money and must never be mixed into the club's pool totals. This
 * is a standalone splits document that touches no pool figure, which keeps the
 * rule's intent intact. CLAUDE.md has been updated to say exactly that.
 *
 * The arithmetic is NOT reimplemented here. `computeSettlements` is the one
 * engine; this module only groups its rows for print. A PDF that disagreed
 * with the Splits page or the shared link would be worse than no PDF.
 */

import { formatCents, type PairwiseLedger } from './settlement';

export type PdfPaymentRow = { toName: string; amountCents: number };

export type PdfPaymentGroup = {
  fromName: string;
  /** What this person owes in total, across everyone they owe. */
  totalCents: number;
  rows: PdfPaymentRow[];
};

export type SettlementPdfModel = {
  teamName: string;
  seasonName: string;
  generatedAt: Date;
  totalOutstandingCents: number;
  paymentCount: number;
  membersInvolved: number;
  /** One entry per person who owes something, largest debt first. */
  groups: PdfPaymentGroup[];
  allSettled: boolean;
};

/**
 * Group the pairwise ledger by PAYER, exactly as the public report does.
 *
 * Grouping matters: flat, one season is ~28 rows across 15 people while only a
 * few actually owe anything — a wall that answers nobody's question. One block
 * per person who owes turns it into "here is your bill".
 *
 * `nameOf` must return the FULL stored name. The app's short-label helper
 * shortens to a first name and only adds a surname when another name in the
 * set it was handed collides — but the set here is only people who still owe,
 * so a second Venkat who happens to be square is invisible to the collision
 * count. A line telling someone to send money cannot be ambiguous.
 */
export function buildSettlementPdfModel(args: {
  teamName: string;
  seasonName: string;
  ledger: PairwiseLedger;
  nameOf: (playerId: string) => string;
  generatedAt?: Date;
}): SettlementPdfModel {
  const { teamName, seasonName, ledger, nameOf } = args;
  const generatedAt = args.generatedAt ?? new Date();

  const byPayer = new Map<string, PdfPaymentGroup>();
  for (const r of ledger.rows) {
    const fromName = nameOf(r.fromId);
    const group = byPayer.get(r.fromId);
    const row: PdfPaymentRow = { toName: nameOf(r.toId), amountCents: r.amountCents };
    if (group) {
      group.rows.push(row);
      group.totalCents += r.amountCents;
    } else {
      byPayer.set(r.fromId, { fromName, totalCents: r.amountCents, rows: [row] });
    }
  }

  const groups = [...byPayer.values()]
    .map((g) => ({ ...g, rows: [...g.rows].sort((a, b) => b.amountCents - a.amountCents) }))
    .sort((a, b) => b.totalCents - a.totalCents || a.fromName.localeCompare(b.fromName));

  return {
    teamName,
    seasonName,
    generatedAt,
    totalOutstandingCents: ledger.totalCents,
    paymentCount: ledger.rows.length,
    membersInvolved: ledger.involvedIds.length,
    groups,
    allSettled: ledger.rows.length === 0,
  };
}

/**
 * The document's own title. A blob: URL carries no filename, so this is the
 * only name the reader ever sees — it becomes the browser tab's title and the
 * name every PDF reader displays. Without it the tab reads as a bare UUID.
 */
export function settlementPdfTitle(model: SettlementPdfModel): string {
  return `${model.teamName} — ${model.seasonName} settlement`;
}

type RGB = [number, number, number];

/* Print palette. The brand orange is the LIGHT-theme `--cricket` (#C2410C),
   not the dark-theme one — a PDF is always read on white. (The pool report's
   PDF still carries a blue left over from before the orange rebrand; not
   touched here, but worth knowing the two do not match.) */
const BRAND: RGB = [194, 65, 12];
const INK: RGB = [30, 30, 30];
const MUTED: RGB = [120, 120, 120];
const RULE: RGB = [225, 225, 228];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [200, 45, 45];
const GREEN: RGB = [5, 150, 105];

/**
 * Render the model to a jsPDF document.
 *
 * jspdf is imported dynamically — it is a large dependency and this is a
 * rarely-used action, so it must not sit in the initial bundle.
 */
export async function renderSettlementPdf(model: SettlementPdfModel) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // Metadata before anything is drawn. `title` is what the browser tab shows
  // when the blob opens — see settlementPdfTitle.
  doc.setProperties({
    title: settlementPdfTitle(model),
    subject: `Peer-to-peer split settlement for ${model.seasonName}`,
    creator: model.teamName,
  });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const TW = W - M * 2;
  let y = 0;

  const text = (
    s: string,
    x: number,
    yy: number,
    o?: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'center' | 'right' },
  ) => {
    doc.setFontSize(o?.size ?? 10);
    doc.setFont('helvetica', o?.bold ? 'bold' : 'normal');
    doc.setTextColor(...(o?.color ?? INK));
    doc.text(s, x, yy, { align: o?.align ?? 'left' });
  };

  const checkPage = (need = 14) => {
    if (y + need > H - 18) { doc.addPage(); y = M; }
  };

  // ── Banner ──────────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 30, 'F');
  text(model.teamName, M, 13, { size: 15, bold: true, color: WHITE });
  text(`${model.seasonName} · Settlement report`, M, 21, { size: 10, color: WHITE });
  y = 42;

  // ── Headline ────────────────────────────────────────────────────────────
  if (model.allSettled) {
    text('All settled', M, y, { size: 20, bold: true, color: GREEN });
    y += 8;
    text('No payments are currently needed.', M, y, { size: 10, color: MUTED });
    y += 12;
  } else {
    text('OUTSTANDING', M, y, { size: 8, bold: true, color: MUTED });
    y += 8;
    text(formatCents(model.totalOutstandingCents), M, y, { size: 24, bold: true, color: INK });
    y += 7;
    const people = `${model.membersInvolved} ${model.membersInvolved === 1 ? 'member' : 'members'} involved`;
    const payments = `${model.paymentCount} ${model.paymentCount === 1 ? 'payment' : 'payments'} needed`;
    text(`${payments} · ${people}`, M, y, { size: 10, color: MUTED });
    y += 12;
  }

  // ── One block per person who owes ───────────────────────────────────────
  for (const g of model.groups) {
    checkPage(14 + g.rows.length * 7);

    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(M, y, M + TW, y);
    y += 7;

    text(g.fromName, M, y, { size: 12, bold: true, color: INK });
    text(`Total to pay  ${formatCents(g.totalCents)}`, M + TW, y, {
      size: 10, bold: true, color: RED, align: 'right',
    });
    y += 7;

    for (const r of g.rows) {
      checkPage(8);
      text(`Pay ${r.toName}`, M + 4, y, { size: 10, color: INK });
      text(formatCents(r.amountCents), M + TW, y, { size: 10, color: INK, align: 'right' });
      y += 6;
    }
    y += 4;
  }

  // ── Footer on every page ────────────────────────────────────────────────
  // A PDF is a SNAPSHOT, unlike the live shared link. Saying so is the whole
  // difference between a stale number and a dated one.
  const stamp = model.generatedAt.toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    text(`Snapshot taken ${stamp} — balances change as expenses and settlements are added.`,
      M, H - 10, { size: 7.5, color: MUTED });
    text(`${p} / ${pages}`, M + TW, H - 10, { size: 7.5, color: MUTED, align: 'right' });
  }

  return doc;
}
