/** Returns the URL only when it is an absolute https URL, else null. */
export function safeHttpsUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Opens a stored receipt URL in a new tab; silently ignores non-https values. */
export function openReceipt(url: string): void {
  const safe = safeHttpsUrl(url);
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
}
