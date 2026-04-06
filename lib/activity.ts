import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';

const DEDUP_KEY = 'activity_dedup';
const DEDUP_WINDOW = 5 * 60 * 1000; // 5 minutes

/// Read dedup map from sessionStorage (survives hard refresh)
function getDedupMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem(DEDUP_KEY) || '{}');
  } catch {
    return {};
  }
}

function setDedupMap(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DEDUP_KEY, JSON.stringify(map));
  } catch { /* storage full */ }
}

/// Lightweight fire-and-forget activity tracker.
/// Never blocks UI — all calls are async with no await.
export function trackActivity(userId: string, activityType: 'login' | 'page_view', pagePath?: string) {
  if (!isCloudMode()) return;

  // Dedup within window (prevents hard refresh + rapid nav spam)
  // page_view: 5 min window per path; login: once per session (30 min window)
  const dedupWindow = activityType === 'login' ? 30 * 60 * 1000 : DEDUP_WINDOW;
  const key = activityType === 'login' ? `${userId}:login` : `${userId}:${pagePath ?? ''}`;
  const map = getDedupMap();
  const lastTrack = map[key];
  if (lastTrack && Date.now() - lastTrack < dedupWindow) return;
  map[key] = Date.now();
  setDedupMap(map);

  const supabase = getSupabaseClient();
  if (!supabase) return;

  supabase
    .from('user_activity')
    .insert({ user_id: userId, activity_type: activityType, page_path: pagePath ?? null })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn('[activity] insert failed:', activityType, error.message);
    })
    .catch((err: unknown) => console.warn('[activity] network error:', activityType, err));
}
