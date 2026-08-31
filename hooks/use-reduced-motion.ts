'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the viewer has asked the OS to reduce motion.
 *
 * Extracted from CricketSectionNav, which had the only copy. A second caller
 * (the animated counters in the cricket dashboard's stat tiles) needed it, and
 * a hook duplicated in two files drifts — one gets the `change` listener and
 * the other doesn't.
 *
 * Starts `false` and corrects in an effect rather than reading matchMedia
 * during render: the app is statically exported, so a render-time read would
 * produce different HTML on the server and the client and desync hydration.
 * The consequence is one frame of "motion allowed" before it settles, which is
 * the right trade — the alternative is a hydration mismatch on every page.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export default useReducedMotion;
