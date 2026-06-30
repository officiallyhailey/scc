'use client';

import { useEffect, useState } from 'react';

/**
 * Fixed accent bar at the very top of the page showing scroll progress.
 *
 * A single capture-phase scroll listener on `window` catches scrolls from ANY
 * container — the window itself (landing / about / login) or a nested scroll
 * region (the full-screen interfaces scroll inner panels, not the window). The
 * bar grows/shrinks as the user scrolls either direction and emits a small
 * "ping" once they reach the bottom.
 */
export function ScrollProgress() {
    const [progress, setProgress] = useState(0);
    const [atBottom, setAtBottom] = useState(false);

    useEffect(() => {
        const measure = (el: HTMLElement | null) => {
            const scrollTop = el ? el.scrollTop : window.scrollY;
            const scrollHeight = el ? el.scrollHeight : document.documentElement.scrollHeight;
            const clientHeight = el ? el.clientHeight : window.innerHeight;
            const max = scrollHeight - clientHeight;
            const p = max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0;
            setProgress(p);
            setAtBottom(max > 8 && p >= 0.995);
        };

        // Coalesce to one measurement per animation frame so the bar stays glued
        // to the scroll position without layout thrash or visible lag.
        let frame = 0;
        const schedule = (el: HTMLElement | null) => {
            if (frame) return;
            frame = requestAnimationFrame(() => { frame = 0; measure(el); });
        };

        const onScroll = (e: Event) => {
            const t = e.target as Node | null;
            // Window/document scroll reports `document` as the target.
            if (!t || t === document || t === document.documentElement || t === document.body) {
                schedule(null);
            } else if (t instanceof HTMLElement) {
                schedule(t);
            }
        };
        const onResize = () => measure(null);

        measure(null);
        // Capture phase is required: scroll events don't bubble, but they can be
        // caught on the way down — this is what lets one listener track every
        // nested scroll container on the page.
        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        window.addEventListener('resize', onResize);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            window.removeEventListener('scroll', onScroll, { capture: true });
            window.removeEventListener('resize', onResize);
        };
    }, []);

    return (
        <div aria-hidden style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '8px', zIndex: 2000, pointerEvents: 'none' }}>
            <div style={{ position: 'relative', height: '100%', width: `${progress * 100}%`, background: 'var(--accent)' }}>
                {atBottom && (
                    <span className="dd-ping" style={{ position: 'absolute', right: 0, top: '50%', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', transform: 'translate(50%, -50%)' }} />
                )}
            </div>
        </div>
    );
}
