import type { SplitCategory } from '@/types/cricket';

/** iOS Safari can discard a backgrounded tab; a NEW split's fields survive the
 *  reload here (receipts can't — files don't serialise). Edits aren't drafted:
 *  they reload from the saved split. */
export const SPLIT_FORM_KEY = 'cricket_split_form_draft';
export type SplitDraft = {
  amount: string; description: string; category: SplitCategory; paidById: string | null;
  playerIds: string[]; splitType: 'equal' | 'custom'; customAmounts: Record<string, string>;
};
export function readSplitDraft(): SplitDraft | null {
  try {
    const raw = sessionStorage.getItem(SPLIT_FORM_KEY);
    return raw ? (JSON.parse(raw) as SplitDraft) : null;
  } catch { return null; }
}
