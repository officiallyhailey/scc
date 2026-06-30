'use client';

const DISPLAY = 'var(--font-display)';
const ITEMS = ['Expenses', 'Invoices', 'Vendors', 'Reports', 'Silk City'];

/**
 * Loading state shown while record data is being fetched (the Suspense fallback).
 * Instead of a spinner, the page-name marquee scrolls continuously — the same
 * giant-text style as the landing hero — until the data resolves and the real
 * interface replaces it. Lives inside the Shell, so it fills the area below the nav.
 */
export function MarqueeLoader() {
    return (
        <div style={{
            position: 'relative', flex: 1, minHeight: 0, width: '100%', overflow: 'hidden',
            background: 'var(--page)',
            backgroundImage: 'linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {/* Continuously scrolling page names */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', opacity: 0.1 }}>
                {Array.from({ length: 9 }).map((_, row) => {
                    const off = row % ITEMS.length;
                    const rowItems = [...ITEMS.slice(off), ...ITEMS.slice(0, off)];
                    return (
                        // width:max-content keeps the flex column from stretching the track,
                        // so the translateX(-50%) loop stays seamless.
                        <div key={row} className="dd-loader-row" style={{ flexShrink: 0, width: 'max-content', display: 'inline-flex', whiteSpace: 'nowrap', lineHeight: 1, animation: `ddMarquee ${15 + (row % 5) * 3}s linear infinite`, animationDirection: row % 2 ? 'reverse' : 'normal' }}>
                            {[0, 1].map(seq => (
                                <div key={seq} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                                    {rowItems.map((item, i) => (
                                        <span key={`${seq}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', fontFamily: DISPLAY, fontSize: 'clamp(48px, 13vw, 130px)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                                            <span style={{ padding: '0 0.22em' }}>{item}</span>
                                            <span style={{ fontSize: '0.4em' }}>✦</span>
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
