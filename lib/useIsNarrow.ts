'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

// Layout effects warn during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * True when the viewport is at/below `maxWidth` (default phone breakpoint).
 * Lazy-initialised from matchMedia so the FIRST client render is already correct —
 * this prevents the desktop→mobile layout flash on load. Safe to use only inside
 * client-rendered (post-mount) trees so there's no SSR hydration mismatch.
 */
export function useIsNarrow(maxWidth = 768): boolean {
    const [isNarrow, setIsNarrow] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches);
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
        const update = () => setIsNarrow(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, [maxWidth]);
    return isNarrow;
}

/**
 * False on the server and the first client render; true after mount. The flip is
 * committed via a layout effect (before the browser paints), so breakpoint-specific
 * UI deferred behind it swaps in without a visible flash. Use this to gate any UI
 * whose markup depends on `useIsNarrow` in a server-rendered (un-gated) component.
 */
export function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useIsoLayoutEffect(() => setMounted(true), []);
    return mounted;
}
