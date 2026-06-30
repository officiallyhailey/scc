import type React from 'react';

/**
 * Shared sizing for every detail/popup modal so they share one outline across
 * pages and devices: 80vw on desktop, full-screen (100vw) on mobile, always
 * starting below the nav bar so the close button is reachable.
 *
 * Each modal spreads these and adds its own scrim / surface / border so the
 * theme stays per-interface while the dimensions stay consistent.
 */
export function modalOverlayStyle(isNarrow: boolean): React.CSSProperties {
    return {
        position: 'fixed',
        top: 'var(--nav-h)',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isNarrow ? 0 : '16px',
    };
}

export function modalCardStyle(isNarrow: boolean): React.CSSProperties {
    return {
        position: 'relative',
        width: isNarrow ? '100vw' : '80vw',
        maxWidth: isNarrow ? '100vw' : '80vw',
        height: isNarrow ? '100%' : undefined,
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    };
}
