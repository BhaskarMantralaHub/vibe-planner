import { create } from 'zustand';

/**
 * Lightweight in-flight tracker for async work.
 * Increments via `beginLoad`, decrements via `endLoad`. The TopProgressBar
 * component subscribes to `inflightCount` and shows when count > 0.
 *
 * Pattern in stores:
 *   const ui = useUIStore.getState();
 *   ui.beginLoad();
 *   try { ...await...; } finally { ui.endLoad(); }
 *
 * Counter (not boolean) so concurrent loads don't race — e.g. loadSplits +
 * loadCricketData firing in parallel both decrement on completion.
 */
interface UIState {
  inflightCount: number;
  beginLoad: () => void;
  endLoad: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  inflightCount: 0,
  beginLoad: () => set({ inflightCount: get().inflightCount + 1 }),
  endLoad: () => set({ inflightCount: Math.max(0, get().inflightCount - 1) }),
}));
