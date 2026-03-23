import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Vibe } from '@/types/vibe';

// Mock supabase client (not used by storage but may be imported transitively)
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => null,
  isCloudMode: () => false,
}));

// Set up localStorage mock before importing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    _getStore: () => store,
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { localLoad, localSave, loadTrash, saveTrash, exportBackup } from '@/lib/storage';

const sampleVibe: Vibe = {
  id: 'v-1',
  user_id: 'u-1',
  text: 'Test vibe',
  status: 'spark',
  category: null,
  time_spent: 0,
  notes: '',
  due_date: null,
  position: 0,
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

describe('lib/storage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ─── localLoad ─────────────────────────────────────────────────────

  describe('localLoad', () => {
    it('returns empty array when localStorage has no data', () => {
      expect(localLoad()).toEqual([]);
    });

    it('returns parsed vibes from valid JSON', () => {
      const vibes = [sampleVibe];
      localStorageMock.setItem('vibe_planner_data', JSON.stringify(vibes));

      const result = localLoad();
      expect(result).toEqual(vibes);
    });

    it('returns empty array for invalid JSON', () => {
      localStorageMock.setItem('vibe_planner_data', 'not valid json{{{');

      // getItem returns the invalid string, JSON.parse throws, catch returns []
      localStorageMock.getItem.mockReturnValueOnce('not valid json{{{');
      const result = localLoad();
      expect(result).toEqual([]);
    });

    it('returns empty array when key has null value', () => {
      // Default behavior: getItem returns null for missing keys
      const result = localLoad();
      expect(result).toEqual([]);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('vibe_planner_data');
    });

    it('returns multiple vibes correctly', () => {
      const vibes = [
        sampleVibe,
        { ...sampleVibe, id: 'v-2', text: 'Second vibe', position: 1 },
      ];
      localStorageMock.setItem('vibe_planner_data', JSON.stringify(vibes));

      const result = localLoad();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('v-1');
      expect(result[1].id).toBe('v-2');
    });
  });

  // ─── localSave ─────────────────────────────────────────────────────

  describe('localSave', () => {
    it('saves serialized data to localStorage', () => {
      const vibes = [sampleVibe];
      localSave(vibes);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'vibe_planner_data',
        JSON.stringify(vibes),
      );
    });

    it('saves empty array', () => {
      localSave([]);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'vibe_planner_data',
        '[]',
      );
    });

    it('handles storage full error gracefully (no throw)', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new DOMException('QuotaExceededError');
      });

      // Should not throw
      expect(() => localSave([sampleVibe])).not.toThrow();
    });

    it('saves multiple vibes', () => {
      const vibes = [sampleVibe, { ...sampleVibe, id: 'v-2' }];
      localSave(vibes);

      const saved = localStorageMock._getStore()['vibe_planner_data'];
      expect(JSON.parse(saved)).toHaveLength(2);
    });
  });

  // ─── loadTrash ─────────────────────────────────────────────────────

  describe('loadTrash', () => {
    it('returns empty array when no trash data', () => {
      expect(loadTrash()).toEqual([]);
    });

    it('returns parsed trash items from valid JSON', () => {
      const trashItems = [{ ...sampleVibe, deletedAt: '2026-03-20T00:00:00Z' }];
      localStorageMock.setItem('vibe_planner_trash', JSON.stringify(trashItems));

      const result = loadTrash();
      expect(result).toEqual(trashItems);
    });

    it('returns empty array for invalid JSON in trash', () => {
      localStorageMock.setItem('vibe_planner_trash', '{broken');
      localStorageMock.getItem.mockReturnValueOnce('{broken');

      const result = loadTrash();
      expect(result).toEqual([]);
    });

    it('returns empty array when key is null', () => {
      const result = loadTrash();
      expect(result).toEqual([]);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('vibe_planner_trash');
    });
  });

  // ─── saveTrash ─────────────────────────────────────────────────────

  describe('saveTrash', () => {
    it('saves trash items to localStorage', () => {
      const trashItems = [{ ...sampleVibe, deletedAt: '2026-03-20T00:00:00Z' }];
      saveTrash(trashItems);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'vibe_planner_trash',
        JSON.stringify(trashItems),
      );
    });

    it('saves empty trash array', () => {
      saveTrash([]);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'vibe_planner_trash',
        '[]',
      );
    });

    it('handles storage full error gracefully', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new DOMException('QuotaExceededError');
      });

      expect(() => saveTrash([{ ...sampleVibe, deletedAt: '2026-03-20T00:00:00Z' }])).not.toThrow();
    });
  });

  // ─── exportBackup ──────────────────────────────────────────────────

  describe('exportBackup', () => {
    it('creates a download link and triggers click', () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:test');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(window, 'URL', {
        value: { createObjectURL, revokeObjectURL },
        writable: true,
      });

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(mockAnchor as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(mockAnchor as any);

      exportBackup([sampleVibe]);

      expect(createObjectURL).toHaveBeenCalled();
      expect(mockAnchor.href).toBe('blob:test');
      expect(mockAnchor.download).toMatch(/^vibe-planner-backup-\d{4}-\d{2}-\d{2}\.json$/);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });
  });
});
