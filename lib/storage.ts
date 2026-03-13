import type { Vibe } from '@/types/vibe';

const LOCAL_KEY = 'vibe_planner_data';
const TRASH_KEY = 'vibe_planner_trash';

export function localLoad(): Vibe[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Vibe[];
  } catch {
    return [];
  }
}

export function localSave(items: Vibe[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function loadTrash(): Array<Vibe & { deletedAt: string }> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TRASH_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveTrash(items: Array<Vibe & { deletedAt: string }>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TRASH_KEY, JSON.stringify(items));
  } catch {}
}

export function exportBackup(items: Vibe[]): void {
  const blob = new Blob([JSON.stringify(items, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vibe-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
