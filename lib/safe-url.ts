const STORAGE_PATH = /^\/storage\/[a-z0-9-]+\//;

/** Returns the URL only when it is an absolute https URL or a same-site /storage/ path, else null. */
export function safeHttpsUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  try {
    if (STORAGE_PATH.test(trimmed)) {
      const origin = window.location.origin;
      const parsed = new URL(trimmed, origin);
      return parsed.origin === origin && STORAGE_PATH.test(parsed.pathname) ? parsed.href : null;
    }
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Opens a stored receipt URL in a new tab; silently ignores unsafe values. */
export function openReceipt(url: string): void {
  const safe = safeHttpsUrl(url);
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
}
