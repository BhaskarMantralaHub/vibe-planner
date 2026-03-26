'use client';

import { useState, useEffect } from 'react';

/// Detects the mobile virtual keyboard height using the VisualViewport API.
/// Returns 0 when no keyboard is visible. Works on iOS Safari, Android Chrome.
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function onResize() {
      // Keyboard height = full window minus visible viewport
      const kbHeight = Math.round(window.innerHeight - vv!.height);
      setKeyboardHeight(kbHeight > 0 ? kbHeight : 0);
    }

    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  return keyboardHeight;
}
