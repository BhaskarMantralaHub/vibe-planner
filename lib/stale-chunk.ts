// Shared detection + one-time recovery for "stale chunk" errors.
//
// After a static-export redeploy, a browser holding stale HTML asks for a JS
// chunk hash that no longer exists → ChunkLoadError / "module factory is not
// available". A single hard reload fetches fresh HTML and recovers. This module
// is the ONE place that owns the detection regex, the storage key, and the
// guard logic — both ServiceWorkerRegister and SentryProvider import it so they
// can never drift apart.
//
// CRITICAL invariant: a genuinely broken deploy throws on EVERY load. The guard
// must reload at most ONCE per cooldown window and then let the error surface
// (so users see the error page + Sentry keeps the signal) instead of looping
// forever. The guard is a persisted TIMESTAMP, never a "clear on clean mount"
// flag — clearing on mount is what allows an infinite loop, because the page
// that shows the error also re-mounts sibling components.

// Phrasings across Turbopack / webpack / native-ESM for a missing-after-deploy
// chunk. Broad on purpose, but safe because the cooldown caps recovery at one
// reload and Sentry still captures the error on the non-recovered pass.
export const STALE_CHUNK_RE =
  /module factory is not available|ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|'?text\/html'? is not a valid JavaScript MIME type/i;

// Distinct keys so the two reload paths (stale-chunk recovery vs SW-update
// activation) each get their own independent cooldown.
const STALE_CHUNK_KEY = '__stale_chunk_reload__';
const SW_UPDATE_KEY = '__sw_update_reload__';
// Don't auto-reload again if we already reloaded within this window — a still-
// failing load proves the reload didn't help (not a stale cache), so surface it.
export const RELOAD_COOLDOWN_MS = 30_000;

export function isStaleChunkError(message: string | null | undefined): boolean {
  return typeof message === 'string' && message.length > 0 && STALE_CHUNK_RE.test(message);
}

/**
 * Hard-reload at most once per cooldown window, keyed by `key` (the timestamp
 * persists in sessionStorage, which survives a same-tab reload). Returns true
 * iff it triggered a reload. This is the ONLY loop backstop: a page that keeps
 * failing on every load reloads once, then this returns false so the failure
 * surfaces instead of looping.
 *
 * All storage access is wrapped — iOS Safari private mode throws on
 * sessionStorage, and the stale-chunk caller runs inside an error path where a
 * second throw would blank the screen. On any storage failure we decline to
 * reload (better a visible error than an unguarded loop).
 *
 * `now` is injectable for tests.
 */
export function reloadOnce(key: string, now: number = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(key)) || 0;
  } catch {
    return false;
  }
  if (last && now - last < RELOAD_COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(key, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * If `message` looks like a stale-chunk error, reload once (cooldown-guarded).
 * Returns true iff it triggered a reload (callers can render a blank
 * placeholder in that case).
 */
export function tryRecoverFromStaleChunk(
  message: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!isStaleChunkError(message)) return false;
  return reloadOnce(STALE_CHUNK_KEY, now);
}

/** Cooldown-guarded reload for a service-worker activation (controllerchange). */
export function reloadForSwUpdate(now: number = Date.now()): boolean {
  return reloadOnce(SW_UPDATE_KEY, now);
}
