import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeHttpsUrl, openReceipt } from '@/lib/safe-url';

describe('safeHttpsUrl', () => {
  it('accepts absolute https URLs', () => {
    expect(safeHttpsUrl('https://x.supabase.co/storage/v1/object/public/r/a.jpg')).toBe(
      'https://x.supabase.co/storage/v1/object/public/r/a.jpg',
    );
  });

  it.each([
    'javascript:alert(document.domain)',
    ' JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com/a.jpg',
    '/relative/path.jpg',
    'vbscript:msgbox(1)',
    '',
  ])('rejects %s', (url) => {
    expect(safeHttpsUrl(url)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl(42)).toBeNull();
  });
});

describe('openReceipt', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens https URLs with noopener,noreferrer', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openReceipt('https://example.com/r.pdf');
    expect(open).toHaveBeenCalledWith('https://example.com/r.pdf', '_blank', 'noopener,noreferrer');
  });

  it('never opens a javascript: URL', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openReceipt('javascript:alert(1)');
    expect(open).not.toHaveBeenCalled();
  });
});
