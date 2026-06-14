import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isStaleChunkError,
  tryRecoverFromStaleChunk,
  reloadForSwUpdate,
  RELOAD_COOLDOWN_MS,
} from '@/lib/stale-chunk';

// jsdom doesn't implement navigation; replace window.location with a stub that
// records reload() calls.
let reloadMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sessionStorage.clear();
  reloadMock = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload: reloadMock },
  });
});

describe('isStaleChunkError', () => {
  it('matches known stale-chunk phrasings', () => {
    for (const m of [
      'Error: Module .../chart-column-big.js ... but the module factory is not available.',
      'ChunkLoadError: Loading chunk 273 failed.',
      'Loading chunk abc-123 failed',
      'Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js',
      "Failed to load module script: 'text/html' is not a valid JavaScript MIME type.",
    ]) {
      expect(isStaleChunkError(m)).toBe(true);
    }
  });

  it('does NOT match unrelated runtime errors', () => {
    for (const m of [
      "Cannot read properties of undefined (reading 'map')",
      'TypeError: x is not a function',
      'Network request failed',
      '',
      null,
      undefined,
    ]) {
      expect(isStaleChunkError(m)).toBe(false);
    }
  });
});

describe('tryRecoverFromStaleChunk — loop guard', () => {
  const STALE = 'Error: the module factory is not available';

  it('reloads once on the first stale-chunk error', () => {
    expect(tryRecoverFromStaleChunk(STALE, 1_000)).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload again within the cooldown (the critical anti-loop case)', () => {
    expect(tryRecoverFromStaleChunk(STALE, 1_000)).toBe(true);
    // Simulate the page reloading and immediately throwing the SAME error again
    // (a genuinely broken deploy, not a one-time stale cache).
    expect(tryRecoverFromStaleChunk(STALE, 1_000 + RELOAD_COOLDOWN_MS - 1)).toBe(false);
    expect(tryRecoverFromStaleChunk(STALE, 1_000 + RELOAD_COOLDOWN_MS - 1)).toBe(false);
    expect(reloadMock).toHaveBeenCalledTimes(1); // still only ONE reload
  });

  it('allows another reload after the cooldown elapses (a later deploy)', () => {
    expect(tryRecoverFromStaleChunk(STALE, 1_000)).toBe(true);
    expect(tryRecoverFromStaleChunk(STALE, 1_000 + RELOAD_COOLDOWN_MS + 1)).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(2);
  });

  it('never reloads for a non-stale error', () => {
    expect(tryRecoverFromStaleChunk('TypeError: boom', 1_000)).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does not throw or reload when sessionStorage is blocked (iOS private mode)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => tryRecoverFromStaleChunk(STALE, 1_000)).not.toThrow();
    expect(tryRecoverFromStaleChunk(STALE, 1_000)).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe('reloadForSwUpdate — cooldown-guarded SW-update reload', () => {
  it('reloads once, then is capped within the cooldown', () => {
    expect(reloadForSwUpdate(1_000)).toBe(true);
    expect(reloadForSwUpdate(1_000 + RELOAD_COOLDOWN_MS - 1)).toBe(false);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('uses a separate key from stale-chunk recovery (paths do not block each other)', () => {
    // A stale-chunk reload must not consume the SW path's budget, and vice versa.
    expect(tryRecoverFromStaleChunk('the module factory is not available', 1_000)).toBe(true);
    expect(reloadForSwUpdate(1_000)).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(2);
  });
});
