'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const formatter = (decimals: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

// Ease-out cubic — perceptually identical to motion's overdamped spring (60/100)
// for the values this component animates (single/double-digit counters).
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function NumberTicker({
  value,
  direction = 'up',
  delay = 0,
  className,
  decimalPlaces = 0,
  duration = 1000,
}: {
  value: number;
  direction?: 'up' | 'down';
  className?: string;
  delay?: number;
  decimalPlaces?: number;
  /** Animation duration in ms. Default 1000. */
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  // Trigger once when the element scrolls into view.
  useEffect(() => {
    if (!ref.current || inView) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.unobserve(entry.target);
            break;
          }
        }
      },
      { rootMargin: '0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  // Drive the count-up via requestAnimationFrame.
  useEffect(() => {
    if (!inView || !ref.current) return;

    const from = direction === 'down' ? value : 0;
    const to = direction === 'down' ? 0 : value;
    const fmt = formatter(decimalPlaces);

    let startTime: number | null = null;
    let raf = 0;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(t);
      const current = from + (to - from) * eased;
      if (ref.current) {
        ref.current.textContent = fmt.format(Number(current.toFixed(decimalPlaces)));
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    const delayTimer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay * 1000);

    return () => {
      clearTimeout(delayTimer);
      cancelAnimationFrame(raf);
    };
  }, [inView, value, direction, delay, decimalPlaces, duration]);

  return (
    <span
      className={cn('inline-block tabular-nums tracking-wider', className)}
      ref={ref}
    />
  );
}
