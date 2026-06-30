'use client';

import { useEffect, useState } from 'react';

/** True when the viewport is at/below `maxWidth` (default phone breakpoint). */
export function useIsNarrow(maxWidth = 768): boolean {
    const [isNarrow, setIsNarrow] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
        const update = () => setIsNarrow(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, [maxWidth]);
    return isNarrow;
}
